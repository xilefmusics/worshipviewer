-- Give player_room boolean fields names that describe the access they control.
DEFINE FIELD OVERWRITE queue_additions_allowed ON player_room TYPE none | bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guest_access_allowed ON player_room TYPE none | bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE new_joins_locked ON player_room TYPE none | bool DEFAULT false PERMISSIONS FULL;

UPDATE player_room SET queue_additions_allowed = open WHERE queue_additions_allowed = NONE;
UPDATE player_room SET guest_access_allowed = guests_allowed WHERE guest_access_allowed = NONE;
UPDATE player_room SET new_joins_locked = locked WHERE new_joins_locked = NONE;

DEFINE FIELD OVERWRITE open ON player_room TYPE none | bool PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guests_allowed ON player_room TYPE none | bool PERMISSIONS FULL;
DEFINE FIELD OVERWRITE locked ON player_room TYPE none | bool PERMISSIONS FULL;

UPDATE player_room UNSET open;
UPDATE player_room UNSET guests_allowed;
UPDATE player_room UNSET locked;

REMOVE FIELD IF EXISTS open ON player_room;
REMOVE FIELD IF EXISTS guests_allowed ON player_room;
REMOVE FIELD IF EXISTS locked ON player_room;

DEFINE FIELD OVERWRITE queue_additions_allowed ON player_room TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE guest_access_allowed ON player_room TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE new_joins_locked ON player_room TYPE bool DEFAULT false PERMISSIONS FULL;
