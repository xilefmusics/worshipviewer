-- Player Room queue entries are immutable song snapshots. The queue itself is
-- mutable room state and is updated together with the room revision.
UPDATE player_room SET queue_json = "[]" WHERE queue_json = NONE;
DEFINE FIELD OVERWRITE queue_json ON player_room TYPE string DEFAULT "[]" PERMISSIONS FULL;
