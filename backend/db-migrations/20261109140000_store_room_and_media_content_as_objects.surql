-- Convert serialized room and media payloads into native SurrealDB objects.
DEFINE FIELD OVERWRITE content ON room TYPE object FLEXIBLE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE content ON media TYPE object FLEXIBLE ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE pending_revision ON media TYPE option<object> FLEXIBLE PERMISSIONS FULL;

UPDATE room SET content = encoding::json::decode(content_json);
UPDATE media SET
    content = encoding::json::decode(content_json),
    pending_revision = IF type::is_none(pending_revision_json)
        THEN NONE
        ELSE encoding::json::decode(pending_revision_json)
    END;

UPDATE room UNSET content_json;
UPDATE media UNSET content_json;
UPDATE media UNSET pending_revision_json;

REMOVE FIELD IF EXISTS content_json ON room;
REMOVE FIELD IF EXISTS content_json ON media;
REMOVE FIELD IF EXISTS pending_revision_json ON media;
