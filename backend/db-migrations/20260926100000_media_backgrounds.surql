DEFINE FIELD OVERWRITE is_background ON media TYPE bool DEFAULT false VALUE $value ?? $before ?? false PERMISSIONS FULL;
UPDATE media SET is_background = false WHERE is_background = NONE;
DEFINE INDEX OVERWRITE media_background_idx ON media FIELDS is_background CONCURRENTLY;
