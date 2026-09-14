-- Replace the historical player-prefixed room table names with their canonical names.
-- INSERT preserves record ids while changing the table component of each id.

DEFINE TABLE OVERWRITE room TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE owner ON room TYPE record<team> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE name ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE content_json ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE musical_state_json ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE queue_json ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE queue_votes_json ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE projection_json ON room TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE revision ON room TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE invite_hash ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE host_session_id ON room TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE av_session_id ON room TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE created_at ON room TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE closed_at ON room TYPE none | datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE queue_additions_allowed ON room TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guest_access_allowed ON room TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE new_joins_locked ON room TYPE bool DEFAULT false PERMISSIONS FULL;

DEFINE TABLE OVERWRITE room_session TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE room ON room_session TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE session_id ON room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE user_id ON room_session TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guest_display_name ON room_session TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE mode ON room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE hide_chords ON room_session TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE resume_hash ON room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_hash ON room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE expires_at ON room_session TYPE datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE consumed_at ON room_session TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE connected ON room_session TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE lease_expires_at ON room_session TYPE datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE joined_at ON room_session TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE connection_generation ON room_session TYPE string PERMISSIONS FULL;

INSERT INTO room (SELECT * FROM player_room);
INSERT INTO room_session (SELECT * FROM player_room_session);

UPDATE room_session SET room = type::record('room', record::id(room));
UPDATE room SET
    host_session_id = type::record('room_session', record::id(host_session_id)),
    av_session_id = IF type::is_none(av_session_id)
        THEN NONE
        ELSE type::record('room_session', record::id(av_session_id))
    END;

DEFINE FIELD OVERWRITE room ON room_session TYPE record<room> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE host_session_id ON room TYPE record<room_session> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE av_session_id ON room TYPE option<record<room_session>> PERMISSIONS FULL;

DEFINE INDEX OVERWRITE room_owner_idx ON room FIELDS owner;
DEFINE INDEX OVERWRITE room_invite_hash_idx ON room FIELDS invite_hash UNIQUE;
DEFINE INDEX OVERWRITE room_active_owner_idx ON room FIELDS owner, closed_at;
DEFINE INDEX OVERWRITE room_session_room_idx ON room_session FIELDS room;
DEFINE INDEX OVERWRITE room_session_identity_idx ON room_session FIELDS room, session_id UNIQUE;
DEFINE INDEX OVERWRITE room_session_resume_hash_idx ON room_session FIELDS resume_hash UNIQUE;
DEFINE INDEX OVERWRITE room_session_ticket_hash_idx ON room_session FIELDS ticket_hash UNIQUE;

REMOVE TABLE player_room_session;
REMOVE TABLE player_room;
