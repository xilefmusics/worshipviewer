# Business logic constraints for desktop installers

- **BLC-INSTALL-001:** At startup, the backend checks only the exact frontend app release version embedded in the build. It MUST NOT substitute the latest GitHub release when that tag is missing.
- **BLC-INSTALL-002:** GitHub release lookup and asset downloads are best-effort background work. Missing releases, missing assets, and failed downloads MUST be logged as warnings and MUST NOT prevent the server from accepting traffic.
- **BLC-INSTALL-003:** The public **`GET /api/v1/installers`** manifest lists only fully downloaded files and reports `checking`, `ready`, or `unavailable`. Partial release availability is valid. Cached files and their manifest persist under `INSTALLER_CACHE_DIR`.
- **BLC-INSTALL-004:** **`GET /api/v1/installers/{installer_id}/download`** is public and may serve only a completed installer from the startup cache. Unknown or unavailable IDs return **404**; served files use attachment disposition.
- **BLC-INSTALL-005:** The public **`GET /api/v1/installers/releases`** catalog lists supported assets from plain semantic-version GitHub releases. The install page keeps current-platform options visible and puts other platforms and releases in a collapsed section; historical downloads go directly to their GitHub release assets.
- **BLC-INSTALL-006:** The installer cache defaults to `installer-cache` in the server working directory and can be overridden with `INSTALLER_CACHE_DIR`. Container deployments that need cache files to survive container replacement must mount persistent storage at that path.

The version is passed into both frontend and backend Docker build stages from `git describe --tags --always`; a plain release tag matches desktop release assets, while branch builds do not.
