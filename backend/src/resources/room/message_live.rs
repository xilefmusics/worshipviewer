//! Process-local ordering and asynchronous persistence for message rooms.

use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::Duration,
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use shared::room_message::{RoomChange, RoomMessage, RoomMessageOrder};
use tokio::sync::{Notify, broadcast, mpsc};

use super::message_store::MessageRoomStore;

#[async_trait]
pub trait MessageWriter: Send + Sync + 'static {
    async fn append(&self, message: &RoomMessage) -> anyhow::Result<()>;
}

#[async_trait]
impl MessageWriter for MessageRoomStore {
    async fn append(&self, message: &RoomMessage) -> anyhow::Result<()> {
        self.append(message).await
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AcceptError {
    #[error("invalid message")]
    Invalid,
    #[error("message ID reused with different content")]
    Conflict,
    #[error("room order exhausted")]
    Exhausted,
}

struct State {
    sequence: u64,
    seen: HashMap<String, RoomMessage>,
    seen_order: VecDeque<String>,
    pending: BTreeSet<u64>,
}

const RECENT_MESSAGE_IDS: usize = 4096;

/// One instance per active room. The epoch must already have been reserved in
/// durable storage. Receivers must disconnect and rejoin on broadcast lag.
pub struct MessageRoomLive {
    room_id: String,
    epoch: u64,
    sections: Vec<usize>,
    state: Arc<Mutex<State>>,
    wake: Arc<Notify>,
    outgoing: broadcast::Sender<RoomMessage>,
    persistence: mpsc::Sender<RoomMessage>,
}

impl MessageRoomLive {
    pub fn new(
        room_id: String,
        epoch: u64,
        sections: Vec<usize>,
        writer: Arc<dyn MessageWriter>,
        queue_limit: usize,
        client_buffer: usize,
    ) -> Self {
        assert!(epoch > 0 && queue_limit > 0 && client_buffer > 0);
        let state = Arc::new(Mutex::new(State {
            sequence: 0,
            seen: HashMap::new(),
            seen_order: VecDeque::new(),
            pending: BTreeSet::new(),
        }));
        let wake = Arc::new(Notify::new());
        let (outgoing, _) = broadcast::channel(client_buffer);
        let (persistence, mut receiver) = mpsc::channel::<RoomMessage>(queue_limit);
        let worker_state = state.clone();
        let worker_wake = wake.clone();
        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                let mut saved = false;
                for attempt in 0..3 {
                    match tokio::time::timeout(Duration::from_secs(2), writer.append(&message))
                        .await
                    {
                        Ok(Ok(())) => {
                            saved = true;
                            break;
                        }
                        Ok(Err(error)) => {
                            tracing::warn!(%error, attempt, "room message persistence failed")
                        }
                        Err(_) => tracing::warn!(attempt, "room message persistence timed out"),
                    }
                    if attempt < 2 {
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
                if !saved {
                    tracing::error!("room message persistence abandoned after retries");
                }
                worker_state
                    .lock()
                    .expect("room lock poisoned")
                    .pending
                    .remove(&message.order.sequence);
                worker_wake.notify_waiters();
            }
        });
        Self {
            room_id,
            epoch,
            sections,
            state,
            wake,
            outgoing,
            persistence,
        }
    }

    /// Captures a boundary and starts the bounded live buffer in one critical
    /// section. Drain only messages after this boundary when replay finishes.
    pub fn subscribe(&self) -> (RoomMessageOrder, broadcast::Receiver<RoomMessage>) {
        let state = self.state.lock().expect("room lock poisoned");
        let receiver = self.outgoing.subscribe();
        (
            RoomMessageOrder {
                epoch: self.epoch,
                sequence: state.sequence,
            },
            receiver,
        )
    }

    /// Called with an identity already established by authentication. No DB
    /// operations occur on the serialized acceptance and fan-out path.
    pub fn accept(
        &self,
        id: String,
        visit_id: String,
        change: RoomChange,
    ) -> Result<RoomMessage, AcceptError> {
        if id.is_empty() || id.len() > 128 || visit_id.is_empty() || visit_id.len() > 128 {
            return Err(AcceptError::Invalid);
        }
        match change {
            RoomChange::Vote { song, .. } if song >= self.sections.len() => {
                return Err(AcceptError::Invalid);
            }
            RoomChange::Selection {
                song,
                section,
                slide,
                ..
            } if self
                .sections
                .get(song)
                .is_none_or(|&count| section.unwrap_or(slide) >= count) =>
            {
                return Err(AcceptError::Invalid);
            }
            RoomChange::SetBackground { ref background } if !background.is_valid() => {
                return Err(AcceptError::Invalid);
            }
            RoomChange::SetAvConfiguration { ref configuration }
                if !configuration.is_valid(self.sections.len()) =>
            {
                return Err(AcceptError::Invalid);
            }
            _ => {}
        }
        let mut state = self.state.lock().expect("room lock poisoned");
        if let Some(previous) = state.seen.get(&id) {
            return if previous.visit_id == visit_id && previous.change == change {
                Ok(previous.clone())
            } else {
                Err(AcceptError::Conflict)
            };
        }
        let sequence = state
            .sequence
            .checked_add(1)
            .ok_or(AcceptError::Exhausted)?;
        let message = RoomMessage {
            id: id.clone(),
            room_id: self.room_id.clone(),
            visit_id,
            order: RoomMessageOrder {
                epoch: self.epoch,
                sequence,
            },
            change,
        };
        state.sequence = sequence;
        state.seen.insert(id.clone(), message.clone());
        state.seen_order.push_back(id);
        if state.seen_order.len() > RECENT_MESSAGE_IDS
            && let Some(expired_id) = state.seen_order.pop_front()
        {
            state.seen.remove(&expired_id);
        }
        let _ = self.outgoing.send(message.clone());
        // Insert before sending so a worker cannot finish before it is tracked.
        state.pending.insert(sequence);
        if self.persistence.try_send(message.clone()).is_err() {
            state.pending.remove(&sequence);
            tracing::warn!("room persistence queue full or closed; message omitted from history");
        }
        Ok(message)
    }

    /// Wait for queued writes up to a boundary, not for deliberately dropped
    /// messages. The caller must impose a join timeout and then read storage.
    pub async fn wait_for_persistence(&self, boundary: RoomMessageOrder) {
        loop {
            let notified = self.wake.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            let pending = {
                let state = self.state.lock().expect("room lock poisoned");
                boundary.epoch == self.epoch
                    && state.pending.range(..=boundary.sequence).next().is_some()
            };
            if !pending {
                return;
            }
            notified.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::room_message::{
        RoomAvConfiguration, RoomAvContentLayer, RoomAvHorizontalAlign, RoomAvScreenState,
        RoomAvTextAlign, RoomAvTextShadow, RoomAvTextTransform, RoomAvTransition,
        RoomAvTransitionStyle, RoomAvVerticalAlign, RoomBackground, RoomBackgroundImage,
    };
    use tokio::sync::Semaphore;

    struct StalledWriter {
        started: mpsc::UnboundedSender<RoomMessage>,
        permits: Semaphore,
        saved: Mutex<Vec<RoomMessage>>,
    }

    #[async_trait]
    impl MessageWriter for StalledWriter {
        async fn append(&self, message: &RoomMessage) -> anyhow::Result<()> {
            self.started.send(message.clone())?;
            self.permits.acquire().await?.forget();
            self.saved.lock().unwrap().push(message.clone());
            Ok(())
        }
    }

    fn vote(voted: bool) -> RoomChange {
        RoomChange::Vote { song: 0, voted }
    }

    fn av_configuration() -> RoomAvConfiguration {
        RoomAvConfiguration {
            content_layer: RoomAvContentLayer {
                max_lines_per_slide: 4,
                balance_slide_lines: true,
                font_size: 50,
                text_align: RoomAvTextAlign::Center,
                vertical_align: RoomAvVerticalAlign::Center,
                horizontal_align: RoomAvHorizontalAlign::Center,
                text_shadow: RoomAvTextShadow::Subtle,
                text_transform: RoomAvTextTransform::None,
                primary_text_lightness: 100,
                secondary_text_lightness: 80,
            },
            transition: RoomAvTransition {
                style: RoomAvTransitionStyle::Fade,
                duration_ms: 300,
            },
            bilingual_enabled: true,
            collapse_lyric_whitespace: false,
            language_by_item: std::collections::BTreeMap::from([(String::from("0"), 1)]),
            screen_state: RoomAvScreenState::Live,
        }
    }

    #[tokio::test]
    async fn stalled_writer_does_not_block_fanout_and_later_writes_resume() {
        let (started, mut writes) = mpsc::unbounded_channel();
        let writer = Arc::new(StalledWriter {
            started,
            permits: Semaphore::new(0),
            saved: Mutex::new(vec![]),
        });
        let room = MessageRoomLive::new("r".into(), 1, vec![1], writer.clone(), 1, 8);
        let (initial, mut first_receiver) = room.subscribe();
        assert_eq!(initial.sequence, 0);
        let one = room.accept("one".into(), "a".into(), vote(true)).unwrap();
        assert_eq!(writes.recv().await.unwrap(), one);
        let two = room.accept("two".into(), "b".into(), vote(true)).unwrap();
        let three = room
            .accept("three".into(), "a".into(), vote(false))
            .unwrap();
        assert_eq!(first_receiver.recv().await.unwrap(), one);
        assert_eq!(first_receiver.recv().await.unwrap(), two);
        assert_eq!(first_receiver.recv().await.unwrap(), three);
        let (boundary, mut joining) = room.subscribe();
        let four = room.accept("four".into(), "b".into(), vote(false)).unwrap();
        assert_eq!(joining.recv().await.unwrap(), four);
        assert!(
            tokio::time::timeout(
                Duration::from_millis(20),
                room.wait_for_persistence(boundary)
            )
            .await
            .is_err()
        );
        writer.permits.add_permits(2);
        assert_eq!(writes.recv().await.unwrap(), two);
        tokio::time::timeout(Duration::from_secs(1), room.wait_for_persistence(boundary))
            .await
            .unwrap();
        let five = room.accept("five".into(), "a".into(), vote(true)).unwrap();
        assert_eq!(writes.recv().await.unwrap(), five);
        writer.permits.add_permits(1);
        tokio::time::timeout(
            Duration::from_secs(1),
            room.wait_for_persistence(five.order),
        )
        .await
        .unwrap();
        assert_eq!(*writer.saved.lock().unwrap(), vec![one, two, five]);
    }

    #[tokio::test]
    async fn validates_and_serializes_changes_and_detects_slow_receivers() {
        let (started, _writes) = mpsc::unbounded_channel();
        let writer = Arc::new(StalledWriter {
            started,
            permits: Semaphore::new(10),
            saved: Mutex::new(vec![]),
        });
        let room = Arc::new(MessageRoomLive::new("r".into(), 7, vec![1], writer, 32, 2));
        let (_, mut receiver) = room.subscribe();
        assert_eq!(
            room.accept(
                "bad".into(),
                "v".into(),
                RoomChange::Selection {
                    song: 0,
                    section: Some(1),
                    slide: 1,
                    activate: true
                }
            ),
            Err(AcceptError::Invalid)
        );
        assert_eq!(
            room.accept(
                "bad-background".into(),
                "v".into(),
                RoomChange::SetBackground {
                    background: RoomBackground {
                        preset: 5,
                        image: None,
                    },
                }
            ),
            Err(AcceptError::Invalid)
        );
        let mut invalid_configuration = av_configuration();
        invalid_configuration.content_layer.max_lines_per_slide = 0;
        assert_eq!(
            room.accept(
                "bad-av-configuration".into(),
                "v".into(),
                RoomChange::SetAvConfiguration {
                    configuration: invalid_configuration,
                },
            ),
            Err(AcceptError::Invalid)
        );
        let first = room.accept("same".into(), "v".into(), vote(true)).unwrap();
        assert_eq!(
            room.accept("same".into(), "v".into(), vote(true)).unwrap(),
            first
        );
        let background = room
            .accept(
                "background".into(),
                "v".into(),
                RoomChange::SetBackground {
                    background: RoomBackground {
                        preset: 2,
                        image: Some(RoomBackgroundImage {
                            media_id: "media:one".into(),
                            asset_id: "asset:one".into(),
                        }),
                    },
                },
            )
            .unwrap();
        assert_eq!(receiver.recv().await.unwrap(), first);
        assert_eq!(receiver.recv().await.unwrap(), background);
        let configuration = room
            .accept(
                "av-configuration".into(),
                "host".into(),
                RoomChange::SetAvConfiguration {
                    configuration: av_configuration(),
                },
            )
            .unwrap();
        assert_eq!(receiver.recv().await.unwrap(), configuration);
        assert_eq!(
            room.accept("same".into(), "other".into(), vote(true)),
            Err(AcceptError::Conflict)
        );
        let mut tasks = vec![];
        for i in 0..10 {
            let room = room.clone();
            tasks.push(tokio::spawn(async move {
                room.accept(format!("id-{i}"), "v".into(), vote(true))
                    .unwrap()
                    .order
                    .sequence
            }));
        }
        let mut sequences = vec![];
        for task in tasks {
            sequences.push(task.await.unwrap());
        }
        sequences.sort();
        assert_eq!(sequences, (4..=13).collect::<Vec<_>>());
        assert!(matches!(
            receiver.recv().await,
            Err(broadcast::error::RecvError::Lagged(_))
        ));
    }
}

/// Presence is process-local and never part of the shared message history.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct OnlineVisit {
    pub visit_id: String,
    pub display_name: String,
    pub joined_at: DateTime<Utc>,
}

struct VisitPresence {
    display_name: String,
    joined_at: DateTime<Utc>,
    connections: std::collections::HashSet<String>,
    generation: u64,
}

struct PresenceInner {
    visits: std::collections::BTreeMap<String, VisitPresence>,
    connection_count: usize,
    events: broadcast::Sender<Vec<OnlineVisit>>,
}

const MAX_PRESENCE_VISITS: usize = 500;
const MAX_PRESENCE_CONNECTIONS: usize = 1000;
const MAX_CONNECTIONS_PER_VISIT: usize = 4;

#[derive(Clone)]
pub struct RoomPresence {
    inner: Arc<Mutex<PresenceInner>>,
    grace: Duration,
}

impl PresenceInner {
    fn members(&self) -> Vec<OnlineVisit> {
        self.visits
            .iter()
            .map(|(visit_id, visit)| OnlineVisit {
                visit_id: visit_id.clone(),
                display_name: visit.display_name.clone(),
                joined_at: visit.joined_at,
            })
            .collect()
    }
    fn publish(&self) {
        let _ = self.events.send(self.members());
    }
}

impl RoomPresence {
    pub fn new(grace: Duration, client_buffer: usize) -> Self {
        let (events, _) = broadcast::channel(client_buffer);
        Self {
            inner: Arc::new(Mutex::new(PresenceInner {
                visits: Default::default(),
                connection_count: 0,
                events,
            })),
            grace,
        }
    }

    /// Subscribe and read the current replacement list without a race.
    pub fn subscribe(&self) -> (Vec<OnlineVisit>, broadcast::Receiver<Vec<OnlineVisit>>) {
        let inner = self.inner.lock().expect("presence lock poisoned");
        (inner.members(), inner.events.subscribe())
    }

    /// Each socket must use a distinct connection ID; multiple sockets still
    /// count as a single online visit.
    pub fn connect(&self, visit_id: String, connection_id: String, display_name: String) -> bool {
        let mut inner = self.inner.lock().expect("presence lock poisoned");
        let was_present = inner.visits.contains_key(&visit_id);
        if (!was_present && inner.visits.len() >= MAX_PRESENCE_VISITS)
            || inner.connection_count >= MAX_PRESENCE_CONNECTIONS
        {
            return false;
        }
        let visit = inner
            .visits
            .entry(visit_id)
            .or_insert_with(|| VisitPresence {
                display_name: display_name.clone(),
                joined_at: Utc::now(),
                connections: Default::default(),
                generation: 0,
            });
        let name_changed = visit.display_name != display_name;
        visit.display_name = display_name;
        if !visit.connections.contains(&connection_id)
            && visit.connections.len() >= MAX_CONNECTIONS_PER_VISIT
        {
            return false;
        }
        if visit.connections.insert(connection_id) {
            visit.generation = visit.generation.wrapping_add(1);
            inner.connection_count += 1;
        }
        if !was_present || name_changed {
            inner.publish();
        }
        true
    }

    pub fn disconnect(&self, visit_id: &str, connection_id: &str) {
        let mut inner = self.inner.lock().expect("presence lock poisoned");
        let (generation, has_connections) = {
            let Some(visit) = inner.visits.get_mut(visit_id) else {
                return;
            };
            if !visit.connections.remove(connection_id) {
                return;
            }
            visit.generation = visit.generation.wrapping_add(1);
            (visit.generation, !visit.connections.is_empty())
        };
        inner.connection_count = inner.connection_count.saturating_sub(1);
        if has_connections {
            return;
        }
        let visit_id = visit_id.to_owned();
        let shared = self.inner.clone();
        let grace = self.grace;
        tokio::spawn(async move {
            tokio::time::sleep(grace).await;
            let mut inner = shared.lock().expect("presence lock poisoned");
            if inner
                .visits
                .get(&visit_id)
                .is_some_and(|visit| visit.generation == generation && visit.connections.is_empty())
            {
                inner.visits.remove(&visit_id);
                inner.publish();
            }
        });
    }
}

#[cfg(test)]
mod presence_tests {
    use super::*;

    #[tokio::test]
    async fn reconnect_and_concurrent_sockets_keep_one_visit_until_grace_expires() {
        let presence = RoomPresence::new(Duration::from_millis(40), 8);
        let (initial, mut events) = presence.subscribe();
        assert!(initial.is_empty());
        presence.connect("v".into(), "first".into(), "Alex".into());
        assert_eq!(events.recv().await.unwrap().len(), 1);
        presence.connect("v".into(), "second".into(), "Alex".into());
        presence.disconnect("v", "first");
        presence.disconnect("v", "second");
        tokio::time::sleep(Duration::from_millis(15)).await;
        presence.connect("v".into(), "third".into(), "Alex".into());
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert_eq!(presence.subscribe().0.len(), 1);
        assert!(events.try_recv().is_err());
        presence.disconnect("v", "third");
        assert!(
            tokio::time::timeout(Duration::from_secs(1), events.recv())
                .await
                .unwrap()
                .unwrap()
                .is_empty()
        );
    }
}

#[cfg(test)]
mod handoff_tests {
    use super::super::message_store::CapturedRoom;
    use super::*;
    use shared::room::RoomContent;
    use surrealdb::types::RecordId;

    #[tokio::test]
    async fn boundary_replay_and_live_buffer_cover_concurrent_changes() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let store = Arc::new(MessageRoomStore::new(db));
        store
            .create(
                "room",
                &CapturedRoom {
                    owner: RecordId::new("team", "team"),
                    name: "Room".into(),
                    content: RoomContent {
                        items: vec![],
                        toc: vec![],
                    },
                },
            )
            .await
            .unwrap();
        let epoch = store.reserve_epoch().await.unwrap();
        let room = MessageRoomLive::new("room".into(), epoch, vec![1], store.clone(), 8, 8);
        let first = room
            .accept(
                "first".into(),
                "a".into(),
                RoomChange::Vote {
                    song: 0,
                    voted: true,
                },
            )
            .unwrap();
        let (boundary, mut buffered) = room.subscribe();
        let second = room
            .accept(
                "second".into(),
                "b".into(),
                RoomChange::Selection {
                    song: 0,
                    section: Some(0),
                    slide: 0,
                    activate: true,
                },
            )
            .unwrap();
        tokio::time::timeout(Duration::from_secs(2), room.wait_for_persistence(boundary))
            .await
            .unwrap();
        assert_eq!(store.history("room", boundary).await.unwrap(), vec![first]);
        assert_eq!(buffered.recv().await.unwrap(), second);
    }
}
