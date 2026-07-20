-- Player-room persistence is request/event driven from this migration onward.
-- Legacy rooms used process-local state and cannot be resumed safely after the
-- deployment rollback, so close them once while retaining their records.
UPDATE player_room SET closed_at = time::now() WHERE closed_at = NONE;

DEFINE FIELD OVERWRITE state_json ON player_room TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE snapshot_json ON player_room TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE musical_state_json ON player_room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE projection_json ON player_room TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guests_allowed ON player_room TYPE bool DEFAULT true PERMISSIONS FULL;

DEFINE FIELD OVERWRITE hide_chords ON player_room_participant TYPE bool DEFAULT false PERMISSIONS FULL;

DEFINE TABLE OVERWRITE player_room_snapshot SCHEMAFULL;
DEFINE FIELD OVERWRITE room ON player_room_snapshot TYPE record<player_room> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE content_json ON player_room_snapshot TYPE string PERMISSIONS FULL;
DEFINE INDEX OVERWRITE player_room_snapshot_room_idx ON player_room_snapshot FIELDS room UNIQUE;

DEFINE INDEX OVERWRITE player_room_active_owner_idx ON player_room FIELDS owner, closed_at, host_lease_expires_at CONCURRENTLY;
DEFINE INDEX OVERWRITE player_room_participant_active_idx ON player_room_participant FIELDS room, lease_expires_at CONCURRENTLY;
