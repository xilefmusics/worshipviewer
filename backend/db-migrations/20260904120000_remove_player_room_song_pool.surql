-- Selected Room song pools are removed; preserve open, queue, vote, and media state.
UPDATE player_room SET song_pool_json = "null";
REMOVE FIELD IF EXISTS song_pool_json ON player_room;
UPDATE player_room UNSET song_pool_json;
