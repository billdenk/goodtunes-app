---
name: Partner feedback / bug-report system
description: Where partner-portal bug reports & feature requests live and how submitter identity is trusted
---

Partner-portal bug reports / feature requests have their OWN self-contained
`partner_feedback` table — they do NOT flow into the agent-inbox pipe.

**Why:** Task #2224 spec required a standalone triage surface for operators
(Feedback under Queues) decoupled from the agent feedback system.

**How to apply:**
- One shared `FeedbackLauncher` (client/src/components/operator/) mounted in
  OperatorShell serves EVERY partner portal — there is no per-portal tab or
  registry. Add new portals there, not per-portal.
- Submitter identity (role + scope + name + email) is derived SERVER-SIDE
  from the caller's memberships in the POST route — never trust a
  client-supplied submitter field. The insert schema omits all
  server-derived columns incl. `submitterUserId`; storage's
  createPartnerFeedback adds them.
- Status lifecycle: new→reviewing→in_progress→shipped→closed/wont_do, plus
  an `escalated` boolean. `internal_notes` is operator-only; `public_reply`
  is shown back to the partner in their "My requests" tab.
- Table is created in both DBs via migrate_partner_feedback() in
  scripts/post-merge.sh (idempotent). schema-drift-smoke will flag prod as
  missing until that post-merge runs at merge time — expected, not a defect.
