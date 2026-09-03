---
title: "Promote Rooms in hub navigation"
summary: "Put Rooms in the primary hub tab bar with a distinct live-room icon and move Teams to the profile menu."
area: "Hub"
status: "ready"
owner: null
last_reviewed: "2026-09-01"

source_idea: "independent-room-management"
persona: "worship leader"
need: "reach Rooms directly from the primary hub navigation"
benefit: "shared live sessions are as prominent and discoverable as other core worship workflows"
---

[← Back to issues README](../Readme.md)

# Story: Promote Rooms in hub navigation

## User story

As a **worship leader**, I want **to reach Rooms directly from the primary hub navigation**, so that **shared live sessions are as prominent and discoverable as other core worship workflows**.

## Context

The promoted idea `independent-room-management` treats Rooms as a first-class workflow. Today the fixed primary hub tabs are Collections, Songs, Setlists, and Teams. Rooms are available only through the profile menu (or by creating one inside a source player), and both Teams and Rooms currently use a people/users metaphor.

The approved navigation swap makes Rooms the fourth primary tab and puts Teams in the profile-menu position currently occupied by Rooms. A distinct live-room icon prevents the two destinations from becoming visually interchangeable. Routes and public invites do not change.

## Desired behavior

1. A signed-in user sees Collections, Songs, Setlists, and Rooms in the primary hub tab bar, in that order.
2. Rooms uses a localized label and an icon whose visual metaphor is a live/shared room, not the existing Teams users icon.
3. Activating the tab opens `/rooms`; the tab is active on the Rooms hub route.
4. Opening the profile menu shows Teams where Rooms previously appeared; activating it opens `/teams`.
5. Keyboard navigation, focus, hover/active animation, responsive layout, and command-palette navigation continue to expose both destinations correctly.

## Acceptance criteria

- [ ] Given a signed-in user on any hub list screen, when the primary navigation renders, then its ordered destinations are Collections, Songs, Setlists, and Rooms; Teams is not a primary tab.
- [ ] Given the Rooms tab, when it renders in English or German, then its visible label and accessible name use the existing localized Rooms terminology.
- [ ] Given the Rooms tab is activated by pointer or keyboard, when navigation completes, then `/rooms` renders and the tab exposes the current-page state.
- [ ] Given `/rooms` is active, when the tab bar renders, then the existing active pill/animation and focus-visible conventions apply without layout overflow or truncated ambiguity at supported widths.
- [ ] Given the Rooms and Teams destinations render, when their icons are compared, then Rooms uses a distinct live-room icon and Teams retains an appropriate team/users icon; icon-only semantics do not replace accessible text.
- [ ] Given a signed-in user opens the profile menu, when its destination items render, then Teams occupies the former Rooms destination position and Rooms is not duplicated there.
- [ ] Given the Teams profile-menu item is activated by pointer or keyboard, when navigation completes, then `/teams` opens and existing team list/detail flows remain reachable.
- [ ] Given the command palette is available, when a user searches for Teams or Rooms using localized labels and common keywords, then each command navigates to its correct route without duplicate or stale entries.
- [ ] Given a user is on `/teams/$teamId`, `/rooms`, or another hub route, when navigation chrome evaluates active state and back/plus behavior, then it uses the correct destination-specific behavior and does not treat Teams as Rooms.
- [ ] Given the app is offline, when navigation renders, then both destinations remain navigable according to their existing offline screen behavior; this story does not add hidden network prefetching for Rooms on unrelated pages.
- [ ] Given a public Room invitation URL, when it opens, then it remains outside authenticated hub navigation and is unaffected by the tab/profile swap.

## Scope

**In scope**

- Replace the Teams primary tab with Rooms while preserving the four-tab layout and approved order.
- Move Teams into the profile-menu destination slot currently used by Rooms.
- Add or adapt a distinct animated/static icon for Rooms within the established hub icon system.
- Preserve an appropriate Teams icon in the profile menu.
- Add Rooms to command navigation and keep Teams command navigation correct.
- Active-state, keyboard, focus, hover, responsive, localization, regression-test, architecture-navigation, and user-flow updates.

**Out of scope**

- Changing `/rooms`, `/teams`, team detail, live-room, or invite route URLs.
- Redesigning the overall tab bar, profile menu, command palette, or hub shell.
- Adding badges, participant counts, unread indicators, or live room state to the tab.
- Creating, closing, persisting, joining, or editing rooms.
- Selecting the exact icon artwork in the story; it must satisfy the distinct live-room semantic and existing visual-system constraints.
- Moving Teams anywhere else beyond the approved profile-menu swap.

## Edge cases and failure behavior

- Long German labels must retain the current tab bar's usable layout and accessible full name even if visible text truncates at an extreme width.
- Room discovery remains route-local; making the destination prominent must not mount its query on every hub page.
- Profile-menu item ordering must remain coherent around offline status, settings, administrator-only entries, About, Tutorials, Install, and Logout.
- If icon animation is unavailable or reduced motion is requested, the icon remains recognizable and no navigation meaning depends on motion.
- Deep links to existing Teams and Rooms routes continue to work independently of the new entry points.

## Constraints

- Preserve the existing route paths and authenticated/public route boundaries.
- Keep visible text and accessible names; color, motion, and icon shape alone cannot communicate active state or destination.
- Respect `prefers-reduced-motion` through the existing tab/icon behavior.
- Do not introduce global Room polling or prefetching from the tab bar.
- English and German navigation labels must remain localized.
- The four primary tabs must remain usable at the supported narrow viewport sizes.

## Research

| Finding | Source | Implication |
|---|---|---|
| The primary hub tab bar has four fixed destinations—Collections, Songs, Setlists, Teams—and a Teams-specific active-state helper. | [`frontend/app/src/components/hub/HubTabBar.tsx`](../../../frontend/app/src/components/hub/HubTabBar.tsx) | Replace the fourth destination and update route-active logic without expanding the established four-tab layout. |
| The profile menu currently opens Rooms in its first destination item and uses a users icon. | [`frontend/app/src/components/hub/ProfileMenu.tsx`](../../../frontend/app/src/components/hub/ProfileMenu.tsx) | Teams can take this approved slot, but its label, hover state, icon, and route must all change together. |
| Hub tab icons already share animated icon wrappers; Teams maps to `UsersIcon`. | [`frontend/app/src/components/icons/hub-tab-icons.tsx`](../../../frontend/app/src/components/icons/hub-tab-icons.tsx), [`frontend/app/src/components/icons/profile-menu-icons.tsx`](../../../frontend/app/src/components/icons/profile-menu-icons.tsx) | Rooms needs a different semantic glyph implemented through the same size/hover/reduced-motion conventions. |
| The command palette currently includes Teams but not Rooms. | [`frontend/app/src/commands/hub-commands.ts`](../../../frontend/app/src/commands/hub-commands.ts) | Add Rooms while retaining Teams so the visual swap does not reduce keyboard discoverability. |
| Room discovery is intentionally loaded only on its route; a regression test prevents hub-wide room querying. | [`frontend/app/src/components/room/RoomsList.tsx`](../../../frontend/app/src/components/room/RoomsList.tsx), [`frontend/app/src/components/hub/HubShell.room-regression.test.ts`](../../../frontend/app/src/components/hub/HubShell.room-regression.test.ts), [`docs/architecture/frontend-user-flows.md`](../../architecture/frontend-user-flows.md) | Navigation prominence must not introduce background polling or prefetch on unrelated screens. |
| Public Room invite routes are outside authenticated hub guards. | [`docs/architecture/frontend-navigation-graph.md`](../../architecture/frontend-navigation-graph.md), [`frontend/app/src/routes/rooms.invite.tsx`](../../../frontend/app/src/routes/rooms.invite.tsx) | The navigation change must leave invitation routing and privacy behavior untouched. |

## Delivery notes

- **Likely affected areas:** `HubTabBar`, hub/profile icon modules, `ProfileMenu`, hub navigation commands and command palette tests, translations if keys move, hub shell route logic/FAB behavior, navigation graph/user-flow docs, and frontend tests.
- **Dependencies:** Existing `/rooms` and `/teams` routes, localized labels, hub animation styles, profile menu, and command palette.
- **Risks and mitigations:** Teams may become harder to find—retain it near the top of the profile menu and in command search. Similar icons can undermine the swap—require a distinct live-room metaphor. Adding a tab-level room query can regress performance/privacy—keep the tab declarative and preserve the route-local query regression test.
- **Open questions:** None that change behavior. Exact Rooms icon artwork is a design-system choice.

## Verification

- Add/update component tests for tab order, routes, active/current-page state, pointer and keyboard activation, reduced motion, localized accessible names, and distinct icon components.
- Add/update profile-menu tests for Teams placement, Rooms removal, role-independent visibility, and keyboard navigation.
- Add/update command tests proving both Teams and Rooms are searchable and route correctly.
- Preserve the Room network-isolation regression test and confirm public invitation routes are unaffected.
- Manually verify the four-tab layout and profile menu in English and German at narrow mobile and desktop widths, including focus-visible and reduced-motion modes.
