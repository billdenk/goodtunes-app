# Press Catalog — Design Addendum v1.3
*Scope: the press catalog surface (super-admin press detail → Catalog, press portal → Vinyl catalog, and the future artist Sell-panel read view).*

**Canonical authority:** `docs/design-system.md` and `docs/admin-conventions.md`, enforced by `npm run design:lint`. This addendum adds catalog-specific decisions only; where anything here conflicts with those docs, the docs win. No new colors, tokens, or primitives are introduced here.

**Confirmed facts (from codebase, July 2026):** Admin font is Inter (300–700, every admin type token). The catalog is one shared component — `PressCatalogPanel` in `AdminManufacturer.tsx`, imported by `PressPortal.tsx` — so every fix lands on both surfaces. Swatch photos live on `press_colors.swatch_image_url`; colors belong to a tier, tiers bind to a format. Open: the gt-admin `--primary` value (determines whether filled primaries are dark shadcn-default or brand blue #1f7fb8).

**Changed in v1.3:** §2.2 card width revised (readable content width: stepped ~1100 → ~1400px hard ceiling, never fluid; controls stay capped); §2.3 rung policy rewritten as additive-only after live press data review (Viryl, July 2026) — the 50/200 migration question is closed: no migration, live data untouched; §2.4 read-view rules updated to respect explicit press eye-off; §4 updated to match the shipped Manage colors overlay (modal presentation, manual add, hex support).

---

## 1. Bring the catalog surface into compliance (drift fixes)

The current catalog page predates or drifted from the design system. Bring it in line — these are existing rules, not new ones:

1. **Buttons → shadcn Button under gt-admin.** Replace the dark navy "Save audio spec" and the gray "Save" with the standard shadcn Button (default filled primary / ghost / outline). One filled primary per section, max. h-8/h-9 density, ~6px corners.
2. **Save semantics → auto-save by default.** Audit every Save on the page against the four sanctioned cases (destructive/expensive, multi-field atomic, post-sale-locked, per-row in a long list). Turnaround weeks, audio spec fields, spec URLs: auto-save on blur/change with the standard confirmation, no button. Per-row cases (price ladder rows, color tiers) use the existing `SaveLink` ghost primitive from `SellPanel.tsx` — dirty-activated, never a filled row-level Save.
3. **Token vocabulary → admin slate.** Any hardcoded colors on this surface converge to the slate vocabulary (bg-slate-50 page, bg-white ring-1 ring-slate-200 cards, slate text scale, divide-slate-100). Brand blue only via `var(--brand-blue)`.
4. **Icons → Lucide only**, sized per the system. The eye/eye-off toggle uses Lucide `Eye` / `EyeOff`.

## 2. Layout decisions (catalog-specific)

1. **Inputs size to content, regardless of viewport.** Text/URL fields cap at ~560px; numeric fields size to their value; only Notes textareas go wide. Upload and ··· actions sit immediately beside their field, not floated to the card edge. This rule holds at every breakpoint — a wider card widens whitespace and the ladder, never the controls.
2. **Card width: readable content width, stepped — never fluid.** *(Revised in v1.3.)* The catalog card follows the readable-content-width principle: a bounded content column that steps up modestly at defined breakpoints, then stops, with margins absorbing all remaining viewport. Baseline max ~1100px; at large breakpoints the card steps to a hard ceiling of ~1400px — enough to seat the full standard rung set on one comfortable row — and never widens further, regardless of viewport. Leading-aligned. Dropdowns, text/URL inputs, and numeric fields keep their §2.1 caps at every width; extra viewport becomes whitespace, not stretched content.
3. **Price ladder: additive-only rung policy.** *(Rewritten in v1.3 — closes the 50/200 migration question: no migration.)*
   - The **standard rung set (100, 300, 500, 1000, 2000, 3000)** always renders in edit mode, so cross-press comparison aligns column-for-column.
   - **Live press data is untouchable.** Any rung a press has populated (price entered, Quote-offered, or explicitly eye-off'd) — including legacy 50 and 200 — renders exactly as the press configured it. Standardization never deletes, hides, or reinterprets press-entered rungs. Presses legitimately differ per product (e.g. Viryl offers 50 on some formats and not others); that is commercial data, not drift.
   - Presses may add custom rungs beyond the standard set (+ Add qty).
   - Fixed-width columns, left-aligned as a group; edit mode wraps to a second row instead of clipping.
4. **Read-view rung rendering.** *(Updated in v1.3.)*
   - A rung with a price shows the price.
   - A rung offered without a price shows the **Quote** status pill (bg-blue-50 / text-blue-700 / ring-blue-200) — tappable in the artist view.
   - A **blank, never-touched standard rung defaults to quotable** (Quote pill), not hidden.
   - A rung the press has **explicitly eye-off'd** is respected as not offered: shown as a muted dash in press-facing read views, hidden from the artist Sell panel. The blank-defaults-to-quotable rule applies only to rungs the press never configured.
   - A trailing "Need a different quantity or configuration? Request a quote" link covers everything outside the rendered set. The quote-request flow (quantity + notes → routed to press/operator, with turnaround expectation set) is a separate feature brief; the chip ships tappable.
5. **The album/sleeve preview is fixed** — size and position unchanged regardless of neighboring content.
6. **Package simplicity (product decision, July 2026).** Standard packages only, per the GoodTunes Products one-sheet — no per-component substitutions (e.g. white inner sleeve in place of full-color at reduced price). Custom needs route through Request a quote, not through catalog variants. Do not build variant plumbing speculatively.

## 3. Swatches & images

1. **Chips ~56px** in a wrapping grid across the color area width; selected chip carries the accent ring.
2. **Generate thumbnails at upload** (~150px for chips, ~300px for panel rows). Full-resolution images load only in the artist-facing preview. Never load original uploads into the chip grid.
3. **One eye-toggle component** shared by format pills and price-ladder quantity cells; icon state must always match selection state.

## 3a. Data-model decisions (from the schema review)

1. **Cross-format color identity.** "Applies to 7"/12"" is a row copy; a shared identity (e.g. `color_group_id`) stamped on all format-copies of a color keeps name/hex/photo/crop edits propagating through the group. Name-matching is not an acceptable propagation key. Sibling copies must stay in sync after any save.
2. **Rename safety.** Legacy SKUs and order rows resolve color by display name. Renames must either update dependent name snapshots or resolution must prefer the exact-identity id columns (Task #1025) wherever populated.
3. **Panel scope.** The panel manages one tier's colors; format pills are cross-tier operations under the hood. UI presents them as properties of the color; implementation maps them to linked rows.

## 4. Manage colors panel *(updated in v1.3 to match shipped state)*

Presents as a **modal overlay** — centered dialog with scrim, page behind it untouched, no page reflow. (v1.2 specified an inline panel; the overlay superseded it in the July 2026 corrections and is the shipped, canonical presentation.)

- Drop zone accepts one or many photos (JPEG/PNG/WEBP/HEIC, ≤5 MB each). Each becomes a row with an **empty name field** — filename appears as placeholder text only, never saved as the name.
- **"+ Add color manually"** link under the drop zone creates a row with name + hex only — no photo required.
- **Hex support per swatch:** every row carries a color chip — photo thumbnail when a photo exists, flat hex disc when only hex is set, dashed placeholder when neither. Photo overrides hex for rendering; hex persists when a photo is added. A swatch saves only with at least one of photo or hex (inline error otherwise).
- Per-row: drag handle + row number, chip, name input, format pills (shared eye-toggle), delete (destructive-confirm rules apply).
- Footer: Undo / Redo / Reset flush left, **disabled until a change exists and enabled immediately after any change**; Cancel + single filled primary "Save changes" on the right. Explicit Save is justified under the multi-field atomic form case.
- Entry: the "Manage colors" button beside the tier dropdown, and the + chip in the swatch grid — both open this overlay. The Reorder Colors modal is retired.
- The Edit swatch modal remains as the quick single-edit path from the tier page (name, hex, photo, crop, format pills), styled per the design system.

## 5. Process

- Run `npm run design:lint` after catalog changes; justify + baseline anything that genuinely can't conform.
- New decisions about this surface get added to this addendum (version bump) — or graduated into `docs/design-system.md` if they generalize beyond the catalog. One source of truth per rule; never both.
