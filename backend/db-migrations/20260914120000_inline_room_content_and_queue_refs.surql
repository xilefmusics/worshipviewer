-- Room content is now stored directly on player_room, and queue entries only
-- reference the captured content by song ID. Existing rooms use the legacy
-- queue shape, so invalidate them before removing the old snapshot table.
DELETE player_room_session;
DELETE player_room_snapshot;
DELETE player_room;

REMOVE TABLE player_room_snapshot;

DEFINE FIELD OVERWRITE content_json ON player_room TYPE string PERMISSIONS FULL;
