---
title: "Open tutorials from the profile menu"
summary: "Let signed-in users reach Worship Viewer tutorials directly from the profile menu."
area: "Hub"
status: "ready"
owner: null
last_reviewed: "2026-08-31"

source_idea: "profile-menu-tutorial-link"
persona: "operator"
need: "open the Worship Viewer tutorials from inside the app"
benefit: "help is discoverable without knowing where the tutorials are hosted"
---

[← Back to issues README](../Readme.md)

# Story: Open tutorials from the profile menu

## User story

As an **operator**, I want **to open the Worship Viewer tutorials from the profile menu**, so that **I can find help without already knowing where the tutorials are hosted**.

## Context

The promoted idea `profile-menu-tutorial-link` identified a discovery gap: tutorials exist outside the app, but signed-in users have no profile-menu path to them. The profile menu is already a shared entry point for signed-in users and contains account, product-information, and install actions. Adding one external Tutorials entry is the smallest valuable slice because it improves access to existing help without bundling tutorial creation, hosting, or an in-app help experience.

The operator is the primary persona, but the entry is available to every signed-in user because the same menu serves worship leaders, musicians, and presenters. The expected benefit is an assumption; no tutorial-discovery baseline or support evidence is currently available.

## Desired behavior

1. A signed-in user opens the profile menu.
2. The menu displays a localized Tutorials entry immediately after About and before Install app when the conditional install entry is present.
3. The user activates Tutorials with a pointer or keyboard.
4. The browser opens `https://www.worshipviewer.com/tutorials` in a new tab while the app remains open in its current state.

## Acceptance criteria

- [ ] Given a signed-in user in any role, when they open the profile menu, then an enabled Tutorials entry appears immediately after About and, when Install app is present, immediately before Install app.
- [ ] Given the app language is English, when the profile menu is opened, then the entry is labeled “Tutorials”.
- [ ] Given the app language is German, when the profile menu is opened, then the entry is labeled “Tutorials”.
- [ ] Given the Tutorials entry has keyboard focus, when the user activates it using the menu's supported keyboard interaction, then the browser opens `https://www.worshipviewer.com/tutorials` in a new tab.
- [ ] Given the user activates Tutorials with a pointer, when navigation occurs, then the browser opens exactly `https://www.worshipviewer.com/tutorials` in a new tab and the current app tab remains on the same screen.
- [ ] Given the tutorials page opens in a new tab, when that page runs, then it cannot access the app tab through `window.opener`, and referrer information is not sent.
- [ ] Given the app reports that it is offline, when the user opens the profile menu, then Tutorials remains enabled and activation is still handed to the browser.
- [ ] Given the signed-in user is editing a song, when they open Tutorials, then the external navigation does not trigger the app's leave-editor flow or discard the current app state.

## Scope

**In scope**

- One Tutorials entry in the signed-in profile menu.
- English and German labels.
- Pointer and keyboard activation.
- Secure new-tab navigation to `https://www.worshipviewer.com/tutorials`.
- Keeping the entry enabled in the app's offline state.
- Automated interaction coverage for placement, localization, external navigation, and offline availability.

**Out of scope**

- Creating, editing, translating, validating, or hosting tutorial content.
- Embedding tutorials or building an in-app help center.
- Detecting whether the tutorials page is reachable before activation.
- Tracking tutorial-link impressions or visits.
- Adding tutorial links outside the profile menu.

## Edge cases and failure behavior

- If the tutorials page or network is unavailable, the browser owns the resulting failure experience; the app does not preflight the URL or show a custom error.
- The Tutorials entry remains present for administrators and non-administrators regardless of whether role-specific menu entries are rendered around it.
- The conditional Install app entry does not change Tutorials placement relative to About.
- Browser policies and user preferences may affect how a new tab is displayed, but activation must use standard external-link behavior and must not replace the app tab.

## Constraints

- The entry must use the existing profile-menu interaction and focus conventions so it remains keyboard accessible.
- New-tab navigation must prevent opener access and suppress referrer information.
- The app must not claim the remote tutorials are available merely because the menu item remains enabled offline.
- No backend, data ownership, permission, or privacy-model changes are required.

## Research

| Finding | Source | Implication |
|---|---|---|
| The shared signed-in profile menu already orders About before the conditional Install app action and receives an `offline` state from the hub shell. | [`frontend/app/src/components/hub/ProfileMenu.tsx`](../../../frontend/app/src/components/hub/ProfileMenu.tsx), [`frontend/app/src/components/hub/HubShell.tsx`](../../../frontend/app/src/components/hub/HubShell.tsx) | Tutorials can be one role-independent menu item after About; offline availability must be covered explicitly because the menu visibly represents that state. |
| Existing in-app links to `worshipviewer.com` support secure new-tab navigation with `target="_blank"` and `rel="noopener noreferrer"`. | [`frontend/app/src/components/legal/LegalExternalLinks.tsx`](../../../frontend/app/src/components/legal/LegalExternalLinks.tsx), [`frontend/app/src/lib/legal-external-links.ts`](../../../frontend/app/src/lib/legal-external-links.ts) | The story adopts the established external-navigation behavior and makes its security properties testable. |
| The profile menu uses the shared Radix-based dropdown item wrapper and already stores English and German profile labels under `hub.profile`. | [`frontend/app/src/components/ui/dropdown-menu.tsx`](../../../frontend/app/src/components/ui/dropdown-menu.tsx), [`frontend/app/src/i18n/en.json`](../../../frontend/app/src/i18n/en.json), [`frontend/app/src/i18n/de.json`](../../../frontend/app/src/i18n/de.json) | The link should follow existing menu focus behavior and add translations alongside the neighboring labels. |
| **Inference:** no component-level profile-menu interaction test was found during repository search. | [`frontend/app/src/components/hub/ProfileMenu.tsx`](../../../frontend/app/src/components/hub/ProfileMenu.tsx) | Delivery should add focused interaction coverage rather than relying only on manual verification. |

## Delivery notes

- **Likely affected areas:** `frontend/app/src/components/hub/ProfileMenu.tsx`, profile-menu icons if a dedicated help icon is needed, `frontend/app/src/i18n/en.json`, `frontend/app/src/i18n/de.json`, and frontend component tests.
- **Dependencies:** The public `https://www.worshipviewer.com/tutorials` route remains the agreed destination; browser support for standard external links.
- **Risks and mitigations:** A moved or unavailable tutorials route would leave a dead link; keep the destination centralized or directly asserted in a focused test. An icon choice could unnecessarily expand scope; reuse the established icon system without making a new illustration a delivery requirement.
- **Open questions:** None.

## Verification

- Add a frontend component/integration test that opens the menu for representative user roles and asserts item presence, ordering, enabled state while offline, English and German labels, and secure new-tab link attributes.
- Exercise the menu using keyboard input in an interaction test and assert activation targets the exact tutorials URL without invoking internal navigation or the leave-editor flow.
- Manually verify pointer and keyboard behavior in a supported desktop browser, including while the app displays its offline state.
