# App shell and UX

Mobile-first; **iPad** and **desktop** get denser layouts and keyboard affordances. **There is no side rail:** the three primary destinations always use a **bottom tab bar**; wide layouts add density and spacing, not a different nav paradigm.

## Shell layout (all breakpoints)

| Zone | Content |
|------|---------|
| **Top** | **Search** — **top-left**, floating with margin from the safe area / content. **Avatar** — **top-right**, floating with margin. (Logo treatment optional; keep search + avatar visually primary.) |
| **Bottom** | **Primary nav** — **bottom-left**: **Collections**, **Songs**, **Setlists**. **Create (+)** — **bottom-right**, floating with margin. **+** and avatar are separate from the nav cluster (distinct touch targets). |

**Setlist editor (`/setlists/:id`):** The **bottom tab bar** and **+** FAB are **hidden** so the screen reads as focused editing chrome; **back** in the header returns to **`/setlists`** (list **scrolls to top**). On **`/setlists`**, **+** starts **create setlist** when the user can edit the team library (`?new=1` opens the create dialog, then navigate to the new editor).

**Collection editor (`/collections/:id`):** Same chrome contract as **setlist editor**: tab bar and **+** hidden; header **back** returns to **`/collections`** (**list scrolls to top** on return — see hub list routes). **`/collections`** **+** starts **create collection** (`?new=1` opens **`CreateCollectionDialog`**). See [E7.2](./epic-e7.2-action-plan.md). **No Play** in-editor until **[E8](./roadmap.md)** (`/player` from primary row tap / context menu). **Tablet/desktop:** **`/collections/:id`** with write access enables **Insert song** in **Cmd-K** (flush-before-insert, same **`q`** semantics — [API](./api-integration.md)).

| Breakpoint | Notes |
|------------|--------|
| Phone | Thumb-friendly spacing; respect iOS safe areas. |
| Tablet (iPad) | Denser layout; optional split view in Settings / editors. **Cmd-K** where keyboard-focused (see below). |
| Desktop (≥1280px) | Same bottom nav + corners as phone — **no** collapsible side rail — **no** duplicate top primary navigation; mouse and keyboard use the same shell. |

**Player route (`/player`, no shell):** Shell chrome does **not** wrap the player. **Standalone PWA** (“add to home screen”) removes **browser** UI for a fullscreen app frame; that is separate from in-app shell layout.

## Shell actions (required)

1. **Quick navigation** — Three primary destinations: **Collections**, **Songs**, **Setlists** (bottom tabs everywhere).
2. **Create** — Single **+** button when the **current screen supports creating** that entity (e.g. on a list for songs, create song). From **E6** ([roadmap](./roadmap.md)), **+** opens a **chooser**: **New** (existing create flow) vs **Import** (file upload — ChordPro / WorshipPro, one or many files). **Disabled** with a short explanation when **offline** or when the user **lacks create capability** (read-only teammate). Omit or hide **+** when the route has nothing to create (e.g. Settings).
3. **Search** — **Phone:** header field is **simple search only** (no command palette). **Tablet / desktop:** **Cmd-K / Ctrl-K** opens the **command palette** **when a hardware keyboard is available** — **no** Cmd-K affordance on iPad (or similar) **without** a physical keyboard; use header search only in that case. Palette **search** uses the **same list `q` semantics** as hub list search (see [API integration](./api-integration.md)); no separate omnisearch API in v1.
4. **Profile** — Avatar opens **menu** (see below).

## Deep links and tabs

Opening an **editor** from a deep link (e.g. `/collections/:id`) should keep the **corresponding primary tab** (Collections / Songs / Setlists) **selected** when navigating back to the list.

## Profile menu

- **Username** (read-only display)
- **Settings** → `/settings`
- **Teams** → `/teams`
- **Sessions** → `/sessions`
- **Install app** — PWA install (Android/Desktop: `beforeinstallprompt`; iOS: instructions sheet — see [PWA install](./pwa-install.md))
- **Logout** — `POST /auth/logout`, clear client cache and sensitive Dexie data

**Secondary routes** (Settings, Teams, Sessions) sit **outside** the three-tab model — profile menu, palette (where available), or deep links.

**Settings** (see [Pages and flows](./pages-and-flows.md)) owns **language** (explicit locale vs browser default, with **English** fallback for unsupported choices) and **appearance** (light / dark / system).

## Lists: view modes and gestures

| Entity | Default view | Toggle |
|--------|--------------|--------|
| Collections | **Cards** (A4 aspect ratio `1 : √2`) using **cover** art | **Settings → Collections layout** (List / Card) |
| Songs | **List** | List only |
| Setlists | **List** | List only |

- Persist **collections** layout in `localStorage` (`wv.hub.viewMode.collections`).
- **Tap** → open **`/player`** for **Collections / Songs / Setlists** (**implemented** in app). **E2** milestone initially used a **silent no-op** tap until navigation landed ([epic-e2-action-plan.md](./epic-e2-action-plan.md)). **Teams:** tap → **team editor** only.
- **Long-press** (~500 ms) or **right-click** → **context menu / bottom sheet**: Edit, Delete, Play (where relevant), Duplicate (if API supports). **Collections**, **Songs**, and **Setlists** add **Export** (PDF, ChordPro, WorshipPro) from **E6** ([roadmap](./roadmap.md)). **Destructive** actions use a **confirm dialog** (or mobile sheet with the same meaning) before commit. **Teams** and **Sessions** lists follow the same gesture model; actions depend on the API (e.g. revoke session). **Discovery:** **no** first-run coachmark — document long-press under **Help** or an equivalent entry from **Settings**.
- **Haptics**: `navigator.vibrate` on long-press where available; no-op on iOS.

### Lists: pagination, refresh, and states

- **Pull-to-refresh** on the three primary list routes (`/collections`, `/songs`, `/setlists`): refetch **page 0** and invalidate the infinite query; **scroll to top** after refresh completes (MVP).
- **Load more**: prefer **infinite scroll** via an **IntersectionObserver** sentinel at the bottom; keep an explicit **Load more** action as an accessible fallback.
- **First load**: **skeleton** placeholders (rows or cards) matching the active view mode.
- **List fetch error** (initial load): keep shell chrome; show **inline** error in the scrollable content with **Retry** — not a full-screen error page.
- **Empty states**: distinguish **no items in library** from **no results for the current search**; the latter includes **clear search** and copy that references the query. See [Pages and flows](./pages-and-flows.md).

## Command palette (Cmd-K / Ctrl-K)

- **Availability:** **Not** on **phone** — phones use **simple search** in the header only. **Desktop** and **iPad with hardware keyboard** use the palette (Cmd-K / Ctrl-K). **iPad without hardware keyboard:** **no** palette — header search only.
- **Setlist / collection editors:** When **`/setlists/:id`** or **`/collections/:id`** is open (and the user **can edit** where applicable), the palette includes **Insert song** (same search/`q` semantics as the in-editor picker). Choosing a result **flushes pending autosave** first, then inserts the song so ordering stays consistent.
- **Sections** (illustrative): Navigate | Create | Search | Play | Recent | Help
- **Navigate:** Register **every routable / deep-linkable destination** via the command registry so discovery stays complete.
- **Implementation:** `cmdk` + **command registry** (`src/commands/*`) so features register actions in one place.

## Offline indicator

When the app is offline (emergency mode): show a **small indicator near the avatar** (not a full-width banner) that **remains until the connection is restored**. Copy is translated for **English and German** in the MVP; wire additional locales when the product expands past two shipped languages. Disable create/edit mutations; player still uses Dexie for cached setlists where applicable (see [Architecture](./architecture.md)).

## Accessibility and targets

- Minimum **44×44 pt** touch targets for primary actions.
- Focus order matches visual order; palette **trap-focus** while open (tablet/desktop).
- **iPad external keyboard (v1):** Cmd-K (where enabled) + correct focus order; optional arrow keys in player can come later.

## Related docs

- [Branding](./branding.md)
- [Pages and flows](./pages-and-flows.md)
