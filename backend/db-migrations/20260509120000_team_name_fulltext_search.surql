-- Full-text search on team names (same analyzer/BM25 as setlist/collection titles).

DEFINE INDEX OVERWRITE team_name_search_idx ON team FIELDS name FULLTEXT ANALYZER text_search BM25(1.2,0.75) CONCURRENTLY;
