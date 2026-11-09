-- Rename the current room record and visit tables while preserving their data.
DEFINE TABLE OVERWRITE room TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE owner ON room TYPE record<team> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE name ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE content_json ON room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE created_at ON room TYPE datetime DEFAULT time::now() PERMISSIONS FULL;

INSERT INTO room (SELECT * FROM message_room);
DEFINE INDEX OVERWRITE room_owner_idx ON room FIELDS owner;

DEFINE TABLE OVERWRITE room_visit TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE room ON room_visit TYPE any PERMISSIONS FULL;
DEFINE FIELD OVERWRITE user_id ON room_visit TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE display_name ON room_visit TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE resume_hash ON room_visit TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_hash ON room_visit TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_expires_at ON room_visit TYPE option<datetime> PERMISSIONS FULL;

INSERT INTO room_visit (SELECT * FROM message_room_visit);
UPDATE room_visit SET room = type::record('room', record::id(room));
DEFINE FIELD OVERWRITE room ON room_visit TYPE record<room> PERMISSIONS FULL;
DEFINE INDEX OVERWRITE room_visit_resume_idx ON room_visit FIELDS room, user_id, resume_hash UNIQUE;
DEFINE INDEX OVERWRITE room_visit_ticket_idx ON room_visit FIELDS ticket_hash UNIQUE;

DEFINE FIELD OVERWRITE room ON room_change TYPE any PERMISSIONS FULL;
UPDATE room_change SET room = type::record('room', record::id(room));
DEFINE FIELD OVERWRITE room ON room_change TYPE record<room> PERMISSIONS FULL;

REMOVE TABLE message_room_visit;
REMOVE TABLE message_room;
