# Extensive analysis: `frontend/` (legacy, Rust + Yew) vs `frontend2/` (new, TypeScript + React)

This compares what each app actually ships in source — routes, pages, components, settings, keyboard / pointer gestures, and the AV/presenter surface — and then enumerates **what the new frontend drops or down-scopes** versus what it **expands or replaces with an equivalent**.

> TL;DR: `frontend2` is a much larger product than `frontend`. It deliberately drops the **two-window presenter chrome split** and a handful of legacy player niceties (Nashville mode toggle on player, auto-format in editor, the "select song key" dropdown on the player bottom bar) and reframes the "presenter" experience as an **AV player variant** with broader settings. Most "missing" capabilities have a more elaborate replacement; a small set of legacy behaviors are genuinely gone. Details below.

---

## 1. Stack and architecture

| Concern | `frontend/` (legacy) | `frontend2/` (new) |
|---|---|---|
| Language / framework | Rust + Yew 0.23 (WASM SPA) | TypeScript + React 19 (Vite SPA) |
| Routing | `yew-router` enum-based routes | `@tanstack/react-router` file-based (`routeTree.gen.ts`) |
| Styling | `stylist` inline + per-component `.css` | Tailwind v4 + shadcn primitives + a few `.css` files |
| API client | Hand-rolled Rust `ApiClient` (in `shared` crate) | `openapi-fetch` + generated `schema.d.ts` from `openapi.json` |
| Data layer | None: `use_effect` + `spawn_local` calls; no cache | `@tanstack/react-query` everywhere + `react-query-persist-client` for the hub list cache |
| Forms / drag-drop | Native DOM dragstart/touch* in `setlist_editor.rs` | `@dnd-kit` (core, sortable, modifiers, utilities) |
| Editor (ChordPro) | CodeMirror 5 + custom `SyntaxParser` transitions, injected via raw JS in `code_mirror_wrapper.js` | `@uiw/react-codemirror` (CodeMirror 6) + Lezer highlighter |
| ChordPro engine | Server-side / `chordlib` Rust crate (server renders `Song` from ChordPro) | In-browser `@worshipviewer/chordlib-wasm` (`crates/chordlib-wasm`) hidden behind a `ChordEngine` port |
| State persistence | `localStorage` for presenter `SlideProps` only | `Dexie` (`dexie-db.ts`), `localStorage`, `react-query-persist-client` |
| Offline | None (login/logout register a basic `service-worker.js`) | Workbox (`vite-plugin-pwa`) + Dexie mirror for setlist players + blob cache, LRU eviction grace, online indicator |
| i18n | None (hard-coded English strings) | `i18next` + `react-i18next` (`en.json`, `de.json`) with `?lang=` QA override and browser-mapped resolver |
| PWA | Manifest + service worker placeholder | Manifest + maskable icons + install prompt UX (`PwaInstallProvider`, `PwaRegistration`), update toast |
| Tests | None | Vitest unit suite throughout `lib/` and `hooks/` (per `epic-e1-e8-completion-plan.md`: 242 tests) |

The legacy app is a single-author, mostly-imperative wasm bundle (`frontend/src/{api,components,pages,app.rs,route.rs,main.rs}`). The new app is a full monorepo workspace (`frontend2/{app,packages,crates}`) with a documented multi-epic roadmap in `frontend2/docs/`.

---

## 2. Route / page surface — side by side

Legacy routes (from `frontend/src/route.rs`):

```rust
pub enum Route {
    #[at("/")]                  Index,
    #[at("/collections")]       Collections,
    #[at("/songs")]             Songs,
    #[at("/setlists")]          Setlists,
    #[at("/player")]            Player,
    #[at("/presenter")]         Presenter,
    #[at("/presenter/slides")]  PresenterSlides,
    #[at("/editor")]            Editor,
    #[at("/setlist-editor")]    SetlistEditor,
    #[at("/login")]             Login,
    #[at("/logout")]            Logout,
    #[not_found]
    #[at("/404")]               NotFound,
}
```

New routes (from `frontend2/app/src/routes/`):

| New route | Replaces legacy | Notes |
|---|---|---|
| `/login`, `/logout` | `/login`, `/logout` | Same purpose; new login has OAuth + OTP **tabs** plus `return_to` allowlist (`frontend2/app/src/routes/login.tsx`) |
| `/` → `/collections` | `/` (`IndexPage` pushed `/collections`) | Functionally identical |
| `/_hub/collections` | `/collections` | Renamed list, now via `EntityListView` |
| `/_hub/songs` | `/songs` | Same purpose; adds `+` chooser (New \| Import) |
| `/_hub/setlists` | `/setlists` | Same purpose |
| `/_hub/collections/$collectionId` | **— (new)** | Collection editor — legacy had **no** collection editor |
| `/_hub/songs/$songId` | `/editor?id=…` | Song editor, with `?playerType/playerId/playerIndex` return-to-player context |
| `/_hub/setlists/$setlistId` | `/setlist-editor?id=…` | Setlist editor |
| `/_hub/teams`, `/_hub/teams/$teamId` | **— (new)** | Teams list + detail, members, invitations |
| `/_hub/sessions` | **— (new)** | Active sessions, revoke per `/users/me/sessions` |
| `/_hub/settings` | **— (new)** | General / Player / Player roles (AV) tabs |
| `/join` | **— (new)** | Team invitation acceptance |
| `/player` (`?type=&id=&index=&mode=`) | `/player?id|setlist|collection=…` | Now an explicit `type` discriminant; supports `mode=av` |
| `/player/output?s=…` | `/presenter/slides` (sort of) | AV projection output window — see §5 |
| (catch-all `$.tsx`) | `/404` | Same idea |
| **— (no equivalent)** | `/presenter` | **DROPPED** as a separate dedicated route. AV mode lives inside `/player`. |

So legacy `Presenter` (control surface) and `PresenterSlides` (projection window) collapse into one player route with a separate output window. Functionally analogous, structurally simpler.

---

## 3. Hub / list pages

| Capability | `frontend/` | `frontend2/` |
|---|---|---|
| Loads via | Single `GET /…` with no pagination (`api.get_songs()` etc.) | `useInfiniteQuery` + `X-Total-Count` pagination + load-more + IntersectionObserver |
| Search | **None** (songs list filters in memory after fetch) | Debounced `q` search on each hub + Cmd-K palette on tablet/desktop |
| Sort/filter | Hard-coded by title in `setlists.rs`/`songs.rs` | Title-sorted setlists; API sort with `relevance` for queries |
| List/card toggle | None — collections shown as fixed tile grid, songs/setlists as fixed list | `useHubViewMode(entity)` with persisted preference (`wv.hub.viewMode.*`) |
| Long-press | **None** | `useLongPress` (~500 ms) opens a Radix `ContextMenu` (`navigator.vibrate(10)` haptics) |
| Context-menu actions | Implicit via tile/row click only | Edit, Play, Play in Normal mode, Play in AV mode, Delete, Duplicate (setlists/collections), Export (ChordPro/WorshipPro/PDF) |
| Empty / error / skeleton | Single "No songs found." block | Skeletons matching layout, distinct "no results" vs "empty library", inline retry, pull-to-refresh |
| Profile / Avatar | Topbar account icon → `SideMenu` panel | `ProfileMenu` dropdown w/ Settings, Teams, Sessions, Install, Logout |
| Cmd-K command palette | **None** | `cmdk` + `commands/hub-commands.ts` + scoped song picker for setlist/collection editors |
| Online indicator | None | Online dot/offline banner near avatar |
| New entity flow | `New song` / `New setlist` button on the toolbar | FAB `+` per hub → `?new=1` latch that opens `CreateSongDialog`, `CreateSetlistDialog`, `CreateCollectionDialog`; songs route additionally exposes `SongCreateChooserSheet` with **Import** |

The new hub strictly supersedes the legacy hub in features. Nothing from legacy hubs is dropped.

---

## 4. Editors

### Song editor

Legacy: `frontend/src/pages/editor.rs` + `frontend/src/components/song_editor.rs`. It is a **single screen** with a CodeMirror 5 textarea (ChordPro source), an **inline live preview** of the rendered song side-by-side (`AspectRatio` at √2:1 inverse), a **manual Save** button, **Autoformat** (`auto_fix_high`), **Delete**, and a "new song" affordance that pivots to a "Start blank song" splash.

```rust
let show_viewer = state.0 > state.1;
// Editor controls (Topbar):
<span onclick={onback}>arrow_back</span>
<span onclick={delete_song}>delete</span>
<span onclick={toggle_new}>add</span>
// Editor toolbar (in `editor.rs`):
{autoformat}{delete}{discard}{save}
```

New: `frontend2/app/src/components/songs/SongEditorScreen.tsx`. Three tabs (**Meta / Source / Preview**), `useSongAutosave` (750 ms debounced PATCH, `single-in-flight`, retry / discard on failure, offline-freeze + "Resume editing?" prompt, `Retry-After` honoring), `useChordFormatPreference` for letter vs Nashville rendering of the source, `getChordEngine()` WASM gate that blocks the editor if WASM fails to load, strict parse gate that blocks save on parse errors, dedicated metadata-strip section (title/subtitle/artists/copyright/languages/tempo/timeSignature/key + arbitrary tags), `ImportSongsDialog` (multi-file import), `SongEditorActionsMenu` (per-song Import / Export / Delete), Ultimate Guitar URL import (`ultimate-guitar-import.ts`), read-only banner for `not_a_song` or no-permission, and a return-to-player back action.

**What's dropped from the legacy song editor:**
- **Side-by-side live preview pane (with `AspectRatio` √2:1)** — `frontend/src/components/aspect_ratio.rs` is gone; the new editor's preview is a separate tab, not a synchronized split pane. Use case ("read the rendered sheet while typing chords") still exists via the **Preview tab**, but you no longer see source + preview simultaneously on one screen.
- **Manual "Save" button + dirty/save icon**. New flow is autosave only; the chrome shows a tiny status dot (idle / pending / saving / error). There is no explicit "Save now" button — flush happens on tab close, route change, and Play.
- **"Autoformat" action (`auto_fix_high`)** that re-emitted the buffer through `format_chord_pro(None, None, None, true)`. The new editor formats only when reloading from the server or when switching chord-format preference; there is no on-demand "tidy this file" button.
- **"Discard" action** (legacy `editor.rs` had `cancel`/`discard`). The new editor only "discards" after a failed save (`discardFailedSave()`); there is no per-edit "throw away changes" button — autosave makes it irrelevant, but the affordance is gone.
- **"Start blank song" splash inside the editor** (`onstart_blank`). The new editor never shows a blank-start UI; "new song" is a hub-level dialog (`CreateSongDialog`).
- **CodeMirror 5 custom syntax styling** in legacy (`code_mirror_wrapper.js` defining the meta/chord/Nashville/translation-lyric coloring transitions) is replaced by a Lezer-backed highlighter in the chordpro-editor package — functional parity but a complete rewrite.

### Setlist editor

Legacy `frontend/src/pages/setlist_editor.rs` + `components/setlist_editor.rs` features:
- Title input
- Library search + add (paged but hard-coded to `PAGE_SIZE_MAX`)
- Native HTML5 drag/drop **and** touch drag for reorder
- "Move up / move down" arrows on each row
- Per-slot **key chooser** (12 musical keys)
- Per-slot **remove**
- **Manual Save** button
- **Delete setlist** with confirm dialog

New `frontend2/app/src/components/setlists/SetlistEditorScreen.tsx` features:
- Title input + **owner team picker** (legacy never exposed `owner`)
- `useSetlistAutosave` (debounced PATCH + field-diff + flush on Play/route change/offline; broken-slot gate)
- `@dnd-kit` reorder with keyboard sensor, pointer sensor, touch sensor and `restrictToVerticalAxis`/`restrictToParentElement` modifiers
- Per-slot key **popover** (12 keys + "Default" — pinnable)
- `SetlistSongPickerSheet` bottom drawer **AND** Cmd-K inline insert (via `SetlistPaletteBridge`) sharing one `useSongPickerQuery`
- Duplicate-slot badge ("Already in setlist (×N)")
- Broken-row reconciliation (404 / 403 / `not_a_song`)
- Last-write-wins multi-tab; `setQueryData` + invalidation contracts spelled out
- "Play" button (`EditorPlayButton`) that flushes saves before navigating
- Eviction watch (`useSetlistEvictionWatch`) that reacts to offline cache eviction

**What's dropped from the legacy setlist editor:**
- **"Move up / move down" arrow buttons** on each row. New reorder is **drag-and-drop only** (with keyboard sensor as a11y substitute). For non-keyboard non-pointer or fine-control users that liked tap-up / tap-down, this is a regression.
- **Explicit Save button**. Autosave replaces it. (Same trade-off as the song editor.)
- **Native HTML5 drag attributes that "just worked" from desktop** — the new editor depends on `@dnd-kit` and is a richer but heavier reorder UX.

### Collection editor

Legacy: **no collection editor exists.** Collections are read-only: `frontend/src/pages/collections.rs` just lists tiles that link straight to the player.

New: full `CollectionEditorScreen.tsx` parallel to the setlist editor, plus `MoveSongToCollectionDialog` (move a song from one collection to another), cover upload (`putCollectionCover`), team owner picker, autosave, picker, Cmd-K insert — all net-new.

---

## 5. Player and presenter — the biggest reshuffle

### Legacy player (`/player`)

`frontend/src/pages/player/player.rs` is the **chords-and-sheets reader** for a song / collection / setlist. Salient features:

- **Top bar with a Player ⇄ Presenter mode select**, plus Back, Edit, Edit-Setlist buttons.
- **Bottom bar** with:
  - **Chord representation `<select>`** (default vs **Nashville**) — toggle visible only for chords pages
  - **Key override `<select>`** (default + 12 musical keys) — visible only for chords pages
  - A native `<input type="range">` page slider
  - A numeric "page X / N" input
  - A `scroll_type` cycle button (e.g. "Half-page")
- **Tap zones**: <40 % width → prev, >60 % → next, middle → toggle chrome; **double-tap middle** → toggle like (heart/unheart bursts).
- **Keyboard**: Arrow/PageUp/PageDown/Space/Enter/j/k for nav; `e` (edit song), `s` (scroll type), `m` (toggle chrome), `Esc` (back), `A-G` (set key), `b`/`-` (flat / down), `#`/`+` (sharp / up), `r` (reset key), `l` (like), `n` (toggle Nashville).
- **TOC drawer** (`TableOfContentsComponent`) with three filter/sort modes: **pin** (real order), **alphabetical**, **liked**.
- **`PagesComponent`** with single-page / dual-page (book / half-page) rendering using A4 (√2) aspect math.

### Legacy presenter (`/presenter` + `/presenter/slides`)

Two routes that work together:

- **`/presenter`** (`frontend/src/components/presenter/presenter.rs`) is the **operator console**: TOC sidebars (real / alphabetical / liked), section outline, the current `Slide` preview, and a **`Settings` panel** (max lines/slide, font size, text alignment, vertical position, horizontal position, text shadow, text transform, **background** = Black / Red / Ray).
- **`/presenter/slides`** (`frontend/src/pages/presenter_slides.rs`) is the **fullscreen projection screen** opened with `window.open('/presenter/slides', '_blank')`. It listens for `localStorage` writes via the `StorageEvent` API and renders the current `Slide`. Double-click requests fullscreen.

The handshake between the two windows is `SlideSync` in `frontend/src/components/presenter/slide_sync.rs`, which broadcasts `SlideProps` through `localStorage`:

```rust
pub fn broadcast(&self, data: &SlideProps) {
    if let Some(window) = window() {
        if let Ok(Some(storage)) = window.local_storage() {
            if let Ok(json) = serde_json::to_string(data) {
                if let Err(e) = storage.set_item(STORAGE_KEY, &json) {
                    gloo::console::error!(…);
                }
            }
        }
    }
}
```

Presenter keyboard shortcuts (in `presenter.rs`):
- `←/→/↑/↓/PgUp/PgDn/Space` — prev/next slide chunk within outline
- `c` Chorus, `v` Verse / Verse 1, **`1`–`9`** Verse N, `p` Pre-Chorus, `b` Bridge
- `n` next song, `N` previous song
- `o` open second-window projection (`/presenter/slides`)
- `e` edit current song, `E` edit setlist, `Esc` back
- `r` blank (clear text), `R` blackout (clear text + black)
- `l` like current song

### New player (`/player` Book mode)

`frontend2/app/src/components/player/PlayerBook.tsx` (≈ 820 lines) + `PlayerRoute.tsx` + slides (`BlobSlide`, `ChordsSlide`, `ChordsThreeColumnSlide`) + `PlayerBookSpread` + `PlayerTocSidebar`. New capabilities the legacy never had:

- **`type` discriminator** baked into the URL (`song` | `setlist` | `collection`) instead of three different query params.
- **Six scroll modes** chosen by orientation in Settings (legacy had two): `one_page`, `book`, `two_column`, `two_column_next`, `three_column`, `three_column_next`. Multi-column rendering uses `ChordsThreeColumnSlide` with WASM section packing.
- **Per-item transpose persistence** (`useTransposeForItem`, `PlayerViewState` in `playerView:{type}:{id}`) including a popover that lists all 12 musical keys + Default.
- **Resource title** lookup via `usePlayerResourceTitle`.
- **Online/offline-aware prefetch** of next item; blob fetch goes through `useBlobUrl` + Dexie mirror.
- **Setlist eviction watch** with a persistent banner if the local mirror is evicted.
- **Animated chrome** (`motion/react`) with reduced-motion respect; tap zones identical to legacy (40/60 % zones + double-tap-like burst); swipe gesture in addition to tap.
- **Like burst animation** (`PlayerLikeHeartBurst`).
- **TOC sidebar** with the same three modes (`order`, `alphabetical`, `liked`) **plus** language and tag filters (`toc-filters.ts`), so the legacy filter set is preserved and extended.
- **Edit Song / Edit Setlist / Edit Collection** buttons in chrome; **Settings** quick-access button that deep-links to the AV settings tab with a return context.
- **Keyboard** (`player-keyboard.ts`): arrows / PgUp / PgDn / Space / Enter / j / k for nav; **`Home` / `End`**; `e` edit; `m` toggle chrome; `s` cycle scroll mode; `l` like; **`n` toggles chord format (letter ↔ Nashville)**; `A`–`G` set transpose; `b`/`-`, `#`/`+`, `r` reset; `Escape` back.

### New AV mode (`/player?…&mode=av` + `/player/output?s=…`)

`frontend2/app/src/components/player/av/PlayerAv.tsx` is the **new presenter**. It uses the same player resolution pipeline as Book mode (single source of truth) and renders:

- A **TOC sidebar** (shared `PlayerTocSidebar`).
- A **section-shortcuts bar** (`AvSectionShortcuts`) with explicit visible chips for jumps.
- A **slide deck panel** (`AvSlidesPanel`) clickable cards.
- A **current/next preview pane + outline panel** (`AvSlideView`, `AvOutlinePanel`) on the right.
- A **separate projection window** at `/player/output?s={sessionId}` driven by a `BroadcastChannel`-based `AvProjectionSync` (replaces the legacy `StorageEvent` transport).
- Background presets that **explicitly preserve the legacy semantics**: `0 = Black, 1 = Red, 2 = Ray` — see `frontend2/app/src/lib/player/av-preferences.ts`:

```ts
/** Legacy presenter backgrounds: 0 = black, 1 = red gradient, 2 = ray image. */
export type AvBackgroundPreset = 0 | 1 | 2

export const AV_BACKGROUND_PRESETS = [0, 1, 2] as const satisfies readonly AvBackgroundPreset[]
```

- **Settings**: max lines/slide, **balanceSlideLines** (new), fontSize, textAlign (l/c/r), verticalAlign (top/center/bottom), horizontalAlign (l/c/r), textShadow (none/subtle/medium/strong), textTransform (none/upper/lower/capitalize), background preset (0/1/2), **transition style** (none/fade/slide — new), **transition duration** (new), **outputFullscreenOnDblClick** (new), **collapseLyricWhitespace** (new), default player mode (Normal/AV — new).
- **Keyboard** (`av-keyboard.ts`): arrows / PgUp / PgDn / Space / Enter / j / k for nav; `Home` / `End`; **`r` = blank** (clear text, keep background), **`R` = blackout** (full black); **`o` = open projection window**; **`n`/`N` = next/prev song**; **`c` Chorus, `v` Verse, `p` Pre-Chorus, `1`–`9` Verse 1–9, `b` Bridge, `t` Tag, `e` Ending** for section jumps.

### Player / presenter — what the new app drops

Even after AV mode replaces the presenter and adds new affordances, **a handful of legacy behaviors are not carried over verbatim**:

| Legacy capability | Status in `frontend2/` | Notes |
|---|---|---|
| Player ↔ Presenter mode switcher in the player **top bar** (`TopbarSelect`) | **Dropped** | Mode is decided **before** entry (default in Settings; "Play in Normal / AV mode" entries in the hub context menu). E8.1 grill explicitly decided **no in-player mode toggle**: see `frontend2/docs/plan.md` decision log entry `2026-05-23 E8.1`. |
| Player **bottom-bar chord representation `<select>`** (default vs Nashville) | **Dropped from the player UI** | `n` keyboard shortcut still toggles letter vs Nashville and Settings exposes it, but no on-screen `<select>` button. Mouse-only users lose discoverability. |
| Player **bottom-bar key `<select>`** with all 12 keys | **Replaced** by a "current key" button → **popover** with 12 keys + Default (top-bar, only when chords). Looks different and is in a different place. |
| Player **bottom-bar numeric page input** ("X / N") | **Dropped** | Page jump is keyboard / TOC only; there's no editable "go to page" field. |
| Player **bottom-bar page slider** (`<input type="range">`) | **Dropped** | Same: TOC + arrows + swipe, no scrubber. |
| Player **bottom-bar scroll-type label/button** ("Half-page" etc.) | **Replaced** by Settings tab + `s` keyboard shortcut. No always-visible button in chrome. |
| `PresenterPage` with the three TOC sidebar **panels** showing alphabetical / liked sort modes for **song selection** in the operator console | **Functionally preserved** by `PlayerTocSidebar` (it has the same three modes), but moved into the player TOC drawer rather than a side rail. |
| Pre-Chorus shortcut **`p`** in presenter | **Restored (E8.1.x)** | Mapped in `AV_SECTION_JUMP_SHORTCUTS`; visible chip when outline contains Pre-Chorus. |
| Verse shortcuts **`5`–`9`** in presenter | **Restored (E8.1.x)** | `5`–`9` mapped in `AV_SECTION_JUMP_SHORTCUTS`; chips appear when sections exist. |
| Distinction between **`r` reset (clear text only)** vs **`R` blackout (clear + black)** | **Restored (E8.1.x)** | `screenState: 'live' \| 'blank' \| 'blackout'` in `AvSlideView` + projection payload; separate shortcut chips. |
| Presenter **`o`** keyboard shortcut to open the projection window | **Restored (E8.1.x)** | `o` key + `aria-keyshortcuts` on header output button. |
| `AspectRatio` √2 (DIN A4) component (`frontend/src/components/aspect_ratio.rs`) used in song editor preview pane | **Dropped** | No equivalent split-preview in the new song editor (see §4). |
| `string_input.rs` controlled-input helper, the `topbar.rs` Topbar / TopbarButton / TopbarSelect family, `legal_links.rs`, `toast_notifications` | **Replaced** | By shadcn primitives + `sonner` for toasts + Tailwind chrome and `LegalLinks` via i18n footer in `login.tsx`. |
| `aspect_ratio.rs` based **side-by-side song editor preview** | **Dropped** (see §4 above). |

The **transport** for the projection window also changed: legacy used `localStorage` + `StorageEvent`, new uses `BroadcastChannel` (`createAvProjectionSync` in `frontend2/app/src/lib/player/av-projection-sync.ts`). Functionally similar, but the channel name carries a session id, which is more correct for multi-tab setups.

---

## 6. Authentication, session, profile

| Capability | `frontend/` | `frontend2/` |
|---|---|---|
| OTP login | `LoginPage` with hand-rolled email + code inputs | `login.tsx` with OAuth + OTP **tabs**, `return_to` allowlist, problem-body inline display |
| OAuth | Google button (Apple button commented out) | OAuth entry point, configurable providers |
| Logout | `LogoutPage` calling `api.logout()` then redirecting | Same call + Dexie + Query cache wipe (`clearAllLocalData`), with offline queue (`logout-queue.ts`) for offline logouts |
| `GET /users/me` refetch | On `side_menu` open only | Cached for 15 min, refetched on window focus and after login |
| Profile picture | Upload + remove in `SideMenu` (`upload_profile_picture`, `delete_uploaded_profile_picture`) | Same APIs in `SettingsProfilePictureSection`, plus avatar fallback via `useUserAvatarDisplay`, OAuth-avatar fallback |
| **Teams / invitations / sessions** | **None at all** — no routes, no API calls beyond `list_my_sessions` (dead code) | Full `/teams`, `/teams/$teamId`, `/sessions`, `/join` flows |
| 401 handling | `Api::handle_error` pushes `/logout` on 401 | `api-unauthorized.ts` + `logout-queue.ts` triggers full local wipe |

The new app **does not drop** anything from legacy auth; it adds a whole org/account surface.

---

## 7. Capability checklist — what `frontend2/` has that `frontend/` did not

This is the inverse half of the analysis (to show the scope shift). All net additions:

- **Teams** (list, create, detail, members, roles, invitations, invite links): `/teams`, `/teams/$teamId`, `/join`.
- **Sessions**: `/sessions` with revoke.
- **Settings**: `/settings` with General / Player / Player roles tabs.
- **Import / export** (`epic-e6`): single-song or batch ChordPro / WorshipPro `.zip` import; hub long-press Export for songs / setlists / collections in ChordPro / WorshipPro / PDF (print). See `lib/song-import-export.ts`, `lib/run-song-export.ts`, `lib/run-setlist-export.ts`, `lib/run-collection-export.ts`, `components/songs/ImportSongsDialog.tsx`.
- **Ultimate Guitar URL import** in the song editor (`lib/ultimate-guitar-import.ts`).
- **Collection editor** (not present in legacy at all).
- **Move song between collections** dialog.
- **Cmd-K palette** with Navigate / Actions / song-picker (insert into setlist or collection).
- **Long-press + context menu** with vibration haptics.
- **Pull-to-refresh** on hub lists.
- **Card / list view toggle per hub** with persistence.
- **Duplicate** for setlists and collections.
- **Offline:**
  - Dexie mirror of last-opened setlist players + blobs, LRU + byte budget.
  - Offline indicator near avatar; create disabled offline with explanation.
  - Setlist emergency playback while offline.
  - Resume-editing prompt after coming back online.
  - Persistent eviction grace banner.
- **PWA install UX**: `beforeinstallprompt` on Android/desktop, iOS instructions, update toast (`PwaInstallProvider`).
- **i18n EN + DE** + `?lang=` QA override + browser-mapped resolution.
- **Theme**: system / light / dark with OS auto-follow (`appearance.ts`).
- **Default player mode** preference (Normal vs AV).
- **AV mode**: blackout, projection window via `BroadcastChannel`, dual-screen flow with single-screen fallback warning, transition style + duration, lyric-whitespace collapsing, background presets preserved.
- **Player view state per item**: transpose, scroll mode, orientation, chord format saved to `localStorage` per resource.
- **Multi-column scroll modes**: `two_column`, `two_column_next`, `three_column`, `three_column_next` (legacy had at most book / half-page).
- **TOC language and tag filters** in the player drawer (on top of the legacy order/alpha/liked modes).
- **Setlist editor**: owner team picker, broken-row gate, duplicate badge, key popover with default, `@dnd-kit` reorder, autosave + flush on Play.
- **Song editor**: structured metadata-strip pane (subtitle/artists/copyright/languages/tempo/timeSignature/key/tags), Meta/Source/Preview tabs, autosave, parse gate, WASM-load gate, retry with `Retry-After`, "Resume editing?" after offline.
- **Sheet-image background and inversion** preferences for chord rendering (`sheet-background.ts`, `sheet-image-invert-preference.ts`).
- **Lyric whitespace collapse** preference for AV.
- **Command registry** (`commands/hub-commands.ts`).
- **Frontend CI workflow** (`.github/workflows/frontend-ci.yml`) running test + typecheck + lint + build.
- **Vitest suite** of ~242 tests, none of which existed before.

---

## 8. Dropped features — single consolidated list

Strictly enumerating what the legacy could do and the new one **cannot** (or does noticeably worse / via a less discoverable surface):

1. **Side-by-side ChordPro source + rendered preview in the song editor** (`AspectRatio` √2 split). Replaced by a Preview tab, not a split.
2. **Manual "Save" button in editors.** Replaced by autosave; the only "save" UI is a status dot.
3. **"Autoformat" action in the song editor** that re-emitted the source through `format_chord_pro(…, sort=true)`. No on-demand tidy-up exists in the new editor.
4. **"Discard" action in the song editor.** Only post-failure rollback exists; no "throw away local edits" while authoring.
5. **"Start blank song" splash inside the editor** when toggling `+`. Replaced by `CreateSongDialog` at the hub.
6. **Manual up/down arrow reordering in the setlist editor.** Reorder is drag-only (with keyboard sensor); the on-screen arrow buttons are gone.
7. **Player top-bar "Player ↔ Presenter" mode switcher.** Mode now lives in Settings / hub context menu only (no in-player toggle by design — E8.1 decision).
8. **Player bottom-bar chord-representation `<select>`** (Default ↔ Nashville). Keyboard `n` and Settings still toggle it; the on-screen control is gone.
9. **Player bottom-bar key `<select>`** with 12 keys. Replaced by a top-bar **popover** button — works but is repositioned and looks different.
10. **Player bottom-bar "page X / N" number input** and the **page range slider**. No page-jump scrubber remains.
11. **Player bottom-bar scroll-type cycle button.** Reachable only via `s` keyboard or Settings.
12. ~~**Presenter `p` (Pre-Chorus) shortcut.**~~ **Restored in E8.1.x.**
13. ~~**Presenter `5`–`9` verse shortcuts.**~~ **Restored in E8.1.x.**
14. ~~**Distinct `r` (blank/clear text) vs `R` (blackout)** behaviors.~~ **Restored in E8.1.x** via `screenState: 'live' | 'blank' | 'blackout'`.
15. ~~**Presenter `o` keyboard shortcut to open the projection window.**~~ **Restored in E8.1.x.**
16. **`/presenter` as a dedicated route.** Replaced by `/player?mode=av` — equivalent for users, but anyone with bookmarks to `/presenter` or `/presenter/slides` will get a 404 (caught by `routes/$.tsx`).
17. **`SlideSync` via `localStorage` + `StorageEvent`.** Replaced by `BroadcastChannel`; same effect, but third-party tooling watching `localStorage` will no longer pick it up.
18. **`AspectRatio` component** (`frontend/src/components/aspect_ratio.rs`). No general-purpose √2:1 layout helper exists.
19. **Apple OAuth button.** The code path is commented out in legacy already, and the new login keeps OAuth generic — practically the same status but worth noting.

Everything else from legacy has either an equivalent or a richer replacement.

---

## 9. Conclusions

- The new frontend is **a strict superset of the legacy frontend in product scope**: it adds offline, PWA, i18n, theming, teams, sessions, settings, import/export, command palette, collection editor, multi-column player modes, AV projection variant, and Vitest coverage.
- The cases where it **drops** something fall into two clean buckets:
  1. **UX deliberately consolidated** (single autosave instead of Save/Discard buttons; one mode chooser at Settings / context menu instead of the in-player Player↔Presenter switcher; the AV variant replacing the dedicated `/presenter` routes).
  2. **Player chrome simplified** (no bottom-bar slider / page input / scroll-type label / chord-representation select / key select; the popover + Settings + keyboard combo carries the load but is less discoverable for mouse-only users).
- A small number of **legitimate functional regressions** remain (see §8 items 1–11, 16–19); the four AV presenter shortcuts restored in **E8.1.x** (§8 items 12–15) are no longer open gaps.

---

## 10. Triage decisions (2026-05-23)

Per a deliberate review of each entry in §8, the following triage stands:

| # | Dropped feature | Decision |
|---|---|---|
| 1 | Split source + preview in song editor | Keep dropped |
| 2 | Manual "Save" button in editors | Keep dropped |
| 3 | Autoformat in song editor | Keep dropped |
| 4 | Discard changes in song editor | Keep dropped |
| 5 | "Start blank song" splash inside the editor | Keep dropped |
| 6 | Setlist editor up/down arrow buttons | Keep dropped |
| 7 | In-player Player ↔ Presenter mode switcher | Keep dropped (E8.1 stands) |
| 8 | Bottom-bar chord-representation `<select>` | Keep dropped |
| 9 | Bottom-bar key `<select>` (replaced by popover) | Keep dropped |
| 10 | Bottom-bar page input and slider | Keep dropped |
| 11 | Bottom-bar scroll-type cycle button | Keep dropped |
| 12 | Presenter `p` (Pre-Chorus) shortcut | **Restored (E8.1.x)** |
| 13 | Presenter Verse `5`–`9` shortcuts | **Restored (E8.1.x)** |
| 14 | Distinct `r` blank vs `R` blackout | **Restored (E8.1.x)** |
| 15 | Presenter `o` to open projection window | **Restored (E8.1.x)** |
| 16 | `/presenter`, `/presenter/slides` routes | Keep dropped |
| 17 | `SlideSync` via `localStorage` | Keep dropped |
| 18 | `AspectRatio` √2 helper component | Keep dropped |
| 19 | Apple OAuth button | Keep dropped |

---

## 11. Action plan — re-implement the four AV regressions

All four selected items are AV-mode behavior. They share two files (`frontend2/app/src/lib/player/av-keyboard.ts` and `frontend2/app/src/components/player/av/PlayerAv.tsx`) and one preferences file (`frontend2/app/src/lib/player/av-preferences.ts`), so they should ship as one cohesive change.

### 11.1 Overall structure

Suggested PR title: **"E8.1.x — AV mode: restore Pre-Chorus / Verse 5–9 jumps, blank-vs-blackout, and `o` shortcut"**

Recommended commit order (each commit independently passing `pnpm -C frontend2 test`):

1. Extend `AV_SECTION_JUMP_SHORTCUTS` with `p` + `5`–`9`, plus tests.
2. Introduce `screenState: 'live' | 'blank' | 'blackout'` and rename the `blackout` boolean accordingly through preferences, projection payload, and `AvSlideView`, plus tests and migration.
3. Bind keyboard `r` to "blank", `R` (Shift+r) to "blackout", and `o` to "open output", plus tests.
4. Wire the new states + actions into `PlayerAv.tsx`, `AvSectionShortcuts.tsx`, and `AvOutputPage`.
5. Add i18n strings, update `legacy-vs-frontend2-analysis.md` and `frontend2/docs/plan.md` decision log.

### 11.2 Detailed work breakdown

#### Step 1 — Pre-Chorus and Verse 5–9 keyboard jumps (covers f12 + f13)

**File**: `frontend2/app/src/lib/player/av-keyboard.ts`

- In `avKeyboardAction`, extend the `case '1' … case '4'` block to include `'5' '6' '7' '8' '9' 'p'` so they all return `'jumpSection'`. Keep the existing structure (single `return 'jumpSection'`).
- Extend `AV_SECTION_JUMP_SHORTCUTS` with:
  - `{ key: 'p', sectionTitle: 'Pre-Chorus' }` — match legacy `presenter.rs` (line 290) which used the literal `"Pre-Chorus"` title; `avPresentationIndexForSectionTitle` already matches both exact title and `"Pre-Chorus (2)"` repeats.
  - `{ key: '5'..'9', sectionTitle: 'Verse 5'..'Verse 9' }`.
- Insertion order matters: in `AvSectionShortcuts`, the bar renders shortcuts in array order, so put `p` after `Verse` and before `1`, and append `5`–`9` after `4`, before `b/t/e`. This matches both legacy presenter ordering and avoids reflowing the existing button strip.

**Tests**: `frontend2/app/src/lib/player/av-keyboard.test.ts`

- Add cases to `'maps blackout and section jump keys'` for `'p'`, `'5'`, `'9'` → `'jumpSection'`.
- Add cases to `'avSectionJumpTitle'` for `'p'` → `'Pre-Chorus'`, `'5'` → `'Verse 5'`, `'9'` → `'Verse 9'`.
- Extend the `avAvailableSectionJumpShortcuts` outline fixture to include `'Pre-Chorus'` and `'Verse 7'`, and assert both new shortcuts appear.

**i18n**: no new strings; `t('player.av.sectionJump', { section, key })` already covers the labels.

#### Step 2 — Replace `blackout: boolean` with `screenState: 'live' | 'blank' | 'blackout'` (covers f14)

This is the biggest change because the boolean is referenced from preferences, the projection payload, `AvSlideView`, `AvSectionShortcuts`, `PlayerAv.tsx`, and `AvOutputPage.tsx`. The model differences:

| State | Background visible | Foreground text visible |
|---|---|---|
| `live` | Yes (preset 0/1/2) | Yes (current slide) |
| `blank` | **Yes** (current background preset) | **No** |
| `blackout` | No (forced black) | No |

Legacy semantics: `r` = blank (clear text, keep background), `R` = blackout (clear + black).

**File**: `frontend2/app/src/lib/player/av-preferences.ts`

- Add `export type AvScreenState = 'live' | 'blank' | 'blackout'`.
- Replace `blackout: boolean` in `AvProjectionPayload` with `screenState: AvScreenState`. Keep an `inputs.blackout` overload in `buildAvProjectionPayload` for one commit cycle and forward to `screenState` to ease migration of any in-flight tests.
- `effectiveAvTransition` is unchanged.
- Bump `AV_PREFERENCES_STORAGE_KEY` is **not** needed (preferences don't store screen state).

**File**: `frontend2/app/src/components/player/av/AvSlideView.tsx`

- Change `blackout: boolean` prop to `screenState: AvScreenState`.
- Replace the early-return for blackout with:
  - `if (screenState === 'blackout')` → render `av-slide-view--blackout` (existing class, full black).
  - `if (screenState === 'blank')` → render the background layer **only** (no `AvSlideContent`, no `motion.div`).
  - Otherwise render the full live view as today.
- Add an aria-hidden text alternative on `blank` so screen readers still get "blank screen — background only" if needed.

**File**: `frontend2/app/src/components/player/av/AvOutputPage.tsx`

- Update the default `viewPayload` to `screenState: 'live'`.
- Pass `screenState` through to `AvSlideView`.

**File**: `frontend2/app/src/components/player/av/AvSectionShortcuts.tsx`

- Replace `blackout: boolean`, `onToggleBlackout` props with `screenState: AvScreenState`, `onSetScreenState(state)`.
- Render **two** chips after the section list:
  - `R` chip → "Blackout" (active when `screenState === 'blackout'`), toggles between `'blackout'` and `'live'`.
  - `r` chip → "Blank" (active when `screenState === 'blank'`), toggles between `'blank'` and `'live'`.
- Keep `aria-keyshortcuts="r"` on Blank and `aria-keyshortcuts="R"` on Blackout (uppercase letter = Shift+r per ARIA spec).

**File**: `frontend2/app/src/components/player/av/PlayerAv.tsx`

- Replace `session.blackout: boolean` with `session.screenState: AvScreenState` in the local session state shape. Default to `'live'`.
- Reset to `'live'` on `goToItem` and `goToSlide` (matches today's `clearBlackout`).
- In the keyboard handler, replace the `'toggleBlackout'` branch:
  - Detect Shift via `e.shiftKey || e.key === 'R'`. The new `avKeyboardAction` returns `'toggleBlackout' | 'toggleBlank'` (see Step 3 below). Map respectively.
- Build the projection payload from `screenState` (just pass it through).

#### Step 3 — Keyboard mapping for `r`/`R` and `o` (covers f15 + f14 keyboard half)

**File**: `frontend2/app/src/lib/player/av-keyboard.ts`

- Extend `AvKeyboardAction` with `'toggleBlank' | 'toggleBlackout' | 'openOutput'`.
- Update `avKeyboardAction`:
  - `case 'r': return 'toggleBlank'`
  - `case 'R': return 'toggleBlackout'` (browsers always emit `'R'` literal when Shift is held; no need to inspect `e.shiftKey` since `key` already encodes it).
  - `case 'o': return 'openOutput'`
- Replace `AV_BLACKOUT_SHORTCUT_KEY` with two constants:
  - `AV_BLANK_SHORTCUT_KEY = 'r'`
  - `AV_BLACKOUT_SHORTCUT_KEY = 'R'`
- Add `AV_OPEN_OUTPUT_SHORTCUT_KEY = 'o'` for the header button's `aria-keyshortcuts` hint.

**Tests**: `frontend2/app/src/lib/player/av-keyboard.test.ts`

- Add `expect(avKeyboardAction('r', body)).toBe('toggleBlank')`.
- Add `expect(avKeyboardAction('R', body)).toBe('toggleBlackout')`.
- Add `expect(avKeyboardAction('o', body)).toBe('openOutput')`.
- Add `expect(avKeyboardAction('R', mockTarget('INPUT'))).toBeNull()` to confirm input-target guard still applies.

#### Step 4 — Wire the new actions in `PlayerAv.tsx`

**File**: `frontend2/app/src/components/player/av/PlayerAv.tsx`

In the `onKeyDown` handler add:

```ts
if (action === 'toggleBlank') {
  e.preventDefault()
  setSession((state) => ({
    ...state,
    screenState: state.screenState === 'blank' ? 'live' : 'blank',
  }))
  return
}
if (action === 'toggleBlackout') {
  e.preventDefault()
  setSession((state) => ({
    ...state,
    screenState: state.screenState === 'blackout' ? 'live' : 'blackout',
  }))
  return
}
if (action === 'openOutput') {
  e.preventDefault()
  openOutputWindow()
  return
}
```

Also:

- Add `aria-keyshortcuts="o"` to the existing "Open output" header `Button` so the binding is discoverable from accessibility tooling.
- Remove the bespoke `if (!action && (e.key === 'n' || e.key === 'N')) { … }` block? **No** — keep it as-is. `n`/`N` for next/prev song is unrelated to this change and already correct.

#### Step 5 — i18n strings

**File**: `frontend2/app/src/i18n/en.json` (and `de.json`)

Inside `player.av`:

- Add `"blank": "Blank"` and `"blankToggle": "Toggle blank screen"`.
- Rename the existing `"blackoutToggle"` label to remain "Toggle blackout (Shift+R)" for clarity. Update `"openOutput"` to read "Open output (O)" for the same reason.
- Keep `"blackout"`, `"blackoutOn"` as today.

**File**: `frontend2/app/src/i18n/de.json` — mirror translations.

#### Step 6 — Docs

- Add a one-line entry to `frontend2/docs/plan.md` decision log:
  - `2026-05-23 E8.1.x — Restore legacy presenter parity: Pre-Chorus + Verse 5–9 jumps, distinct r/Shift+R for blank/blackout, o opens projection window.`
- Update `frontend2/docs/legacy-vs-frontend2-analysis.md`:
  - In §8 mark entries 12/13/14/15 as "Restored in E8.1.x".
  - In §5 update the "What the new app drops" table to note the restored behaviors.

### 11.3 Test plan

Run order before merging:

1. `pnpm -C frontend2/app test --run` (Vitest suite, ensure ≥242 green).
2. `pnpm -C frontend2/app typecheck`.
3. `pnpm -C frontend2/app lint`.
4. `pnpm -C frontend2/app build`.

Manual smoke (one operator + one projection window):

- Load a setlist player in AV mode with a song containing **Verse 1–7**, **Pre-Chorus**, **Chorus**, **Bridge**.
- Press `1 … 7` and `p` and confirm the projected slide jumps; the inline `AvSectionShortcuts` bar shows the corresponding chips.
- Press `r` — operator and projection both go to background-only (text disappears, background remains). Press `r` again — text returns.
- Press `Shift+r` (`R`) — projection goes fully black. Press `Shift+r` again — text returns.
- Toggle `r` ↔ `Shift+r` directly without going through `live` and confirm states swap as expected (`blank` → `blackout` → `blank`).
- Press `o` — a new projection window opens. Press `o` again with the window open — focus the existing one (existing `openOutputWindow` already short-circuits).
- Confirm `r`/`R`/`o` are no-ops when focus is inside an `<input>` or `[contenteditable]` (existing `isEditableTarget` guard).
- Confirm screen readers announce the new chip labels and that `aria-pressed` toggles for both Blank and Blackout chips.

### 11.4 Acceptance criteria

- `AV_SECTION_JUMP_SHORTCUTS` contains entries for `p`, `5`, `6`, `7`, `8`, `9` and the displayed labels follow legacy conventions.
- `AvScreenState` replaces every `blackout: boolean` reference in the AV module (verified by `grep blackout frontend2/app/src/{lib,components}/player/av`).
- `avKeyboardAction` returns `'toggleBlank'` for `'r'`, `'toggleBlackout'` for `'R'`, and `'openOutput'` for `'o'`.
- `AvSlideView` renders three visually distinct states (live, blank=background-only, blackout=full black) and old screenshots of the projection still match for the `live` state.
- All Vitest, typecheck, lint, and build commands pass.
- `frontend2/docs/plan.md` includes the new decision-log entry.

### 11.5 Rollback / risk

- Risk is contained to the AV module; Normal mode is untouched.
- The renamed `blackout` field flows through `localStorage` only as an ephemeral per-mount session, **not** persisted, so no migration is required. (Persistent AV preferences in `AV_PREFERENCES_STORAGE_KEY` don't reference screen state — verified in `av-preferences.ts`.)
- Reverting is a single-commit revert of the merge.

---

## 12. Estimated effort

| Step | Owner-hours |
|---|---|
| Step 1 — Pre-Chorus + Verse 5–9 shortcuts and tests | ~0.5 h |
| Step 2 — `screenState` model across AV preferences + view + output | ~2 h |
| Step 3 — Keyboard mapping for `r`/`R`/`o` and tests | ~0.5 h |
| Step 4 — Wire actions into `PlayerAv` + `AvSectionShortcuts` | ~1 h |
| Step 5 — i18n (EN + DE) | ~0.25 h |
| Step 6 — Docs + manual smoke | ~0.75 h |
| **Total** | **~5 h** |

