-- The room_session record id is the canonical session identity.
-- Remove the duplicated application-level session_id field and its index.

REMOVE INDEX IF EXISTS room_session_identity_idx ON room_session;
UPDATE room_session UNSET session_id;
REMOVE FIELD IF EXISTS session_id ON room_session;
