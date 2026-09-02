DEFINE TABLE OVERWRITE demodata_seed TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE scenario ON demodata_seed TYPE string ASSERT string::len(string::trim($value)) > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE version ON demodata_seed TYPE int ASSERT $value >= 1 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE seeded_at ON demodata_seed TYPE datetime READONLY VALUE $before ?? time::now() PERMISSIONS FULL;

DEFINE INDEX OVERWRITE demodata_seed_scenario_unique ON demodata_seed FIELDS scenario UNIQUE CONCURRENTLY;
