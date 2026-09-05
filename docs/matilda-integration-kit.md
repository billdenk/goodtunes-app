# GoodTunes Pricing Push API — Integration Kit for Matilda

> This staged inbound POST integration remains the supported contract. MRP's
> proposed future read-only GET pricing API is not implemented or inferred
> from this document. It requires a separately supplied endpoint,
> authentication, request/response schema, error/rate-limit behavior,
> versioning, and network policy. Replit Autoscale should not be assumed to
> provide a fixed outbound IP.

This document is for the developer integrating MRP's ERP (built by
Matilda Tech) with GoodTunes. Your side is small: format a JSON payload
of vinyl pricing rows and POST it to us with an API key. We handle
everything after that — pushed pricing is staged for a GoodTunes
operator to review and apply, so a push never changes live pricing by
itself.

- **Base URL (production):** `https://my.goodtunes.music`
- **API version:** v1 (path-versioned: `/api/erp/v1/...`)
- **Scope of v1:** vinyl record pricing ladders (tier / quantity /
  price). The `/api/erp/v1/` family will grow (orders, inventory,
  production status) — the payloads below are pricing-only.

## Authentication

Every request needs the API key GoodTunes issued for MRP, sent in the
`X-API-Key` header:

```
X-API-Key: gtpush_xxxxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- The key is issued once and shown once — store it as a secret on your
  side. If it's lost or leaked, ask GoodTunes to issue a replacement
  (the old key stops working immediately).
- A missing, malformed, or revoked key returns `401` with
  `{"error": "invalid_api_key"}`.
- Requests are rate-limited (roughly 60/min per key). Excess requests
  return `429` — wait a minute and retry.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/erp/v1/pricing/validate` | Dry run. Parses your payload and returns exactly what we understood plus per-row errors. **Never changes anything.** |
| POST | `/api/erp/v1/pricing/pushes` | Real push. Stores the pricing for operator review. Rejected entirely if any row has an error — validate first. |

Both take `Content-Type: application/json`. Maximum payload size is
1 MB; maximum 2,000 rows per push.

## Payload schema (version 1)

```json
{
  "version": 1,
  "default_format": "12_lp",
  "rows": [
    { "tier": "Black", "quantity": 300, "unit_price": 2.35 },
    { "tier": "Black", "quantity": 500, "unit_price": 2.10 },
    { "tier": "Opaque", "quantity": 500, "total_price": 1275.00, "format": "12_lp" },
    { "tier": "Opaque", "quantity": 1000, "unit_price": 1.95, "format": "2LP" }
  ]
}
```

### Top-level fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | number | yes | Must be `1`. |
| `default_format` | string | no | Format applied to rows that omit `format`. |
| `rows` | array | yes | 1–2,000 pricing rows. |

### Row fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tier` | string | yes | The pricing tier / color book name exactly as it appears in MRP's price list (e.g. `"Black"`, `"Opaque"`, `"Splatter"`). Matched case-insensitively against the GoodTunes catalog. |
| `quantity` | integer | yes | The run quantity the price applies to (e.g. `300`, `500`, `1000`). Positive whole number. |
| `unit_price` | number or string | one of these two | Per-unit price in **USD**. `2.35` and `"2.35"` and `"$2.35"` are all accepted. |
| `total_price` | number or string | one of these two | Run-total price in USD; we divide by `quantity`. Send `unit_price` **or** `total_price`, never both. |
| `format` | string | if no `default_format` | Which record format the row prices. Accepted values below. |

### Accepted `format` values

Canonical ids: `12_lp`, `12_double`, `7_inch`, `cassette`, `cd`.
Common aliases also work: `12"`, `LP`, `2LP`, `Double LP`, `7"`,
`Cassette`, `CD`.

### Rules

- Each (format, tier, quantity) combination may appear **once** per
  push. Duplicates are an error.
- Prices must be positive. A `total_price` whose per-unit value rounds
  to less than one cent is an error.
- Unknown row fields are ignored (you'll get a warning back naming
  them), so adding your own bookkeeping fields won't break the push.

## Recommended flow

1. POST the payload to `/pricing/validate`.
2. If `ok` is `false`, fix the listed errors and repeat.
3. POST the same payload to `/pricing/pushes`.
4. Done — a GoodTunes operator reviews the push and applies it.

You can push the complete current price list every time; there's no
need to send deltas. Rows that match current pricing are simply shown
as unchanged to the reviewer.

## curl examples

Validate (dry run):

```bash
curl -sS -X POST "https://my.goodtunes.music/api/erp/v1/pricing/validate" \
  -H "X-API-Key: $GOODTUNES_PUSH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 1,
    "default_format": "12_lp",
    "rows": [
      { "tier": "Black", "quantity": 300, "unit_price": 2.35 },
      { "tier": "Black", "quantity": 500, "unit_price": 2.10 }
    ]
  }'
```

Successful validate response (`200`):

```json
{
  "ok": true,
  "mode": "validate",
  "run_id": "…",
  "version": 1,
  "rows_received": 2,
  "rows_accepted": 2,
  "accepted": [
    { "index": 0, "format": "12_lp", "tier": "Black", "quantity": 300, "unit_price_cents": 235 },
    { "index": 1, "format": "12_lp", "tier": "Black", "quantity": 500, "unit_price_cents": 210 }
  ],
  "errors": [],
  "warnings": []
}
```

`accepted` is exactly what we parsed — check `unit_price_cents` to
confirm the prices survived intact (they're integer US cents).

Submit (real push):

```bash
curl -sS -X POST "https://my.goodtunes.music/api/erp/v1/pricing/pushes" \
  -H "X-API-Key: $GOODTUNES_PUSH_KEY" \
  -H "Content-Type: application/json" \
  -d @pricing.json
```

Successful submit response (`202 Accepted`):

```json
{
  "ok": true,
  "mode": "submit",
  "push_id": "…",
  "status": "pending_review",
  "rows_received": 2,
  "rows_accepted": 2,
  "warnings": [],
  "message": "Pricing received. A GoodTunes operator will review and apply it — nothing goes live automatically."
}
```

## Error handling

Validation errors come back as a structured list. Each entry has:

| Field | Meaning |
| --- | --- |
| `index` | Zero-based row index, or `null` for a payload-level problem. |
| `field` | The field at fault (`"tier"`, `"quantity"`, …) or `null`. |
| `code` | Stable machine-readable code (catalog below). |
| `message` | Human-readable explanation. |

A validate with errors returns `422` with `ok: false` and the full
error list. A submit with **any** error returns `422` and stores
nothing for review — fix and resend the whole payload.

### Error code catalog

| Code | Meaning |
| --- | --- |
| `payload_not_object` | Body isn't a JSON object. |
| `version_missing` | No `version` field. |
| `unsupported_version` | `version` isn't `1`. |
| `rows_missing` | `rows` absent or not an array. |
| `rows_empty` | `rows` is an empty array (or no valid rows). |
| `too_many_rows` | More than 2,000 rows. |
| `row_not_object` | A row isn't a JSON object. |
| `tier_missing` | Row has no non-empty `tier` string. |
| `tier_invalid` | `tier` is longer than 120 characters. |
| `quantity_invalid` | `quantity` isn't a positive integer. |
| `price_missing` | Neither `unit_price` nor `total_price` present. |
| `price_conflict` | Both `unit_price` and `total_price` present. |
| `price_invalid` | The price isn't a positive USD amount. |
| `unit_price_zero` | Per-unit price rounds to zero cents. |
| `format_unrecognized` | `format` / `default_format` value not recognized. |
| `format_missing` | Row has no `format` and no `default_format` was set. |
| `duplicate_row` | Same format+tier+quantity appears twice. |

### HTTP status summary

| Status | Meaning |
| --- | --- |
| `200` | Validate succeeded (payload is clean). |
| `202` | Push accepted and queued for operator review. |
| `401` | Bad or revoked API key. |
| `413` | Payload larger than 1 MB. |
| `422` | Validation errors (see `errors` list). |
| `429` | Rate limited — retry after a minute. |
| `5xx` | Our problem — retry with backoff, and tell us if it persists. |

## Questions

Anything unclear, or a field you need that isn't in the schema —
contact your GoodTunes representative and we'll extend the spec
(that's what the `version` field is for).
