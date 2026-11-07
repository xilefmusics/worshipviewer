-- Replacement room cutover. Back up the database and stop/drain old room clients
-- before applying: room records and their session rows are intentionally deleted.
DEFINE TABLE OVERWRITE message_room TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE owner ON message_room TYPE record<team> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE name ON message_room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE content_json ON message_room TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE created_at ON message_room TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE INDEX OVERWRITE message_room_owner_idx ON message_room FIELDS owner;

DEFINE TABLE OVERWRITE room_change TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE room ON room_change TYPE record<message_room> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE epoch ON room_change TYPE int PERMISSIONS FULL;
DEFINE FIELD OVERWRITE sequence ON room_change TYPE int PERMISSIONS FULL;
DEFINE FIELD OVERWRITE message_json ON room_change TYPE string PERMISSIONS FULL;
DEFINE INDEX OVERWRITE room_change_order_idx ON room_change FIELDS room, epoch, sequence UNIQUE;

DEFINE TABLE OVERWRITE message_room_visit TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE room ON message_room_visit TYPE record<message_room> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE user_id ON message_room_visit TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE display_name ON message_room_visit TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE resume_hash ON message_room_visit TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_hash ON message_room_visit TYPE option<string> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE ticket_expires_at ON message_room_visit TYPE option<datetime> PERMISSIONS FULL;
DEFINE INDEX OVERWRITE message_room_visit_resume_idx ON message_room_visit FIELDS room, user_id, resume_hash UNIQUE;
DEFINE INDEX OVERWRITE message_room_visit_ticket_idx ON message_room_visit FIELDS ticket_hash UNIQUE;

DEFINE TABLE OVERWRITE room_message_epoch TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE value ON room_message_epoch TYPE int DEFAULT 0 PERMISSIONS FULL;
CREATE room_message_epoch:global SET value = 0;

DELETE room_session;
DELETE room;
REMOVE TABLE room_session;
REMOVE TABLE room;
