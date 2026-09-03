---
title: "Scale chord-song font size in the player"
summary: "Let musicians scale on-chord song type from 0.5× to 2× (default 1) with pinch in the player and a matching Settings control, without zooming the rest of the app."
area: "Player"
status: "ready"
owner: null
last_reviewed: "2026-08-31"

source_idea: "player-chord-song-font-scale"
persona: "musician"
need: "enlarge or shrink on-chord song type on the device they are reading from"
benefit: "chords stay readable on phones and tablets without breaking hub layout or form focus"
---

[← Back to issues README](../Readme.md)

# Story: Scale chord-song font size in the player

## User story

As a **musician**, I want **to scale on-chord song type in the player from 0.5× to 2× (default 1) with pinch and Settings**, so that **I can read chords at a comfortable size on this device without zooming the hub or forms**.

## Context

The promoted idea `player-chord-song-font-scale` identified that pinch and double-tap page zoom are blocked on purpose, while on-chord player type is sized only by layout. AV already has a content font-size setting; chord songs do not. The smallest valuable slice is one device-local factor that both Settings and a player-only pinch gesture write, applied to every on-chord item in the normal player.

Page layouts currently CSS-scale an A4 sheet to fit the viewport. Multi-column free layouts pick a font size from column width. The factor must **multiply** that layout-driven size. Page layouts must **not** shrink the result back to fit, or a 2× setting can look unchanged. Extra content uses the existing cut/scroll overflow preference rather than a new pan-zoom surface.

## Desired behavior

1. A musician opens Settings → Player and sees a chord-song font scale control whose value is between 0.5 and 2, defaulting to 1 on a fresh device.
2. Changing the control writes the factor immediately; the next on-chord player view uses it.
3. In the normal player, on an on-chord item, pinching two fingers apart increases the factor and pinching together decreases it, clamped to 0.5–2.
4. Type reflows: columns wrap and scroll more when larger; page layouts show actually larger type and overflow according to the current cut/scroll setting.
5. The Settings control shows the same value the pinch just wrote. The factor applies to every on-chord song on this device until changed.
6. One-finger swipe still goes to the previous or next item. Pinching in the hub, dialogs, or text inputs does not zoom the page or change the factor.

## Acceptance criteria

- [ ] Given a device with no stored chord-song font scale, when Settings → Player is opened, then the control shows `1`.
- [ ] Given the Settings control, when the musician sets `0.5` or `2`, then the stored factor is that value and on-chord player type uses it. Values below `0.5` or above `2` are clamped to that range.
- [ ] Given an on-chord item in the normal player, when the musician pinches two fingers apart or together on the chord surface, then the factor changes immediately, type reflows, and Settings shows the same value after the gesture ends.
- [ ] Given the factor is `2` in a free/column layout, when the song is shown, then type is larger than at `1`, lines wrap more, and extra content is reachable through the existing vertical scroll when overflow is scroll.
- [ ] Given the factor is `2` in a page layout, when the song is shown, then type is visually larger than at `1` (the layout-fit CSS scale does not cancel the user factor) and extra content is cut or scrollable according to the current overflow setting.
- [ ] Given the factor was changed by Settings or pinch, when the musician opens a different on-chord song or reloads the app, then the same factor still applies.
- [ ] Given chrome is hidden, when the musician swipes left or right with one finger on the player, then prev/next navigation still occurs and the font scale does not change.
- [ ] Given two fingers pinch on the on-chord surface, when the gesture is recognized, then the player does not treat it as prev/next navigation.
- [ ] Given the musician pinches on the hub, a dialog, or a text input, when the gesture ends, then the page has not been browser-zoomed and the chord-song font scale is unchanged.
- [ ] Given the app language is English or German, when Settings → Player is opened, then the control has a localized label and the range `0.5`–`2` remains numeric.
- [ ] Given an AV player session or a blob/PDF/image item, when the musician changes the chord-song font scale, then AV content font size and blob zoom are unaffected.

## Scope

**In scope**

- One device-local chord-song font scale factor, default `1`, inclusive range `0.5`–`2`.
- A Settings → Player control that reads and writes that factor immediately.
- Two-finger pinch on the on-chord player surface that writes the same factor immediately.
- Applying the factor to every on-chord item in the normal player (page and free/column layouts), multiplying the current layout-driven size.
- Preventing page-layout fit-to-viewport from cancelling the user factor.
- Respecting the existing cut/scroll overflow preference for extra content.
- Keeping one-finger swipe, double-tap, hub, dialogs, and text inputs non-zoomable as they are today.
- English and German Settings labels.
- Automated coverage for clamp, default, persistence, layout multiplication, and gesture non-interference with swipe.

**Out of scope**

- Turning on `user-scalable=yes` for the whole SPA.
- AV content font size, blob/PDF/image zoom, and song-editor preview.
- Syncing the factor to Rooms, projector output, or other devices.
- Per-song or per-session overrides.
- Requiring a trackpad or pointer pinch on desktop (Settings is the non-touch path).
- A new pan-zoom surface for magnified pages.

## Edge cases and failure behavior

- Pinching past `0.5` or `2` leaves the factor at the nearest bound; type does not shrink or grow further.
- If localStorage is unavailable, the factor behaves as `1` for the session and Settings does not claim a persisted value.
- Pinch applies only on the on-chord chord surface, not on the outline/TOC, chrome controls, or key/language popovers.
- Two-page book spreads use the same factor on both pages.
- Hide-chords, chord format, and layout (page vs free, column count, overflow) keep working; the factor only scales type.
- Browser or OS accessibility zoom, if the environment still allows it despite the viewport policy, is outside this story; this factor must not depend on enabling page zoom.

## Constraints

- Do not change the global viewport meta to re-enable app-wide pinch zoom.
- Confine any `touch-action` override to the on-chord player surface so hub lists, dialogs, and inputs keep current double-tap and pan behavior.
- The factor is a local device preference, not account data; no backend, permission, or privacy-model change.
- Settings must remain a complete non-gesture path (keyboard and pointer) so pinch is not the only way to reach 200% type.
- One-finger player gestures (swipe prev/next, tap chrome, double-tap like) must keep working when a second finger is not down.

## Research

| Finding | Source | Implication |
|---|---|---|
| Viewport `user-scalable=no` plus `maximum-scale=1` is the current app-wide zoom lock; `html { touch-action: manipulation }` is documented as suppressing double-tap zoom while relying on the viewport to block pinch. | [`frontend/app/index.html`](../../../frontend/app/index.html), [`frontend/app/src/index.css`](../../../frontend/app/src/index.css) | The story must keep that global policy and implement pinch as a player-local factor, not browser page zoom. |
| MDN defines `touch-action: manipulation` as `pan-x pan-y pinch-zoom` (panning plus pinch, no double-tap zoom). `user-scalable` may be ignored by browser settings; iOS 10+ ignores it by default. | [MDN `touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action) (accessed 2026-08-31), [MDN viewport `user-scalable`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) (accessed 2026-08-31) | Player pinch must be an application scale, with any `touch-action` change limited to the chord surface so hub zoom does not return. |
| On-chord page slides CSS-scale A4 HTML to fit the viewport; free multi-column slides set `fontSizePx` from column width via `fontScaleForMultiColumnPlayer`. Chordlib render is called at `scale: 1`. | [`frontend/app/src/components/player/ChordsSlide.tsx`](../../../frontend/app/src/components/player/ChordsSlide.tsx), [`frontend/app/src/components/player/ChordsThreeColumnSlide.tsx`](../../../frontend/app/src/components/player/ChordsThreeColumnSlide.tsx), [`frontend/app/src/lib/chord-a4-scale.ts`](../../../frontend/app/src/lib/chord-a4-scale.ts) | The user factor must multiply those layout sizes. Page mode must stop fit-to-viewport from cancelling a factor other than `1`. |
| Player layout already has overflow `cut` \| `scroll` (default scroll). | [`frontend/app/src/lib/player/effective-scroll-type.ts`](../../../frontend/app/src/lib/player/effective-scroll-type.ts) | Extra type after scaling reuses that preference instead of adding pan-zoom. |
| Hide-chords and player layout persist immediately in localStorage on this device and are not Room protocol fields. AV has a separate `contentLayer.fontSize` under Player Roles. | [`frontend/app/src/lib/hide-chords-preference.ts`](../../../frontend/app/src/lib/hide-chords-preference.ts), [`frontend/app/src/lib/player-scroll-preference.ts`](../../../frontend/app/src/lib/player-scroll-preference.ts), [`frontend/app/src/lib/player/av-preferences.ts`](../../../frontend/app/src/lib/player/av-preferences.ts), [`frontend/app/src/components/settings/SettingsView.tsx`](../../../frontend/app/src/components/settings/SettingsView.tsx) | Store this factor the same way, on the Player tab, not as AV font size and not as synced room state. |
| The book player maps one-finger touch to swipe prev/next, tap zones, and double-tap like. The outline list uses `touch-action: pan-y`. | [`frontend/app/src/components/player/PlayerBook.tsx`](../../../frontend/app/src/components/player/PlayerBook.tsx), [`frontend/app/src/components/player/player-outline-list.css`](../../../frontend/app/src/components/player/player-outline-list.css) | Two-finger pinch must not dispatch navigation; pinch must not be handled on the outline. |

## Delivery notes

- **Likely affected areas:** on-chord slides and book layout (`ChordsSlide`, `ChordsThreeColumnSlide`, `chord-a4-scale`), player touch handling (`PlayerBook`), a new local preference module, Settings Player tab, `en.json` / `de.json`, and frontend unit tests.
- **Dependencies:** Existing viewport policy, layout-driven chord typography, player overflow preference, and Settings Player tab patterns.
- **Risks and mitigations:** Accidental hub zoom if `touch-action` or viewport policy leaks — keep overrides on the chord surface and assert hub pinch does not change the factor. Fit-to-viewport cancelling 2× in page mode — assert visual/type size at `2` is larger than at `1`. Pinch vs swipe — ignore two-finger moves for navigation. localStorage failure — fall back to `1`.
- **Open questions:** None that change behavior. Widget (slider vs numeric) is an implementation choice as long as `0.5`–`2` is settable.

## Verification

- Unit-test clamp, default `1`, persistence, and multiplication of layout-driven chord typography for free/column and page paths (page path must not cancel the user factor).
- Interaction-test Settings writing the factor and the on-chord player reading it after navigation and reload.
- Gesture tests: two-finger pinch on the chord surface changes the factor; one-finger swipe still navigates; pinch on hub/settings chrome does not change the factor or the page zoom.
- Manually pinch an on-chord song on iPhone at `0.5`, `1`, and `2` in both page and free layouts, confirm overflow cut vs scroll, then confirm hub lists and login inputs still do not page-zoom.
