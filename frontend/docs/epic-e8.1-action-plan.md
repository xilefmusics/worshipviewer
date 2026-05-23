# Epic E8.1 — Player role variants (AV mode first)

**Parent:** [E8.1 — Player role variants (AV mode first)](./roadmap.md#e81--player-role-variants-av-mode-first)

**Prerequisite:** [E8](./epic-e8-action-plan.md) complete (player route, TOC, per-resource state, Play wiring from hubs/editors).

**Normative UX:** [pages-and-flows.md](./pages-and-flows.md), [app-shell.md](./app-shell.md), [architecture.md](./architecture.md), [grill-session.md](./grill-session.md), [openapi.json](./openapi.json).

**Next:** [E9 — Sync transport and Tauri readiness](./roadmap.md#e9--sync-transport-and-tauri-readiness)

---

## Outcome

Turn the player into a **role-variant surface** instead of building separate feature silos:

- Keep the current player as **Normal mode** (today's chords/book behavior).
- Add **AV mode** as the first new player variant for beamer/projection lyrics.
- Share one player state model across modes (resource, index, toc, navigation, blackout, persisted preferences).
- In **AV mode**, treat slide **content** and **background** as separate layers that can be configured independently.
- Leave clean extension points for future role variants (for example click/pad/service-operator modes).

## Exit (E8.1)

- Player mode architecture is documented and implemented with deterministic mode selection (global default + explicit context actions).
- **AV mode** ships end-to-end with lyric-focused rendering, navigation, blackout, and projection output behavior.
- AV slide styling supports independent control of **content layer** (text layout/typography) and **background layer** (media/color/brightness) without coupling.
- AV/role settings are exposed as a **dedicated tab in global `/settings`**, and the player provides **quick access** to that tab (same interaction pattern as existing player quick settings access).
- Existing **Normal mode** remains available and stable (no regression in E8 behavior).
- Projection output is **dual-window required by design**; if a second window cannot open, fallback to **single-screen AV** with a persistent warning.
- If a projection output window is used, it is a **view of AV mode state**, not a separate domain model.
- EN + DE strings exist for all new mode controls/states.
- Keyboard accessibility is complete for desktop operation; touch fallback works on tablet.
- Manual checklist passes on one laptop + one external display (or second-window simulation).

---

## Scope and boundaries

Included:

- Global default mode selector controls primary launch behavior for player resources (songs, setlists, collections).
- Primary tap/click opens `/player` in the configured default mode.
- Resource context menu provides explicit entries: **Play in Normal mode** and **Play in AV mode**.
- No in-player mode switch in E8.1 (mode changes happen via relaunch from lists/context or by changing global default).
- AV mode lyric projection behavior for service operation.
- AV mode layered rendering model: content changes are possible without changing the background, and background changes are possible without changing content.
- Required second-window projection output synchronized with the same AV mode state, with fallback behavior above.
- Global settings integration: a dedicated **Player roles / AV** tab under `/settings`.
- In-player quick access opens the above settings tab directly without leaving the player workflow ambiguous.

Out of scope:

- Full click/metronome/pad feature implementation (capture extension points only).
- Device pairing and remote transport (`SyncTransport` remains E9).
- Native display APIs beyond browser/PWA capabilities.

---

## Suggested implementation slices

1. **Player mode model:** introduce `playerMode` (`normal` | `av`) with a single global default selector in Settings (applies to songs, setlists, collections) and define extension contract for future modes.
2. **AV renderer + controls:** implement AV-specific rendering, current/next context, blackout, and mode-specific control cluster.
   - Include separate control groups for **content** vs **background** properties.
   - E8.1 baseline background sources: **color**, **gradient**, **image**, **video**.
   - E8.1 transitions: configurable transition style + timing, respecting reduced motion.
3. **Settings integration:** add a dedicated `/settings` tab for AV/role settings and wire player quick access to deep-link into that tab.
   - Mandatory controls in this tab: default mode selector, content typography controls, background controls, transition controls, projection behavior controls.
4. **Projection output surface:** dual-window output fed by AV mode state (no duplicated player logic) with single-screen fallback warning when output window is unavailable.
5. **Input + a11y:** role-aware keyboard map, focus rules, touch-safe controls.
6. **Docs + i18n + checklist:** update normative docs and manual verification script for role variants.

---

## Mode model (normative)

- Canonical route stays `/player` (same payload contract as E8).
- `playerMode` is a **view concern** layered on top of the player payload.
- In E8.1, mode choice is driven by a **single global default** (no per-resource mode override yet).
- Launch contract:
  - Primary tap/click on songs/setlists/collections uses global default mode.
  - Context menu provides explicit mode launch actions for Normal and AV.
  - In-player mode switching is disabled in E8.1.
- Mode switch updates rendering and available controls, but does not fork resource fetching or navigation logic.
- AV-specific capabilities (for example projection output and blackout) are bound to AV mode only.
- AV mode rendering contract is two-layered: `contentLayer` and `backgroundLayer` are modeled separately in state, persistence, and UI controls.
- Future modes (example: click/pad) must register in the same mode contract instead of introducing parallel player routes.

---

## Related docs

- [Roadmap](./roadmap.md)
- [Epic E8 action plan](./epic-e8-action-plan.md)
- [Pages and flows](./pages-and-flows.md)
- [App shell](./app-shell.md)
- [Architecture](./architecture.md)
- [Design grill session](./grill-session.md)
