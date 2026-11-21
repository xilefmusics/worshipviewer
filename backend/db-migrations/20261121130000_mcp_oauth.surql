DEFINE TABLE OVERWRITE mcp_oauth_request TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE client_id ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE client_name ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE redirect_uri ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE code_challenge ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE state ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE scope ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE resource ON mcp_oauth_request TYPE string;
DEFINE FIELD OVERWRITE expires_at ON mcp_oauth_request TYPE datetime;

DEFINE TABLE OVERWRITE mcp_oauth_code TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE user_id ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE client_id ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE client_name ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE redirect_uri ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE code_challenge ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE scope ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE resource ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE grant_id ON mcp_oauth_code TYPE string;
DEFINE FIELD OVERWRITE expires_at ON mcp_oauth_code TYPE datetime;

DEFINE TABLE OVERWRITE mcp_oauth_grant TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE user_id ON mcp_oauth_grant TYPE string;
DEFINE FIELD OVERWRITE client_id ON mcp_oauth_grant TYPE string;
DEFINE FIELD OVERWRITE client_name ON mcp_oauth_grant TYPE string;
DEFINE FIELD OVERWRITE scope ON mcp_oauth_grant TYPE string;
DEFINE FIELD OVERWRITE created_at ON mcp_oauth_grant TYPE datetime;
DEFINE INDEX OVERWRITE mcp_oauth_grant_user ON mcp_oauth_grant FIELDS user_id;

DEFINE TABLE OVERWRITE mcp_oauth_access TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE user_id ON mcp_oauth_access TYPE string;
DEFINE FIELD OVERWRITE client_id ON mcp_oauth_access TYPE string;
DEFINE FIELD OVERWRITE grant_id ON mcp_oauth_access TYPE string;
DEFINE FIELD OVERWRITE scope ON mcp_oauth_access TYPE string;
DEFINE FIELD OVERWRITE resource ON mcp_oauth_access TYPE string;
DEFINE FIELD OVERWRITE expires_at ON mcp_oauth_access TYPE datetime;
DEFINE INDEX OVERWRITE mcp_oauth_access_grant ON mcp_oauth_access FIELDS grant_id;
DEFINE INDEX OVERWRITE mcp_oauth_access_expiry ON mcp_oauth_access FIELDS expires_at;

DEFINE TABLE OVERWRITE mcp_oauth_refresh TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE user_id ON mcp_oauth_refresh TYPE string;
DEFINE FIELD OVERWRITE client_id ON mcp_oauth_refresh TYPE string;
DEFINE FIELD OVERWRITE grant_id ON mcp_oauth_refresh TYPE string;
DEFINE FIELD OVERWRITE scope ON mcp_oauth_refresh TYPE string;
DEFINE FIELD OVERWRITE resource ON mcp_oauth_refresh TYPE string;
DEFINE FIELD OVERWRITE expires_at ON mcp_oauth_refresh TYPE datetime;
DEFINE INDEX OVERWRITE mcp_oauth_refresh_grant ON mcp_oauth_refresh FIELDS grant_id;
DEFINE INDEX OVERWRITE mcp_oauth_refresh_expiry ON mcp_oauth_refresh FIELDS expires_at;
