-- Let hosts prevent new participants from joining without ending the room.
DEFINE FIELD OVERWRITE locked ON player_room TYPE bool DEFAULT false PERMISSIONS FULL;
