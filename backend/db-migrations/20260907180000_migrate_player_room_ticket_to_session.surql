-- Move existing short-lived connection sessions after the replacement table has been committed.
INSERT INTO player_room_session (SELECT * FROM player_room_ticket);
REMOVE TABLE player_room_ticket;
