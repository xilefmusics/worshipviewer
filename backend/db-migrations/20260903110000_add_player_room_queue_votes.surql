-- Queue votes are persisted separately from immutable queue song snapshots so
-- each participant can toggle one vote per queued song without exposing voter
-- identities in the public room payload.
UPDATE player_room SET queue_votes_json = "{}" WHERE queue_votes_json = NONE;
DEFINE FIELD OVERWRITE queue_votes_json ON player_room TYPE string DEFAULT "{}" PERMISSIONS FULL;
