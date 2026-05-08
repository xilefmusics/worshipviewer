-- Live metrics are served via GET .../metrics using fn::http_audit_* (see 20260504100000).
REMOVE FIELD IF EXISTS request_count ON user;
REMOVE FIELD IF EXISTS last_used_at ON user;
REMOVE FIELD IF EXISTS request_count ON session;
REMOVE FIELD IF EXISTS last_used_at ON session;
