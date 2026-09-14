-- Host email is derived from the room's authenticated host session user.
UPDATE player_room UNSET host_email;
REMOVE FIELD IF EXISTS host_email ON player_room;
