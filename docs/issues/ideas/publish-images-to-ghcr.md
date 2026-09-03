---
title: "Publish container images to GitHub Container Registry"
summary: "Move the published Worship Viewer image from Docker Hub to GitHub Container Registry so releases stay in the same GitHub account as the source."
area: "Infra"
status: "rough"
owner: null
last_reviewed: "2026-08-28"

primary_impact: "maintainer"
change_type: "improvement to an existing capability"
personas:
  - "maintainer"
  - "operator"
primary_persona: "maintainer"
benefit: "Image publish uses GitHub-native credentials and hosting instead of a separate Docker Hub account."

clarity:
  score: 4
  reason: "The destination (GHCR) and current Docker Hub publish path are known; cutover, dual-publish, and tag mapping still need a short plan."
  scale:
    1: "Mostly unknown"
    2: "Key details unclear"
    3: "Understood; questions remain"
    4: "Well defined"
    5: "Ready for planning"
impact:
  score: 2
  reason: "This is an operator/maintainer distribution change, not a product workflow change."
  scale:
    1: "Minor convenience"
    2: "Non-critical improvement"
    3: "Meaningful workflow improvement"
    4: "Removes major pain or risk"
    5: "Transformational"
reach:
  score: 2
  reason: "Affects maintainers and people who pull `xilefmusics/worshipviewer` from Docker Hub."
  scale:
    1: "Rare edge case"
    2: "Small group"
    3: "Substantial group"
    4: "Most of the persona"
    5: "Nearly everyone, frequently"
evidence:
  score: 3
  reason: "CI already logs into Docker Hub on main and tags; README tells users to `docker run` that Hub image."
  scale:
    1: "Assumption"
    2: "Anecdote"
    3: "Multiple signals"
    4: "Strong evidence"
    5: "Validated with baseline"
strategic_fit:
  score: 3
  reason: "Simpler, GitHub-aligned distribution supports operating and self-hosting the app."
  scale:
    1: "Peripheral"
    2: "Loosely aligned"
    3: "Supports a core goal"
    4: "Advances a priority"
    5: "Essential"
effort:
  score: 2
  reason: "Workflow login/image names, docs, and a deprecation note are around a hundred lines; migration communication is the extra work."
  scale:
    1: "~10 lines"
    2: "~100 lines"
    3: "~1,000 lines"
    4: "~10,000 lines"
    5: ">15,000 lines"
delivery_risk:
  score: 2
  reason: "Cutover can break existing `docker pull` and deploy scripts if Hub is dropped too soon."
  scale:
    1: "Isolated and reversible"
    2: "Limited uncertainty"
    3: "Meaningful uncertainty"
    4: "Major dependencies or risk"
    5: "Fundamental unknowns"
---

[← Back to issues README](../Readme.md)

# Idea: Publish container images to GitHub Container Registry

## Assessment

Scores are from 1 to 5. Higher is favorable except for effort and delivery risk,
where higher means more costly or risky.

| Category | Score | Reason |
|---|:---:|---|
| Clarity | 4 / 5 | The destination (GHCR) and current Docker Hub publish path are known; cutover, dual-publish, and tag mapping still need a short plan. |
| Impact | 2 / 5 | This is an operator/maintainer distribution change, not a product workflow change. |
| Reach | 2 / 5 | Affects maintainers and people who pull `xilefmusics/worshipviewer` from Docker Hub. |
| Evidence | 3 / 5 | CI already logs into Docker Hub on main and tags; README tells users to `docker run` that Hub image. |
| Strategic fit | 3 / 5 | Simpler, GitHub-aligned distribution supports operating and self-hosting the app. |
| Effort | 2 / 5 | Workflow login/image names, docs, and a deprecation note are around a hundred lines; migration communication is the extra work. |
| Delivery risk | 2 / 5 | Cutover can break existing `docker pull` and deploy scripts if Hub is dropped too soon. |

## Problem

Tagged and `main` images are pushed to Docker Hub (`xilefmusics/worshipviewer`) with `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`. That is a second registry and credential set beside the GitHub repo that already holds source and Actions.

## Proposed outcome

Published images live on GHCR. Operators can pull from `ghcr.io` using GitHub packages, and docs/CI no longer depend on Docker Hub as the primary registry.

**In scope**

- CI login and push to GHCR for the same git refs that publish today.
- README, ops, and compose/deploy references updated to the new image name.
- A documented stance on whether Docker Hub stays as a mirror.

**Out of scope**

- Changing the image contents or supported architectures, unless required for GHCR packaging.
- Moving the production Cloud Run source unless that deploy already pins Hub.

## Success criteria

- A push to `main` and a git tag publish a GHCR image with the expected tags.
- Documented `docker run` / pull instructions succeed against GHCR.
- Existing Hub consumers are warned or dual-published for a defined period.

## Planning notes

- **Approach:** Switch `docker/login-action` to `ghcr.io` with `GITHUB_TOKEN`, set `packages: write`, and update `docker/metadata-action` image names.
- **Dependencies:** Package visibility (public vs SSO), and any production pull that still uses Hub.
- **Open questions:** Dual-publish during transition? Keep `latest` semantics the same as Hub? Are arm64 manifests in scope here or later?
- **Risks and mitigations:** Broken deploys on registry change; dual-publish, pin digests in production, and update runbooks in the same change.
