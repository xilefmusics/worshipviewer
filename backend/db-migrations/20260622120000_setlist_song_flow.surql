DEFINE FIELD OVERWRITE songs.*.flow ON setlist TYPE none | array<object> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.title ON setlist TYPE string ASSERT string::len(string::trim($value)) > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.occurrence_index ON setlist TYPE none | int ASSERT $value = NONE OR $value >= 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.repeats ON setlist TYPE none | int ASSERT $value = NONE OR $value >= 1 PERMISSIONS FULL;
