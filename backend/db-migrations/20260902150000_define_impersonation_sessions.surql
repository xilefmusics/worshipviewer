DEFINE TABLE OVERWRITE impersonation_session TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE actor_session ON impersonation_session TYPE record<session> ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE actor_user ON impersonation_session TYPE record<user> ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE subject_user ON impersonation_session TYPE record<user> ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD OVERWRITE credential_hash ON impersonation_session TYPE string ASSERT string::len($value) = 64 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE created_at ON impersonation_session TYPE datetime READONLY VALUE $before ?? time::now() PERMISSIONS FULL;

DEFINE INDEX OVERWRITE impersonation_credential_unique ON impersonation_session FIELDS credential_hash UNIQUE CONCURRENTLY;
DEFINE INDEX OVERWRITE impersonation_actor_session_idx ON impersonation_session FIELDS actor_session CONCURRENTLY;
DEFINE INDEX OVERWRITE impersonation_actor_user_idx ON impersonation_session FIELDS actor_user CONCURRENTLY;
DEFINE INDEX OVERWRITE impersonation_subject_user_idx ON impersonation_session FIELDS subject_user CONCURRENTLY;

DEFINE FIELD OVERWRITE actor_user ON http_request_audit TYPE none | record<user> VALUE (IF type::is_none($value) THEN NONE ELSE $value ?? $before ?? NONE END) PERMISSIONS FULL;
DEFINE FIELD OVERWRITE impersonation ON http_request_audit TYPE none | record<impersonation_session> VALUE (IF type::is_none($value) THEN NONE ELSE $value ?? $before ?? NONE END) PERMISSIONS FULL;

DEFINE EVENT OVERWRITE impersonation_actor_session_cascade ON session
  WHEN $event = 'DELETE' THEN (DELETE impersonation_session WHERE actor_session = $before.id);
DEFINE EVENT OVERWRITE impersonation_actor_user_cascade ON user
  WHEN $event = 'DELETE' THEN (DELETE impersonation_session WHERE actor_user = $before.id);
DEFINE EVENT OVERWRITE impersonation_subject_user_cascade ON user
  WHEN $event = 'DELETE' THEN (DELETE impersonation_session WHERE subject_user = $before.id);
DEFINE EVENT OVERWRITE http_request_audit_actor_user_clear ON user
  WHEN $event = 'DELETE' THEN (UPDATE http_request_audit SET actor_user = NONE WHERE actor_user = $before.id);
DEFINE EVENT OVERWRITE http_request_audit_impersonation_clear ON impersonation_session
  WHEN $event = 'DELETE' THEN (UPDATE http_request_audit SET impersonation = NONE WHERE impersonation = $before.id);
