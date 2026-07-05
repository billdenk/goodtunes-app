---
name: iOS build-to-TestFlight submission gates
description: Two Apple-side gates that fail a Codemagic iOS build at the VERY END (version train + Beta App Description), why the pre-build guards do/don't catch them, and how to triage.
---

# iOS build → TestFlight: the two Apple-side submission gates

The Codemagic `ios-testflight` workflow builds + signs + uploads, then submits to
TestFlight (upload → add to beta group → external beta review). Two Apple-side
gaps deterministically fail the run AFTER the ~13-min Mac build + upload, not
before — the binary uploads VALID and is registered, then "Publish to App Store
Connect" errors out. Neither is a code/signing defect.

## 1. Marketing-version train closes once a version is APPROVED (not just released)
A `MARKETING_VERSION` Apple has already **approved** — even if it is NOT yet
released / NOT `READY_FOR_SALE` — is a closed train: uploading another build under
it fails with **90186 / 90062** ("attribute value already used" / redundant
binary).
- **Fix:** bump `MARKETING_VERSION` in `codemagic.yaml` AND the in-app version
  label in `client/src/pages/Account.tsx` in lockstep, then re-run.
- **Why the guard misses it:** `scripts/verify-ios-marketing-version.py` only
  compares against the **READY_FOR_SALE** live version, so an approved-but-
  unreleased version slips past it (known limitation, left as-is).

## 2. External TestFlight testing requires a one-time Beta App Description
Submitting a build to an **external** beta group triggers
`POST /v1/betaAppReviewSubmissions`, which **422s "Beta App Description is
missing"** until the operator fills the Beta App Description in App Store Connect
→ **TestFlight → Test Information** (the per-locale `betaAppLocalizations.description`
field).
- **Internal** testing does NOT need it — the build reaches internal testers
  (state `IN_BETA_TESTING`) even while external submission keeps failing. So a
  build can be installable internally and still show the pipeline as "failed".
- It is a **one-time console field** (persists across future builds); the agent
  cannot set it (no App Store Connect console write from the Replit env).
- **Guard:** `scripts/verify-ios-testflight-info.py` now checks `description`
  (per-locale) alongside the review contact fields + `feedbackEmail`, fail-open on
  an unexpected API shape — so a blank description fails in seconds up front
  instead of after the full build. (Before this it checked contact + feedback
  only, which is why build 71 ran fully then 422'd.)

## How to triage "iOS build failed at Publish"
Read the tail of the publish log:
- **90186 / 90062** → version-train collision → bump `MARKETING_VERSION` (+ Account.tsx).
- **422 Beta App Description is missing** → operator fills Test Information (external only).
- Transient **500** → the publish step already retries (tolerant of transient 500s).
The binary uploading VALID / "build N IS registered" means the build itself is
fine; do not re-upload (duplicate-binary rejection) — only the submission needs
re-running.
