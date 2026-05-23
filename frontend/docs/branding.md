# Branding

Modern, calm UI aligned with **Apple Human Interface Guidelines** and **Material Design 3** patterns: clear hierarchy, generous whitespace, predictable motion.

## Principles

- **System-first default** — On first visit, **follow the OS / browser** (`prefers-color-scheme`) until the user chooses a fixed theme. **Settings** offers **Light**, **Dark**, and **Use browser default** so appearance can stay in sync with the system or be pinned (including **Dark** for stage / low glare).
- **One accent** — A single **primary** brand color for key actions and focus rings; **no second hue** — use **tints and neutrals** only beyond primary.
- **Readable type** — Comfortable line length in editors; scalable text in player.
- **Stage-safe player** — Player uses **balanced** contrast: readable on stage without harsh chrome; optional “dim UI chrome” in player remains a future enhancement.
- **Voice** — **Warm, minimal, reassuring** microcopy; primary UX persona is the **worship team / band** (not only tech leads).

**Denomination / imagery:** Branding does **not** impose denomination-neutral-only rules by default — the provided brand kit may include explicit imagery when supplied.

## Product naming

| Context | Value |
|---------|--------|
| **Canonical product name** | **Worship Viewer** (UI, marketing, sentence case) |
| **PWA `short_name`** | **Worship** (home screen / task switcher) |
| **German (`de`) display** | Keep **Worship Viewer** in English (common for product names) |

## Login screen copy

Login shows **supporting** marketing copy (not blocking form fields). Approved **direction** from branding grill:

- **Headline:** *All for His glory.*
- **Supporting lines** (stack or shorten on narrow viewports): emphasize **leading worship**, **stepping aside when the Spirit moves**, and **focusing on the room, not the screen** — aligned with phrases such as *Helps you lead worship — then steps aside when the Spirit takes over*, *Focus on the room, not the screen!*, and *Don’t make music — worship!* Implementations may condense to one paragraph for mobile.

**Legal links** (footer on login): [Imprint](https://worshipviewer.com/imprint), [Privacy](https://worshipviewer.com/privacy), [Terms](https://worshipviewer.com/terms).

## Color

| Token role | Specification |
|------------|-----------------|
| **Primary** | **`oklch(0.55 0.21 27)`** — canonical in `tokens.css` / modern CSS. |
| **Primary (approx. hex)** | **`#d01d21`** — for manifest `theme_color`, social previews, or other **non-OKLCH** contexts; re-derive if the OKLCH source changes. |
| **Accent / secondary** | **No separate accent hue** — use **primary tints**, neutrals, and semantic states (success, danger) from the design system. |

**PWA `theme_color`:** Use **primary** (OKLCH or the hex fallback above — match `tokens.css`).

## Typography

| Use | Family | Notes |
|-----|--------|--------|
| **UI** | **`Rubik`, sans-serif** | Self-host **WOFF2** under `public/fonts/` + `fonts.css` — **do not** load Google Fonts from the network. |
| **Lyrics / ChordPro** | **`Rubik`, sans-serif** (MVP) | Same stack for a **unified** look. If **chord column alignment** needs a true monospace, add a dedicated **mono** face in a later iteration without changing the primary voice. |

Provide **WOFF2** files for the weights used in UI (document exact weights when files are added).

## Source of truth (implementation)

| Asset / token | Location |
|---------------|----------|
| CSS variables (light + dark) | `app/src/styles/tokens.css` |
| Tailwind theme bridge | `app/src/index.css` + semantic CSS (`tokens.css`) with Tailwind v4 |
| Self-hosted fonts | `app/src/styles/fonts.css` + `public/fonts/*.woff2` |
| Logo | `app/public/brand/` — see **Authoritative assets** below |
| App icon + maskable | `app/public/brand/` + PNG sizes for PWA |
| Favicon | `app/public/favicon.ico` or equivalent |

**Do not** load Google Fonts from the network — breaks offline and PWA reliability.

## Authoritative assets (repo)

Source files live at the **repository root** (not only under a future `app/` tree):

| File | Purpose |
|------|---------|
| `resources/logo_text.png` | Wordmark / text logo |
| `resources/logo_icon.png` | Icon + wordmark or mark variant |
| `resources/appicon.png` | App icon source — use for **maskable** and fixed-size exports |
| `resources/favicon.png` | Favicon source |

**Implementation:** When the Vite app exists, copy or generate **PWA-required** sizes and **maskable** variants into `app/public/brand/` (and favicon) from these sources. Prefer **SVG** for infinite-resolution logos **if** vector masters exist later; **PNG sources are authoritative** until then.

## Semantic tokens (illustrative)

Until implementation wires real tokens, centralize **placeholders** in `tokens.css` so palette swap stays one commit:

- `--color-bg`, `--color-surface`, `--color-border`
- `--color-primary`, `--color-primary-foreground`
- `--radius-sm`, `--radius-md`, `--shadow-elevated`
- `--font-sans` → Rubik stack

## Intake checklist (E1)

- [x] **Primary color** — **`oklch(0.55 0.21 27)`** (hex fallback **`#d01d21`**)
- [x] **Accent rule** — primary + tints only (no second brand hue)
- [x] **Naming** — **Worship Viewer** / short **Worship**; DE keeps English name
- [x] **Login copy + legal URLs** — documented above
- [x] **Rubik WOFF2** files + chosen weights in `public/fonts/`
- [x] **Exported PWA icons** (192, 512, maskable) + favicon from `resources/`
- [x] **`tokens.css` + Tailwind** wired to decisions above (replace placeholders)

**E1 exit** still requires the **remaining** checklist rows (self-hosted fonts, generated public icons, wired tokens). **Raster sources** in `resources/` satisfy “assets delivered”; engineering must **publish** them into the app and manifest.

## Related docs

- [PWA install](./pwa-install.md) — manifest names and icons
- [Plan index](./plan.md) — decision log
- [Grill session](./grill-session.md) — **Branding grill (2026-04-20)** recorded answers
