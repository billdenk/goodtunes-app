---
name: Press template certification + require-certified policy
description: Two template worlds (shelf vs spec slots), how spec revisions actually get certified, and the per-press require_certified_templates gate.
---

Two template worlds in the press portal:
- **Shelf ("live templates")** — press_live_templates rows; test trail is client-measured text appended via POST/PATCH `/templates/live`. No revisions, no certification.
- **Spec slots** — press_template_specs + press_template_revisions (status pending|certified|superseded) + press_template_test_runs. Certification ONLY via POST `/api/press/:id/templates/:specId/test` then `/runs/:runId/certify`.

The certify endpoints had NO client caller until Aug 2026: the live-test page (`PressTemplateLiveTest.tsx`) now calls them from `submitServerTest()` during spec/slot-mode Save (uploads the session's art PDF, certifies on server verdict pass/warn). If that wiring breaks, no press can ever certify.

**Policy:** `manufacturers.require_certified_templates` (default false). When On, `resolveFinishedComponents` (shared/vendorSpecs.ts) stamps `templatePending` on matched specs whose live revision isn't certified (fail-closed: missing spec `id` counts as pending); the completed-template check route 409s with Pending language. The press-portal test route itself is deliberately NOT gated (it IS the certification path). Toggle lives on press Settings → Profile (TemplatesPolicyCard in PressPortal.tsx).

**Why:** review caught that shipping the policy without the certify wiring would make an enabled press reject every client file forever with no UI recovery.

**How to apply:** any new route that measures client files against template specs must thread requireCertified/certifiedSpecIds through resolveRequired; never gate the certification path itself; keep spec-mode Save submitting the server test.

## Restore-by-revision (History panel)
**Rules:** restoring an old revision mints a NEW pending revision and supersedes the previous current — history is never rewritten, and the restored template is ALWAYS Pending (certification stays pinned to the current live revision, so pre-restore passing runs 409 and must re-run). Superseded-view mode in the client is strictly read-only: every mutation affordance AND its handler gate on it.

**Why:** auto-recertifying a restored file would let an old passing test vouch for a file the press never re-verified; a half-gated viewer lets a press mutate state against an old file.

**Concurrency rule:** EVERY route that writes a spec's live file (replace, restore — all flavors, including the archived-slot restore) must run its full sequence (file write → re-measure → mint/flip revision → supersede) under the shared per-spec advisory lock, re-reading state inside the lock; nest it INSIDE the custom-slot lock when both apply. Otherwise interleavings leave the live file mismatched with the sole pending revision.

## Revision-state lock domain (Task-3407-era reviews, Aug 2026)
The per-spec advisory lock is only a guarantee if it covers EVERY writer of a
spec's live file or revision status — portal replace/restore/archive/certify,
the BACKGROUND auto-certify worker, the legacy archived-slot restore, and the
operator god-view catalog PUT in server/routes.ts (which must also reconcile
the revision ledger: mint pending + supersede on file change, archive currents
on file removal, no-op for history-less specs). Validation of a target
revision must happen INSIDE the lock on freshly re-read state, never on a
pre-lock snapshot. Use withTemplateSpecStateLock / reconcileTemplateSpecRevisions
(exported from pressTemplatesPortal.ts) for any out-of-module writer.
**Why:** review rejected four times for writers left outside the lock; each
one can leave the live file pointing away from the sole current revision.

## Read-only viewer states fire no active art operations
Superseded-revision view AND saved-run art re-hydration are purely visual:
no auto ink/PPI inspection on load (loadArtFromFile inspect:false), retry
control hidden and its handler guarded via artInspectionAllowed() in
templateHistory.ts. Only a fresh deliberate art pick in the live view may
inspect.

## Ordered multi-page evidence must be server-derived
**Rule:** certification must independently derive ordered page facts from the pinned stored artwork. Source-paint inspection must recursively follow invoked Form XObjects with local/inherited resources; unresolved, cyclic, or unsupported paint-bearing content fails closed.

**Why:** client verdicts are forgeable, display renderers normalize source color semantics, and ordinary print PDFs commonly place vector/text paint inside Forms. Reading only page-level content can miss prohibited RGB while the visible page appears valid.

**How to apply:** gate every automatic and explicit certification path on the same server-validated ordered evidence: page count/order, geometry, effective PPI, source paint color, soft-mask exclusions, and referenced optional-content layers. Keep artist proofing behavior isolated unless separately approved.
