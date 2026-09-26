DEFINE TABLE OVERWRITE collection_membership_lock TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;
DEFINE FIELD OVERWRITE revision ON collection_membership_lock TYPE int DEFAULT 0 PERMISSIONS FULL;

CREATE collection_membership_lock:global SET revision = 0;
