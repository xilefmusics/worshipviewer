-- Native desktop OAuth uses a short-lived, single-use code to transfer the browser login into the
-- Tauri webview. The raw code is never stored; it is the record id's SHA-256 key.
DEFINE TABLE OVERWRITE native_oidc_handoff TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE created_at ON native_oidc_handoff TYPE datetime READONLY VALUE $before ?? time::now() PERMISSIONS FULL;
DEFINE FIELD OVERWRITE expires_at ON native_oidc_handoff TYPE datetime PERMISSIONS FULL;
DEFINE FIELD OVERWRITE session_id ON native_oidc_handoff TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE state ON native_oidc_handoff TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE code_challenge ON native_oidc_handoff TYPE string PERMISSIONS FULL;

DEFINE INDEX OVERWRITE native_oidc_handoff_expires_idx ON native_oidc_handoff FIELDS expires_at CONCURRENTLY;

DEFINE FIELD OVERWRITE native_state ON oidc_state TYPE none | string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE native_code_challenge ON oidc_state TYPE none | string PERMISSIONS FULL;
