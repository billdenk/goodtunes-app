# MRP Tier 3 expanded-workbook review (Task #3462)

Status: **reviewed for safe metadata reconciliation; launch is not complete**.

## Archived sources and extraction

Both source files remain archived in `attached_assets/`:

| Role | File | SHA-256 |
| --- | --- | --- |
| Previously loaded | `GoodTunes___GoGoods-Tier3_1787269499765.xlsx` | `a92af0a88ddea885a08aee4aad62dfeacfc7e567271183f93268b566e2c527c6` |
| Current reviewed | `GoodTunes___GoGoods-Tier3-2_1788555344172.xlsx` | `7bcff0e0cb3b92c2f2e33842aa8e6a4b81193127ce1fef3c5b4776fda0b1b6f1` |

The comparison was made from the XLSX ZIP contents (`xl/workbook.xml`,
`xl/sharedStrings.xml`, `xl/worksheets/sheet1.xml`, styles, visibility flags,
and `xl/comments1.xml`), not from screenshots or copied display text. The old
sheet is `GoodTunes`; the current sheet is `GoodTunes-FIXED VALUES`.

## Price and structure diff

- There are **no numeric price changes in the seven common quantity columns**
  (300, 500, 1,000, 2,000, 3,000, 5,000, 10,000), after numeric normalization.
- The old 25,000 column is not present as a price column in the expanded
  export because columns I–M now contain metadata. This is not evidence that
  MRP withdrew or changed the previously reviewed 25,000 rung. The loader is
  therefore intentionally untouched and existing all-in ladders are
  preserved.
- Visible naming changed from “Master” to “DMM” on rows 5, 6, 10, and 11.
- Rows 7 and 8 (lacquer cutting and two-step plating) changed from hidden to
  visible. Other text-only changes are line-ending/export normalization.
- New metadata is: reflected status, `Setup Cost`/`Job Cost`, charge type,
  stable CODA pricing code, and notes. The comment on J2 is authoritative for
  multiplicity: job costs start with finished-good quantity and `per LP`
  multiplies by discs per finished unit; setup costs charge once except
  `per LP`, which multiplies by discs in one finished unit.

## Complete row classification

The current worksheet contains 1,080 numbered XML rows. Classification was
performed before any mapping:

| Classification | Count | Treatment |
| --- | ---: | --- |
| Intentionally unsupported/hidden | 174 | Never loaded or matched |
| Visible coded rows marked already reflected | 25 | Existing price paths retained |
| Visible coded rows newly mappable | 98 | Code/semantics crosswalked; price paths only where the current model already supports them |
| Requires an MRP decision | 2 | Rows 29 and 35; code resolution is blocked |
| Structural headings/blank rows | 781 | Not pricing rows |

There are 125 visible coded row occurrences and 124 unique codes.
`4040F-0001` appears twice (rows 318 and 344) with the same sticker-application
meaning. It has one crosswalk identity.

The machine-readable identity inventory is
`MRP_CODA_CROSSWALK` in `shared/mrpCodaPricing.ts`: every unique visible CODA
code records source row, cost type, charge type, row class, and component
target family. Hidden rows are intentionally absent, so they cannot become
prices through label matching. Unknown codes resolve to `null`.

## Held anomalies

Rows 29 (`4080-0001`, press setup) and 35 (`4011A-0003`, color setup) contain
unexpected secondary-cell/export behavior. In the raw worksheet XML the
secondary cells are styled but have no numeric value; readers that conflate a
style/shared-string index with a value can display an apparent secondary
number. Neither interpretation is accepted as pricing. Both codes are
`requires_mrp_decision`, and the code resolver/calculator returns `null`.

Existing setup-rule values derived from the separately operator-confirmed
Day-2 tracker remain separate. This review does not replace them with any
secondary workbook value.

## Reconciliation boundary

`scripts/reconcile-mrp-coda-crosswalk.ts` writes only the reviewed crosswalk
and verified CODA identity/provenance metadata onto existing pricing/setup
records under the MRP pricing component; it never changes a rate. It stamps
`mrp_coda_crosswalk_2026_09_v2`. It has `--dry` support, validates the complete
merged pricing config, requires one exact MRP identity, and does not write
prices, ladders, or locks. No production run was performed.

When that snapshot is active, the shared builder/email calculator and the
server send gate consume the recorded job/setup and per-LP/per-unit/
per-sticker/per-touch semantics. A selected row without a concrete verified
identity, an unknown code, or either held code fails closed. On send, the
server persists its recomputed cents-stable breakdown and total; email, public
landing, and acceptance continue from that same snapshot rather than a
client-supplied total.
