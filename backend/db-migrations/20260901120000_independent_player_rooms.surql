-- Player Rooms can now be created without a song, collection, or setlist.
DEFINE FIELD OVERWRITE source_type ON player_room TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE source_id ON player_room TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE source_title ON player_room TYPE none | string PERMISSIONS FULL;

-- Account identity owns the room; participant IDs remain connection-scoped authority.
DEFINE FIELD OVERWRITE host_user_id ON player_room TYPE none | string PERMISSIONS FULL;

-- Preserve rooms whose host lease is still current, but classify rooms that
-- already expired before the lifetime rule changed so they are not resurrected.
UPDATE player_room
SET closed_at = time::now()
WHERE closed_at = NONE AND host_lease_expires_at <= time::now();

DEFINE INDEX OVERWRITE player_room_active_owner_idx ON player_room FIELDS owner, closed_at CONCURRENTLY;
