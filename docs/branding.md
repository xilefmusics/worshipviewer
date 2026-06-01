# Branding and fonts

## Rubik (UI typeface)

The SPA uses **Rubik** self-hosted as WOFF2 under `frontend/app/public/fonts/`. Files are generated/subset for Latin weights 400–700.

- **License:** [SIL Open Font License 1.1](https://openfontlicense.org/)
- **CSS entry:** `frontend/app/src/styles/fonts.css`
- **Attribution:** include Rubik in the in-app About/licenses section and root [NOTICE](../NOTICE) (see action plan 1.36 for user-visible copy).

Do not load Rubik from Google Fonts CDN in production builds; offline/PWA installs rely on bundled files.

## App icons

Brand PNGs under `frontend/app/public/brand/` are generated from project artwork (`frontend/app/scripts/generate-brand-icons.mjs`). PWA manifest references these paths.

## Third-party framework logos

Remove unused stock logos (React, Vite, etc.) from shipped assets. The repository should not redistribute framework branding in production bundles.
