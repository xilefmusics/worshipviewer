-- A player-room ticket represents the participant's connection session.
DEFINE TABLE OVERWRITE player_room_session TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE room ON player_room_session TYPE record<player_room> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE participant_id ON player_room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_hash ON player_room_session TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE expires_at ON player_room_session TYPE datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE consumed_at ON player_room_session TYPE none | datetime PERMISSIONS FULL;
DEFINE INDEX OVERWRITE player_room_session_hash_idx ON player_room_session FIELDS ticket_hash UNIQUE CONCURRENTLY;
