---
name: Pending-change withdraw (artist self-retract)
description: How/why an artist retracts a still-pending change request, and why retract = terminal status not delete
---
Artists can retract a change request they filed by mistake. Retraction is a **terminal status on the row, never a hard delete** — the audit trail must survive.

**Rule:** the retract update matches on `submittedByUserId = caller` AND `status = "pending"` AND the album the request belongs to, in one UPDATE…WHERE…RETURNING; a null return covers wrong-owner / not-found / already-reviewed / wrong-album alike so the route can 404 without leaking which. Approved/rejected rows are terminal and can't be retracted.

**Why terminal-status not delete:** operators need the history, and a retracted request must disappear from BOTH the artist's own list and the operator review queue. The list read filters the retracted status out; the operator queue already keys off `pending`. Any new consumer of the change-request list must apply the same status filter, and any new terminal status must be checked against the operator queue's `pending`-only gate (it renders unknown statuses as plain text).

**Why bind to album:** the withdraw endpoint lives under an album URL and the caller may have edit access to many albums — matching the request's album in the UPDATE stops one album's endpoint from retracting a request that belongs to another.
