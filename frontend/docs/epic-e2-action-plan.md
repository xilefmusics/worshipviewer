# Epic E2 — step-by-step action plan

**Epic:** [E2 — Three hub lists (collections, songs, setlists)](./roadmap.md#e2--three-hub-lists-collections-songs-setlists)  
**Grill record:** [E2 interactive grill (user session)](./grill-session.md#e2-interactive-grill-user-session-resolved).

**Prerequisite:** [Epic E1](./epic-e1-action-plan.md) complete (auth, branding, minimal shell, i18n baseline).

Execute in order unless a step explicitly allows parallel work. Check off each step in your issue tracker or PR description.

---

## 0. Resolved product choices (interactive grill)

These are **locked for E2** unless the team explicitly reopens them:

| Topic | Choice |
|--------|--------|
| **`/` landing** | **`/` → `/collections`** redirect once the three hub routes ship (replace E1 stub). |
| **List primary tap** | **Target UX:** open **`/player`** for the tapped entity (`type` + `id`). **E2 implementation:** **no-op** — same **normal** affordance as a future live row (no **disabled** styling, no **`console`**); **no** `navigate()`, **no** URL change. |
| **Create (+)** | **Normal** control on hub routes; **E2:** activation is a **no-op** (no modal, no API POST, **no** **`console`**). |
| **Profile menu** | **Username** (if `/me` exposes it) + **Logout** + **Settings / Teams / Sessions** (and **Install app** if shown) — **same visual treatment as live menu rows**; until E3–E5, choosing those entries is a **no-op** (**no** navigation, **no** disabled/“Soon” styling, **no** **`console`**). |
| **Long-press Play** | **Normal** menu row (same as other actions); **E2 / pre-E8:** choosing **Play** is a **no-op** — **no** disabled styling, **no** extra explanation copy, **no** **`console`**. |
| **Long-press Delete** | **Real feature** when OpenAPI exposes DELETE: **confirm** → mutation → **invalidate** infinite query / remove from cache. |
| **Docs alignment** | Update normative docs (**[pages-and-flows.md](./pages-and-flows.md)**, **[app-shell.md](./app-shell.md)**) **in the same epic** as code so list **tap → player** (E2 = no-op until player ships) is the source of truth. |

---

## 1. Routing and redirect

1. Add authenticated routes **`/collections`**, **`/songs`**, **`/setlists`** with the **full hub shell** (see §4).
2. Change **`/`** from the E1 stub to a **redirect** → **`/collections`** for authenticated users.
3. Ensure **`return_to`** / post-login default still lands sensibly (typically **`/`** → **`/collections`** after redirect is in place).
4. Register **unknown** paths under the authenticated layout per E1 rules (not-found vs login).

---

## 2. OpenAPI list integration

1. From **`docs/openapi.json`**, wire **typed list operations** for **collections**, **songs**, and **setlists** (paths + query params per spec).
2. Implement **`useInfiniteQuery`** per [api-integration.md](./api-integration.md): **`page`**, **`page_size`**, **`X-Total-Count`** for **`hasNextPage`**; **no** guessing next page if the header is missing.
3. **Search:** bind header field and Cmd-K palette search to **`q`** with **~300 ms debounce** and **`AbortController`** cancel on query change; when spec requires **`sort=relevance`** for non-empty **`q`**, set it.
4. Apply **optional** song filters (**`lang`**, **`tag`**) only if you expose UI in E2; otherwise omit (roadmap allows “where API supports” — do not add sort/filter chips per api-integration v1).

---

## 3. List UI states and gestures

1. **Skeleton** first load matching **card** (collections) vs **row** (songs, setlists) layouts.
2. **Infinite scroll** via **IntersectionObserver** sentinel + accessible **Load more** control.
3. **Pull-to-refresh:** reset to page 0, invalidate query, **scroll to top** on success ([app-shell.md](./app-shell.md)).
4. **Errors:** inline **Retry** in the scrollable region; keep shell chrome.
5. **Empty vs no search results:** distinct copy and **Clear search** when **`q`** is set ([pages-and-flows.md](./pages-and-flows.md)).
6. **View mode toggle** (list/card) per entity with **persisted** preference ([app-shell.md](./app-shell.md)).
7. **`useLongPress`** (+ right-click where applicable): context menu with **Edit** **omitted** until **E7** (no editor chrome in E2), **Delete** (live if API supports), **Play** (normal row; **no-op** until player ships — see §0), **Duplicate** only if API supports in spec.
8. **Primary tap** on hub list items: **no-op** (see §0) — **no** `console`, **no** “disabled” list row styling.

---

## 4. App shell (E2 scope)

1. **Bottom tab bar:** **Collections** | **Songs** | **Setlists** — correct **active** tab per route.
2. **Top:** **floating search** (debounced **`q`**); **avatar** opens profile menu.
3. **Bottom-right `+`:** **normal** control; **E2:** **no-op** on activate (see §0).
4. **Cmd-K / Ctrl-K** (tablet with hardware keyboard + desktop only): **`cmdk`** + **command registry**; **Navigate** includes the **three hubs** **and** may list **Settings / Teams / Sessions** (and **Install** when the row exists) with **normal** appearance — **no-op** until those routes ship, matching profile policy (**no** disabled palette rows).
5. **Profile menu:** §0 — **Logout** performs logout; other destinations **look normal** but are **no-op** until their epic.

---

## 5. i18n

1. Add **English + German** strings for all new UI: tabs, search placeholder, empty/error states, pull-to-refresh affordances, context menu labels (including **Play**), profile menu labels, delete confirm — **no** copy for “not available” / disabled states on **Play**, **+**, profile stubs, or list tap (those are **silent no-ops** in E2).
2. Reuse E1 locale resolution and **`?lang=`** override; no new locale keys scheme.

---

## 6. Tests (optional but recommended)

1. **Vitest** for small **pure** helpers introduced in E2 (e.g. building **`/player` query** from entity + id, normalizing list query keys) — mirror E1’s scope; **no** MSW/Playwright requirement for E2 exit.

---

## 7. Documentation updates (same epic)

1. **[pages-and-flows.md](./pages-and-flows.md):** Normative **list** behavior — **primary tap** targets **player**; **E2** = **no-op** (no navigation, no console); keep **long-press** / pull-to-refresh aligned with this doc.
2. **[app-shell.md](./app-shell.md):** **Collections / Songs / Setlists** tap → **player** (not editor); teams/sessions unchanged where already special-cased.
3. If **[roadmap.md](./roadmap.md)** E2 **Exit** bullets need a parenthetical (**tap** defers to player; **E2** no-op), add **one** clarifying phrase — avoid duplicating full spec (link here).

---

## 8. Exit verification (manual)

1. **`/`** redirects to **`/collections`** when authenticated.
2. All three hubs load **real data**, **load more** works, **pull-to-refresh** resets and scrolls top.
3. **Search** debounces and cancels stale requests; **empty** vs **no results** copy is distinct.
4. **Card/list** toggles persist across reloads (spot-check).
5. **Tap** on an item: **no** route change; **no** `console` output; row/card looks **normal** (not dimmed).
6. **`+`**: **no-op**; control looks **normal**.
7. **Profile:** **Logout** works; **Settings / Teams / Sessions** (and **Install** if present) look **normal** but **do not** navigate when chosen.
8. **Long-press Play:** looks **normal**; choosing it is a **no-op** (no toast, no console).
9. **Delete** (if in API): confirm → item disappears after success; list stays consistent.
10. **Cmd-K** (desktop / iPad + keyboard): **Navigate** to three hubs works; any **Settings / Teams / Sessions** (or **Install**) entries present behave as **no-op** without disabled styling; palette **trap-focus** acceptable.
11. Docs in §7 merged — no contradiction with implementation.

When all steps pass, **E2 is complete** — proceed to [E3](./roadmap.md#e3--progressive-web-app-install--update-ux) (PWA install + minimal service worker).

---

## Related docs

- [Roadmap](./roadmap.md)
- [API integration](./api-integration.md)
- [App shell](./app-shell.md)
- [Pages and flows](./pages-and-flows.md)
- [Epic E1 action plan](./epic-e1-action-plan.md)
- [Design grill session](./grill-session.md)
