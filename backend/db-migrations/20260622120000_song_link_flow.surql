DEFINE FIELD OVERWRITE songs.*.flow ON collection TYPE none | array<object> ASSERT $value = NONE OR array::len($value) > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.section_title ON collection TYPE string ASSERT string::len(string::trim($value)) > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.occurrence_index ON collection TYPE int ASSERT $value >= 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.repeat_count ON collection TYPE int ASSERT $value >= 1 PERMISSIONS FULL;

DEFINE FIELD OVERWRITE songs.*.flow ON setlist TYPE none | array<object> ASSERT $value = NONE OR array::len($value) > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.section_title ON setlist TYPE string ASSERT string::len(string::trim($value)) > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.occurrence_index ON setlist TYPE int ASSERT $value >= 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.flow.*.repeat_count ON setlist TYPE int ASSERT $value >= 1 PERMISSIONS FULL;
