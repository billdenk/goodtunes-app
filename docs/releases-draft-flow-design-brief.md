# Design Brief — Artist "Releases" layer + format-scoped draft flow

**For:** Ruby (design studio)
**Publish location:** `docs/releases-draft-flow-design-brief.md`
**Related build task:** #3088 (deferred until these mocks land)

## Design-system mandate (read first)

Design **within the existing GoodTunes admin design system — do not invent a new visual language**:

- Follow `docs/design-system.md` and `docs/apple-canon.md` plus the design-reference images. The artist portal uses the **light admin slate theme** (with the charcoal dark counterpart via the THEMES-map convention your recent handoffs already carry) — thin rules, restrained color, at most one blue primary pill per screen.
- **You already have the core builder**: the "Build a Quote" flow you mocked for the press portal (size → quantity → weight, live Est. $/unit strip — see the GoodTunes Press "Build a Quote" screen) is exactly the surface the artist lands in after picking a format. This brief is about the *layer above it*, plus a few states inside it. Ignore the outer chrome; the artist portal shell (OperatorShell left rail) already exists.
- Reuse existing list/card/badge/table patterns from the admin Albums page and the press portal Projects list. New elements should read as siblings, not a new family.

## Context

Today an artist's Catalog tab is a flat "Top albums" reporting table. We're introducing a **Release** container above albums so the catalog is organized by release (e.g. CALIFORNIALAND), with each release holding one or more lanes underneath: the digital album, a vinyl draft, a CD draft, etc. A Release has **no stored status** — its badge is always derived from the lanes beneath it. This is the foundation for quoting and sharing estimates later.

## Flow to design (end to end)

1. **Releases list** (replaces "Albums" in the artist's Catalog rail section — rail label becomes "Releases"):
   - One row/card per release: name, cover (from its primary album when one exists), and a **derived rollup badge** — e.g. "Digital live · Vinyl draft", "At press", "Sunset" (when every lane is sunset), "Draft" (nothing live yet), "Empty" (brand-new, no lanes).
   - A quiet "New Release" action.
2. **New Release** — asks for **only a name** (e.g. CALIFORNIALAND). Creates an empty release and lands on its detail page. Keep it one field; no format/date/artwork questions here.
3. **Release detail** — the release's lanes: its digital album (links into the existing embedded album view), plus any physical drafts. Primary action: **Create Draft**.
4. **Create Draft** — asks for a **format first: Vinyl / CD / Cassette** (three cards, like the size cards in Build-a-Quote), then drops the artist straight into the existing package/quote builder for that format, tied to their invited press (e.g. Memphis Record Pressing).
5. **Inside the builder** — the draft **auto-saves from the first interaction** as "<Release name> — <Format>" ("CALIFORNIALAND — Vinyl"; a second vinyl draft becomes "… — Vinyl 2"). Design the quiet "Saved" affordance (no explicit Save gate; a crash never loses the draft) and how the draft's name/breadcrumb reads at the top of the builder (crumb: Releases → CALIFORNIALAND → Vinyl draft).

## States to cover

- **Pricing pending:** when the press hasn't loaded real pricing for a component/run, the builder and the draft summary must show a clear "Pricing pending" placeholder — **never $0.00**. The current Build-a-Quote mock's "Est. $0.00 / unit" strip needs a pending treatment (e.g. "Est. — pending pricing"). Same for per-component cost lines and the run-quantity cards when no confirmed run pricing exists.
- **Rollup badge vocabulary:** derived from existing album lifecycle stages (Prepping / At press / Staged / Released / Sunset) plus the digital lane. Please propose the compact badge grammar for multi-lane releases ("Digital live · Vinyl draft") and the single-word cases (Sunset, Draft, Empty).
- **Legacy releases:** every existing album gets wrapped in a release automatically, so the list must read well for a back catalog (e.g. Nick Carter: many releases, each Sunset; Nightbirde HOPE: digital live, no physical draft; Niina CALIFORNIALAND: draft).
- Empty release (no lanes yet), and a release whose only lane is a draft.

## Out of scope

- Sharing the draft/estimate (link, PDF) — future step.
- Real MRP pricing numbers — pending placeholders only.
- Label / manager / press portal catalog changes — artist portal only.
- Converting a draft to a committed Project / submit-to-press.

## Deliverable

Desktop-width artist-portal mocks (light theme; dark tokens via the usual THEMES map) of: Releases list with badges, New Release, Release detail with lanes + Create Draft format picker, the builder's auto-save/breadcrumb treatment, and the pricing-pending states. For review before build.
