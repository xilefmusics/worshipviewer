---
title: "Make installing the app easier"
summary: "Improve the path from a browser visit to a reliably installed Worship Viewer app, especially on platforms where PWA install is awkward."
area: "Install"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "user"
change_type: "improvement to an existing capability"
personas:
  - "operator"
  - "musician"
  - "worship leader"
  - "presenter"
primary_persona: "operator"
benefit: "More people can install Worship Viewer as an app and keep it without hunting through browser menus."

clarity:
  score: 2
  reason: "The outcome is a better install experience; which platforms, prompts, and success metrics are not specified."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "A smoother install path would help first-run and returning use on phones, which is a real onboarding workflow."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 4
  reason: "Anyone using a phone or tablet to run the player or hub can benefit from install."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 2
  reason: "A PWA install provider already exists (including iOS/Safari help); remaining pain is asserted rather than measured."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Installed, reliable access supports live use of the player, a core goal."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Prompt UX, platform help, possible store packaging, and tests (PWA e2e is currently blocked) land near a thousand lines."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "iOS Safari has no standard install prompt; store listings add review and update risk; Playwright currently blocks service workers."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Make installing the app easier

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 2 / 5 | The outcome is a better install experience; which platforms, prompts, and success metrics are not specified. |
| Impact | 3 / 5 | A smoother install path would help first-run and returning use on phones, which is a real onboarding workflow. |
| Reach | 4 / 5 | Anyone using a phone or tablet to run the player or hub can benefit from install. |
| Evidence | 2 / 5 | A PWA install provider already exists (including iOS/Safari help); remaining pain is asserted rather than measured. |
| Strategic fit | 3 / 5 | Installed, reliable access supports live use of the player, a core goal. |
| Effort | 3 / 5 | Prompt UX, platform help, possible store packaging, and tests (PWA e2e is currently blocked) land near a thousand lines. |
| Delivery risk | 3 / 5 | iOS Safari has no standard install prompt; store listings add review and update risk; Playwright currently blocks service workers. |

## Problem

Worship Viewer is a PWA with an in-app install prompt and platform-specific help, but installing still depends on browser UI (especially iOS Share → Add to Home Screen). Playwright blocks service workers, so the install/update path is not e2e-covered. It is not specified what about install currently fails.

## Proposed outcome

Users can understand and complete install on the platforms the product cares about, with fewer dead ends than today.

**In scope**

- Discoverability of install (profile, hub, first-run).
- Clearer iOS / desktop Safari / Chromium instructions or prompts.
- Measuring or defining a successful install.

**Out of scope**

- Native iOS/Android app rewrites, unless that is chosen later as the install vehicle.
- Changing service-worker caching policy except as needed for install reliability.

## Success criteria

- A new user on a target platform can install from in-app guidance without external docs.
- Already-installed sessions do not nag.
- Failure modes (unsupported browser, storage blocked) explain what to do.

## Planning notes

- **Approach:** Audit `PwaInstallProvider` and first-run copy, then close the largest platform gap rather than adding a second install stack.
- **Dependencies:** Vite PWA plugin; e2e currently cannot cover SW (`serviceWorkers: 'block'`).
- **Open questions:** Is the pain iOS, desktop, updates, or offline after install? Are app stores in scope? Should install be required for Rooms?
- **Risks and mitigations:** Aggressive prompts annoy returning users; respect dismissals and standalone display-mode.
