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
