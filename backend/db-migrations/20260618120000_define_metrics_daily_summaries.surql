-- Exact, reusable daily facts for incremental admin monitoring metrics.
DEFINE TABLE OVERWRITE metrics_request_day TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE date ON metrics_request_day TYPE string ASSERT string::len($value) = 10 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE total ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE successful ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE failed ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE client_error ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE server_error ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE duration_sum ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE success_duration_sum ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE success_duration_count ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE failure_duration_sum ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE failure_duration_count ON metrics_request_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE complete ON metrics_request_day TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE version ON metrics_request_day TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE updated_at ON metrics_request_day TYPE datetime VALUE time::now() PERMISSIONS FULL;
DEFINE INDEX OVERWRITE metrics_request_day_date_unique ON metrics_request_day FIELDS date UNIQUE CONCURRENTLY;

DEFINE TABLE OVERWRITE metrics_duration_day TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE date ON metrics_duration_day TYPE string ASSERT string::len($value) = 10 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE duration_ms ON metrics_duration_day TYPE int PERMISSIONS FULL;
DEFINE FIELD OVERWRITE count ON metrics_duration_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE INDEX OVERWRITE metrics_duration_day_date_duration_unique ON metrics_duration_day FIELDS date, duration_ms UNIQUE CONCURRENTLY;
DEFINE INDEX OVERWRITE metrics_duration_day_date_idx ON metrics_duration_day FIELDS date CONCURRENTLY;

DEFINE TABLE OVERWRITE metrics_user_day TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE date ON metrics_user_day TYPE string ASSERT string::len($value) = 10 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE user_key ON metrics_user_day TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE request_count ON metrics_user_day TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE INDEX OVERWRITE metrics_user_day_date_user_unique ON metrics_user_day FIELDS date, user_key UNIQUE CONCURRENTLY;
DEFINE INDEX OVERWRITE metrics_user_day_date_idx ON metrics_user_day FIELDS date CONCURRENTLY;
DEFINE INDEX OVERWRITE metrics_user_day_user_idx ON metrics_user_day FIELDS user_key CONCURRENTLY;

DEFINE TABLE OVERWRITE metrics_user_first_seen TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE user_key ON metrics_user_first_seen TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE first_seen_date ON metrics_user_first_seen TYPE string ASSERT string::len($value) = 10 PERMISSIONS FULL;
DEFINE INDEX OVERWRITE metrics_user_first_seen_user_unique ON metrics_user_first_seen FIELDS user_key UNIQUE CONCURRENTLY;

DEFINE TABLE OVERWRITE metrics_summary_state TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE complete_from_date ON metrics_summary_state TYPE string ASSERT string::len($value) = 10 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE version ON metrics_summary_state TYPE int DEFAULT 1 PERMISSIONS FULL;
