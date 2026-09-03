-- Separate the selected Collection/Setlist source from access to the wider library.
UPDATE player_room SET song_pool_json = "null" WHERE song_pool_json = "{\"type\":\"open\"}";
UPDATE player_room SET open = true WHERE open = NONE;
DEFINE FIELD OVERWRITE song_pool_json ON player_room TYPE string DEFAULT "null" PERMISSIONS FULL;
DEFINE FIELD OVERWRITE open ON player_room TYPE bool DEFAULT true PERMISSIONS FULL;
