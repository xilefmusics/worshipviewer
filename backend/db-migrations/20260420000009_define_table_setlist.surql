DEFINE TABLE OVERWRITE setlist TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE owner ON setlist TYPE record<team> ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs ON setlist TYPE array<object> VALUE $value ?? $before ?? [] PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.id ON setlist TYPE record<song> ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.key ON setlist TYPE none | object PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.key.level ON setlist TYPE int ASSERT $value >= 0 AND $value < 12 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE songs.*.nr ON setlist TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE title ON setlist TYPE string ASSERT string::len(string::trim($value)) > 0 PERMISSIONS FULL;

DEFINE INDEX OVERWRITE setlist_title_search_idx ON setlist FIELDS title FULLTEXT ANALYZER text_search BM25(1.2,0.75) CONCURRENTLY;