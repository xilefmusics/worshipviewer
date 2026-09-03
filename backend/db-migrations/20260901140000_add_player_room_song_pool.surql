-- Persist the host-controlled source for future Player Room queue additions.
DEFINE FIELD OVERWRITE song_pool_json ON player_room TYPE string DEFAULT '{"type":"open"}' PERMISSIONS FULL;
