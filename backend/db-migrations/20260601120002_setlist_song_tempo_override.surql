DEFINE FIELD OVERWRITE songs.*.tempo ON setlist TYPE none | int ASSERT $value = NONE OR $value >= 0 PERMISSIONS FULL;
