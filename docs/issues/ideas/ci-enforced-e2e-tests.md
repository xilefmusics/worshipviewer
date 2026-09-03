---
title: "Run end-to-end tests automatically in CI"
summary: "Make the existing Playwright e2e suite an automatic quality gate instead of a local-only check."
area: "QA"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "maintainer"
change_type: "improvement to an existing capability"
personas:
  - "maintainer"
primary_persona: "maintainer"
benefit: "User-flow regressions are caught on every PR instead of only when someone runs Playwright locally."

clarity:
  score: 4
  reason: "The suite, flow catalog, and the documented 'not in CI' gap already exist; remaining work is how to run it reliably in Actions."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 3
  reason: "CI e2e would catch flow breaks that unit tests miss, which is a meaningful maintainer workflow change."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 3
  reason: "Every contributor and every PR would hit the gate, but worship users never see it directly."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 4
  reason: "docs/testing/e2e-coverage.md and AGENTS.md state Playwright is local-only and CI enforcement is an explicit gap."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 4
  reason: "Protecting user flows in CI advances release quality, which is a standing priority."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 3
  reason: "Workflow, backend-on-8788, browsers, flakes, artifacts, and time budgets are around a thousand lines of CI and test-harness work."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 3
  reason: "Flaky or slow e2e in CI can block all PRs; service workers are already blocked so PWA paths stay uncovered."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Run end-to-end tests automatically in CI

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 4 / 5 | The suite, flow catalog, and the documented 'not in CI' gap already exist; remaining work is how to run it reliably in Actions. |
| Impact | 3 / 5 | CI e2e would catch flow breaks that unit tests miss, which is a meaningful maintainer workflow change. |
| Reach | 3 / 5 | Every contributor and every PR would hit the gate, but worship users never see it directly. |
| Evidence | 4 / 5 | docs/testing/e2e-coverage.md and AGENTS.md state Playwright is local-only and CI enforcement is an explicit gap. |
| Strategic fit | 4 / 5 | Protecting user flows in CI advances release quality, which is a standing priority. |
| Effort | 3 / 5 | Workflow, backend-on-8788, browsers, flakes, artifacts, and time budgets are around a thousand lines of CI and test-harness work. |
| Delivery risk | 3 / 5 | Flaky or slow e2e in CI can block all PRs; service workers are already blocked so PWA paths stay uncovered. |

## Problem

Playwright covers flows A1–L5 locally against a real backend on port 8788. That suite is intentionally not in CI, so merge gates do not prove the same user flows.

## Proposed outcome

End-to-end tests run automatically on pull requests (and/or `main`) and fail the gate when a covered flow breaks.

**In scope**

- CI job that installs browsers, starts the e2e backend, and runs Playwright.
- Artifacts (traces, videos) on failure.
- A policy for which projects (chromium / iPhone / iPad) run on every PR.

**Out of scope**

- Filling known coverage gaps (PWA install, PDF export, About flows) unless required to make the job useful.
- Replacing Docker/Venom HTTP integration tests.

## Success criteria

- A PR that breaks a covered Playwright flow fails CI.
- Typical runtime stays within an agreed budget.
- Flakes have an owner path (retry, quarantine, or fix) rather than ignored red builds.

## Planning notes

- **Approach:** Add a GitHub Actions job modeled on local `pnpm -C frontend test:e2e`, with the existing `serve-backend.mjs` helper.
- **Dependencies:** CI minutes, secrets for OTP/OIDC mocks already used in specs, and frontend CI structure.
- **Open questions:** Every PR or nightly plus `main`? Shard tests? Keep iPhone/iPad projects in CI? Required status check from day one?
- **Risks and mitigations:** Flake-driven blockage; start with chromium-only, publish traces, and keep the job non-blocking until stable if needed.
