//! Storage for immutable replacement rooms and append-only message history.

use std::sync::Arc;

use anyhow::{Context, Result, bail};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use shared::{
    room::RoomContent,
    room_message::{MessageRoomSummary, RoomChange, RoomMessage, RoomMessageOrder},
};
use surrealdb::types::{RecordId, SurrealValue};

use crate::database::Database;
use crate::resources::surreal_json::JsonObject;

#[derive(Debug, Clone, Deserialize, SurrealValue)]
struct StoredRoom {
    id: RecordId,
    owner: RecordId,
    name: String,
    content: JsonObject<RoomContent>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct StoredMessage {
    message_id: String,
    room: RecordId,
    visit_id: String,
    epoch: i64,
    sequence: i64,
    change: JsonObject<RoomChange>,
}

impl StoredMessage {
    fn into_message(self) -> Result<RoomMessage> {
        Ok(RoomMessage {
            id: self.message_id,
            room_id: crate::database::record_id_string(&self.room),
            visit_id: self.visit_id,
            order: RoomMessageOrder {
                epoch: u64::try_from(self.epoch).context("invalid stored message epoch")?,
                sequence: u64::try_from(self.sequence)
                    .context("invalid stored message sequence")?,
            },
            change: self.change.0,
        })
    }
}

#[derive(Debug, Deserialize, SurrealValue)]
struct Epoch {
    value: i64,
}

#[derive(Debug, Deserialize, SurrealValue)]
struct ConsumedTicket {
    id: RecordId,
    room: RecordId,
    display_name: String,
}

/// The immutable data copied at room creation.
#[derive(Debug, Clone, PartialEq)]
pub struct CapturedRoom {
    pub owner: RecordId,
    pub name: String,
    pub content: RoomContent,
}

#[derive(Clone)]
pub struct MessageRoomStore {
    db: Arc<Database>,
}

impl MessageRoomStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub async fn create(&self, id: &str, room: &CapturedRoom) -> Result<()> {
        let response = self
            .db
            .db
            .query("CREATE $id SET owner = $owner, name = $name, content = $content")
            .bind(("id", RecordId::new("room", id.to_owned())))
            .bind(("owner", room.owner.clone()))
            .bind(("name", room.name.clone()))
            .bind(("content", JsonObject(room.content.clone())))
            .await?;
        response.check()?;
        Ok(())
    }

    pub async fn list(
        &self,
        owners: &[RecordId],
        query: Option<&str>,
    ) -> Result<Vec<MessageRoomSummary>> {
        let mut response = self.db.db.query("SELECT id, owner, name, content, created_at FROM room WHERE owner IN $owners ORDER BY created_at DESC")
            .bind(("owners", owners.to_vec())).await?;
        let rows: Vec<StoredRoom> = response.take(0)?;
        let query = query
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_lowercase);
        let mut summaries = Vec::with_capacity(rows.len());
        for row in rows {
            if query
                .as_ref()
                .is_some_and(|q| !row.name.to_lowercase().contains(q))
            {
                continue;
            }
            summaries.push(MessageRoomSummary {
                id: crate::database::record_id_string(&row.id),
                name: row.name,
                team_id: crate::database::record_id_string(&row.owner),
                song_count: row.content.0.items.len(),
                can_delete: false,
                created_at: row.created_at,
            });
        }
        Ok(summaries)
    }

    pub async fn get(&self, id: &str) -> Result<Option<CapturedRoom>> {
        Ok(self
            .get_with_created_at(id)
            .await?
            .map(|(room, _created_at)| room))
    }

    pub async fn get_with_created_at(
        &self,
        id: &str,
    ) -> Result<Option<(CapturedRoom, DateTime<Utc>)>> {
        let mut response = self
            .db
            .db
            .query("SELECT id, owner, name, content, created_at FROM ONLY $id")
            .bind(("id", RecordId::new("room", id.to_owned())))
            .await?;
        let room: Option<StoredRoom> = response.take(0)?;
        room.map(|room| {
            let created_at = room.created_at;
            let captured = CapturedRoom {
                owner: room.owner,
                name: room.name,
                content: room.content.0,
            };
            Ok((captured, created_at))
        })
        .transpose()
    }

    pub async fn summary(&self, id: &str) -> Result<Option<MessageRoomSummary>> {
        let Some(room) = self.get_record(id).await? else {
            return Ok(None);
        };
        Ok(Some(MessageRoomSummary {
            id: crate::database::record_id_string(&room.id),
            team_id: crate::database::record_id_string(&room.owner),
            name: room.name,
            song_count: room.content.0.items.len(),
            can_delete: false,
            created_at: room.created_at,
        }))
    }

    async fn get_record(&self, id: &str) -> Result<Option<StoredRoom>> {
        let mut response = self
            .db
            .db
            .query("SELECT id, owner, name, content, created_at FROM ONLY $id")
            .bind(("id", RecordId::new("room", id.to_owned())))
            .await?;
        Ok(response.take(0)?)
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let room = RecordId::new("room", id.to_owned());
        let response = self.db.db.query("BEGIN TRANSACTION; DELETE room_change WHERE room = $room; DELETE room_visit WHERE room = $room; DELETE $room; COMMIT TRANSACTION;")
            .bind(("room", room)).await?;
        response.check()?;
        Ok(true)
    }

    pub async fn create_visit(
        &self,
        room_id: &str,
        user_id: &str,
        display_name: &str,
        resume_hash: &str,
        ticket_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let response = self.db.db.query("CREATE $id SET room = $room, user_id = $user, display_name = $display_name, resume_hash = $resume_hash, ticket_hash = $ticket_hash, ticket_expires_at = $expires_at")
            .bind(("id", RecordId::new("room_visit", id.clone())))
            .bind(("room", RecordId::new("room", room_id.to_owned())))
            .bind(("user", RecordId::new("user", user_id.to_owned())))
            .bind(("display_name", display_name.to_owned()))
            .bind(("resume_hash", resume_hash.to_owned()))
            .bind(("ticket_hash", ticket_hash.to_owned()))
            .bind(("expires_at", expires_at)).await?;
        response.check()?;
        Ok(id)
    }

    pub async fn resume_visit(
        &self,
        room_id: &str,
        user_id: &str,
        resume_hash: &str,
    ) -> Result<Option<String>> {
        let mut response = self.db.db.query("SELECT VALUE id FROM room_visit WHERE room = $room AND user_id = $user AND resume_hash = $resume_hash LIMIT 1")
            .bind(("room", RecordId::new("room", room_id.to_owned())))
            .bind(("user", RecordId::new("user", user_id.to_owned())))
            .bind(("resume_hash", resume_hash.to_owned())).await?;
        let rows: Vec<RecordId> = response.take(0)?;
        Ok(rows.first().map(crate::database::record_id_string))
    }

    pub async fn refresh_ticket(
        &self,
        visit_id: &str,
        room_id: &str,
        user_id: &str,
        ticket_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<()> {
        let response = self.db.db.query("UPDATE ONLY $id SET ticket_hash = $ticket_hash, ticket_expires_at = $expires_at WHERE room = $room AND user_id = $user")
            .bind(("id", RecordId::new("room_visit", visit_id.to_owned())))
            .bind(("room", RecordId::new("room", room_id.to_owned())))
            .bind(("user", RecordId::new("user", user_id.to_owned())))
            .bind(("ticket_hash", ticket_hash.to_owned())).bind(("expires_at", expires_at)).await?;
        response.check()?;
        Ok(())
    }

    pub async fn consume_ticket(
        &self,
        ticket_hash: &str,
    ) -> Result<Option<(String, String, String)>> {
        let mut response = self.db.db.query("UPDATE room_visit SET ticket_hash = NONE, ticket_expires_at = NONE WHERE ticket_hash = $ticket_hash AND ticket_expires_at > time::now() RETURN BEFORE")
            .bind(("ticket_hash", ticket_hash.to_owned())).await?;
        let rows: Vec<ConsumedTicket> = response.take(0)?;
        Ok(rows.into_iter().next().map(|row| {
            (
                crate::database::record_id_string(&row.room),
                crate::database::record_id_string(&row.id),
                row.display_name,
            )
        }))
    }

    pub async fn visitor_matches(
        &self,
        room_id: &str,
        user_id: &str,
        resume_hash: &str,
    ) -> Result<bool> {
        let mut response = self.db.db.query("SELECT VALUE id FROM room_visit WHERE room = $room AND user_id = $user AND resume_hash = $resume_hash LIMIT 1")
            .bind(("room", RecordId::new("room", room_id.to_owned())))
            .bind(("user", RecordId::new("user", user_id.to_owned())))
            .bind(("resume_hash", resume_hash.to_owned())).await?;
        let rows: Vec<RecordId> = response.take(0)?;
        Ok(!rows.is_empty())
    }

    /// Reserve before accepting any message in a new process. Never infer the
    /// next epoch from saved messages, since the last broadcast may be missing.
    pub async fn reserve_epoch(&self) -> Result<u64> {
        let mut response = self
            .db
            .db
            .query("UPDATE ONLY room_message_epoch:global SET value += 1 RETURN AFTER")
            .await?;
        let epoch: Option<Epoch> = response.take(0)?;
        let value = epoch.context("room message epoch missing")?.value;
        u64::try_from(value).context("invalid room message epoch")
    }

    /// A message ID is uniquely scoped to a room. A retry with the same full
    /// envelope succeeds; conflicting content or order is rejected.
    pub async fn append(&self, message: &RoomMessage) -> Result<()> {
        let key = format!("{}:{}", message.room_id.len(), message.room_id) + &message.id;
        let digest = ring::digest::digest(&ring::digest::SHA256, key.as_bytes());
        let id = RecordId::new("room_change", hex::encode(digest.as_ref()));
        let epoch = i64::try_from(message.order.epoch)?;
        let sequence = i64::try_from(message.order.sequence)?;
        if epoch <= 0 || sequence <= 0 || message.id.is_empty() || message.visit_id.is_empty() {
            bail!("invalid message envelope");
        }
        let result = self.db.db.query("CREATE $id SET message_id = $message_id, room = $room, visit_id = $visit_id, epoch = $epoch, sequence = $sequence, change = $change")
            .bind(("id", id.clone())).bind(("room", RecordId::new("room", message.room_id.clone())))
            .bind(("message_id", message.id.clone())).bind(("visit_id", message.visit_id.clone()))
            .bind(("epoch", epoch)).bind(("sequence", sequence))
            .bind(("change", JsonObject(message.change.clone()))).await;
        match result.and_then(|response| response.check()) {
            Ok(_) => Ok(()),
            Err(error) => {
                let mut response = self
                    .db
                    .db
                    .query(
                        "SELECT message_id, room, visit_id, epoch, sequence, change FROM ONLY $id",
                    )
                    .bind(("id", id))
                    .await?;
                let existing: Option<StoredMessage> = response.take(0)?;
                if existing
                    .map(StoredMessage::into_message)
                    .transpose()?
                    .as_ref()
                    == Some(message)
                {
                    Ok(())
                } else {
                    Err(error.into())
                }
            }
        }
    }

    pub async fn history(
        &self,
        room_id: &str,
        boundary: RoomMessageOrder,
    ) -> Result<Vec<RoomMessage>> {
        let epoch = i64::try_from(boundary.epoch)?;
        let sequence = i64::try_from(boundary.sequence)?;
        let mut response = self.db.db.query("SELECT message_id, room, visit_id, epoch, sequence, change FROM room_change WHERE room = $room AND (epoch < $epoch OR (epoch = $epoch AND sequence <= $sequence)) ORDER BY epoch ASC, sequence ASC")
            .bind(("room", RecordId::new("room", room_id.to_owned())))
            .bind(("epoch", epoch)).bind(("sequence", sequence)).await?;
        let rows: Vec<StoredMessage> = response.take(0)?;
        rows.into_iter().map(StoredMessage::into_message).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shared::room_message::RoomChange;

    fn message(epoch: u64, sequence: u64, id: &str) -> RoomMessage {
        RoomMessage {
            id: id.into(),
            room_id: "r".into(),
            visit_id: "visit".into(),
            order: RoomMessageOrder { epoch, sequence },
            change: RoomChange::Vote {
                song: 0,
                voted: true,
            },
        }
    }

    #[tokio::test]
    async fn immutable_room_and_ordered_idempotent_history_survive_new_store() {
        let db = crate::test_helpers::test_db().await.unwrap();
        let store = MessageRoomStore::new(db.clone());
        let room = CapturedRoom {
            owner: RecordId::new("team", "t"),
            name: "Fixed".into(),
            content: RoomContent {
                items: vec![],
                toc: vec![],
            },
        };
        store.create("r", &room).await.unwrap();
        assert_eq!(store.get("r").await.unwrap(), Some(room.clone()));
        assert!(store.create("r", &room).await.is_err());
        let first_epoch = store.reserve_epoch().await.unwrap();
        let first = message(first_epoch, 1, "one");
        let third = message(first_epoch, 3, "three");
        store.append(&third).await.unwrap();
        store.append(&first).await.unwrap();
        store.append(&first).await.unwrap();
        let mut conflict = first.clone();
        conflict.change = RoomChange::Vote {
            song: 0,
            voted: false,
        };
        assert!(store.append(&conflict).await.is_err());
        assert!(
            store
                .append(&message(first_epoch, 1, "other"))
                .await
                .is_err()
        );
        let restarted = MessageRoomStore::new(db);
        let next_epoch = restarted.reserve_epoch().await.unwrap();
        assert!(next_epoch > first_epoch);
        let next = message(next_epoch, 1, "next");
        restarted.append(&next).await.unwrap();
        assert_eq!(
            restarted.history("r", third.order).await.unwrap(),
            vec![first.clone(), third.clone()]
        );
        assert_eq!(
            restarted.history("r", next.order).await.unwrap(),
            vec![first, third, next]
        );
    }
}
