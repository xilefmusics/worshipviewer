-- Keep indexed envelope fields once and store the tagged change as a native object.
DEFINE FIELD OVERWRITE message_id ON room_change TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE visit_id ON room_change TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE change ON room_change TYPE object FLEXIBLE PERMISSIONS FULL;

UPDATE room_change SET
    message_id = encoding::json::decode(message_json).id,
    visit_id = encoding::json::decode(message_json).visit_id,
    change = encoding::json::decode(message_json).change;

UPDATE room_change UNSET message_json;
REMOVE FIELD message_json ON room_change;
