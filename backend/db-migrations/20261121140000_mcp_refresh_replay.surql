-- Retain used refresh-token hashes until expiry to detect replay.
DEFINE FIELD OVERWRITE used ON mcp_oauth_refresh TYPE bool DEFAULT false;
UPDATE mcp_oauth_refresh SET used = false WHERE used = NONE;
