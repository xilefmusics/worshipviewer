-- Room sessions are the durable room identities.  Existing participant rows are
-- converted to one canonical session row; short-lived ticket rows are invalidated.

DEFINE FIELD OVERWRITE session_id ON player_room_session TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE participant_id ON player_room_session TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE room ON player_room_session TYPE record<player_room> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE user_id ON player_room_session TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guest_display_name ON player_room_session TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE mode ON player_room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE hide_chords ON player_room_session TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE resume_hash ON player_room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_hash ON player_room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE expires_at ON player_room_session TYPE datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE consumed_at ON player_room_session TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE connected ON player_room_session TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE lease_expires_at ON player_room_session TYPE datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE joined_at ON player_room_session TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE connection_generation ON player_room_session TYPE string PERMISSIONS FULL;

DELETE player_room_session;

INSERT INTO player_room_session (
    SELECT VALUE {
        id: type::record(
            'player_room_session',
            string::concat(record::id(room), ':', participant_id)
        ),
        room: room,
        session_id: participant_id,
        user_id: IF type::is_none(user_id)
            THEN NONE
            ELSE type::record('user', user_id)
        END,
        guest_display_name: IF anonymous THEN display_name ELSE NONE END,
        mode: mode,
        hide_chords: hide_chords,
        resume_hash: resume_hash,
        ticket_hash: string::concat('migrated-', record::id(id)),
        expires_at: time::now(),
        consumed_at: time::now(),
        connected: connected,
        lease_expires_at: lease_expires_at,
        joined_at: joined_at,
        connection_generation: string::concat('migrated-', record::id(id))
    } FROM player_room_participant
);

DEFINE FIELD OVERWRITE host_session_id ON player_room TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE av_session_id ON player_room TYPE any PERMISSIONS FULL;

UPDATE player_room SET
    host_session_id = type::record('player_room_session', record::id(host_participant_id)),
    av_session_id = IF type::is_none(av_participant_id)
        THEN NONE
        ELSE type::record('player_room_session', record::id(av_participant_id))
    END;

DEFINE FIELD OVERWRITE host_session_id ON player_room TYPE record<player_room_session> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE av_session_id ON player_room TYPE option<record<player_room_session>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE host_participant_id ON player_room TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE av_participant_id ON player_room TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE host_user_id ON player_room TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE host_lease_expires_at ON player_room TYPE any PERMISSIONS FULL;
UPDATE player_room UNSET host_participant_id, av_participant_id, host_user_id, host_lease_expires_at;
REMOVE FIELD IF EXISTS host_participant_id ON player_room;
REMOVE FIELD IF EXISTS av_participant_id ON player_room;
REMOVE FIELD IF EXISTS host_user_id ON player_room;
REMOVE FIELD IF EXISTS host_lease_expires_at ON player_room;

REMOVE TABLE player_room_participant;
REMOVE FIELD IF EXISTS participant_id ON player_room_session;
DEFINE FIELD OVERWRITE session_id ON player_room_session TYPE string PERMISSIONS FULL;
DEFINE INDEX OVERWRITE player_room_session_room_idx ON player_room_session FIELDS room CONCURRENTLY;
DEFINE INDEX OVERWRITE player_room_session_identity_idx ON player_room_session FIELDS room, session_id UNIQUE CONCURRENTLY;
DEFINE INDEX OVERWRITE player_room_session_resume_hash_idx ON player_room_session FIELDS resume_hash UNIQUE CONCURRENTLY;
DEFINE INDEX OVERWRITE player_room_session_ticket_hash_idx ON player_room_session FIELDS ticket_hash UNIQUE CONCURRENTLY;
