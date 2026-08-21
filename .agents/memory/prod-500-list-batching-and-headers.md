---
name: Prod 500 classes — list-route pool exhaustion & non-ASCII headers
description: Two recurring production-500 classes seen Aug 2026 — per-row DB helpers on list routes, and non-ASCII values in HTTP headers.
---

## 1. Per-row helpers on list routes exhaust the pg pool
A list route that maps a per-row helper (e.g. `getOrderItems(order)` under `Promise.all` for up to 500 orders, each firing a legacy fallback query) exhausts the per-instance pool → "timeout exceeded when trying to connect" 500s for everyone.

**Why:** admin Orders list did exactly this; ~2,617 legacy order_items each triggered an album_skus fallback query.
**How to apply:** any route returning N rows must batch-load children (one `IN (...)` query per child table, group in JS). Keep single-row helpers for detail routes only. Watch for the same shape whenever adding a "with items/details" list endpoint.

## 2. Non-ASCII values in HTTP headers throw ERR_INVALID_CHAR
`res.setHeader("Content-Disposition", 'filename="Hope — a note.flac"')` throws on the em-dash → 500.

**How to apply:** any header built from user data (filenames especially) must send an ASCII-folded `filename="..."` plus RFC 5987 `filename*=UTF-8''<percent-encoded>` for the true name. Pattern lives in the masters download route in server/routes.ts.
