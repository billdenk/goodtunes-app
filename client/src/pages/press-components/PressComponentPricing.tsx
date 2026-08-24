// Press Components — component-level Pricing surface (Ruby handoff brief,
// no dedicated mock: "component-level pricing surfaces, rows seeded from
// each press's existing types/colors, price cells empty. Package pricing is
// untouchable."). Visual language follows the press-templates screens
// (apple-canon light + charcoal dark, quiet tables, one blue accent).
//
// Rows arrive seeded from the press's Vinyl component (type rows + their
// color rows); price cells start EMPTY and stay empty until the press types
// a number — we never fabricate a price. These prices are a component-level
// surface only; GoodTunes Package pricing is a separate, untouchable system.

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { useAdminDark } from "@/lib/adminAppearance";
import { displayPressColorName } from "@/lib/pressColorName";
import type { PressComponentsPayload } from "./usePressComponents";
import type { PricingComponentConfig, PricingRow, VinylSizeId, VinylSwatch } from "@shared/pressComponents";
// Segmented size chips (canvas handoff: 7″ Single · 10″ EP · 12″ LP Standard)
// + pure size-filter/group/count helpers (unit-tested in pricingView.test.ts).
import {
  SIZE_CHIPS,
  colorEffectiveCents,
  defaultSizeChip,
  effectiveTypeCentsForSize,
  groupPricingRows,
  ladderCentsForSize,
  priceForSize,
  pricedCountForSize,
  styleRowsForSize,
  visibleRowsForSize,
} from "./pricingView";

type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  card: string;
  cardSoft: string;
  hoverWash: string;
  inputBg: string;
  inputBorder: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    blue: "#319ED8",
    ink: "#1d1d1f",
    subink: "#6e6e73",
    faint: "#a1a1a6",
    hairline: "#e6e6ea",
    canvas: "#f5f5f7",
    card: "#ffffff",
    cardSoft: "#f0f0f2",
    hoverWash: "hover:bg-black/[0.02]",
    inputBg: "#ffffff",
    inputBorder: "#d6d6da",
  },
  dark: {
    blue: "#319ED8",
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    hairline: "rgba(255,255,255,0.10)",
    canvas: "#161617",
    card: "#1e1e20",
    cardSoft: "#26262a",
    hoverWash: "hover:bg-white/[0.03]",
    inputBg: "#26262a",
    inputBorder: "rgba(255,255,255,0.16)",
  },
};

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function inputToCents(v: string): number | null | undefined {
  const s = v.trim().replace(/^\$/, "");
  if (s === "") return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return undefined; // invalid
  return Math.round(parseFloat(s) * 100);
}

// Color pricing row identity: swatch first, name only when it's a human name
// (raw MRP codes stay hidden — Bill's ruling, Aug 23 2026). The swatch circle
// prefers the uploaded splatter photo, else the base hex.
function ColorRowLabel({ row, swatch, t }: { row: PricingRow; swatch: VinylSwatch | null; t: Theme }) {
  const name = displayPressColorName(row.label);
  return (
    <span className="min-w-0 inline-flex items-center gap-2.5">
      {swatch && (
        <span
          aria-hidden
          className="w-[22px] h-[22px] rounded-full flex-shrink-0 bg-cover bg-center"
          style={{
            background: swatch.customImg ? undefined : swatch.base,
            backgroundImage: swatch.customImg ? `url(${swatch.customImg})` : undefined,
            border: `1px solid ${t.hairline}`,
          }}
        />
      )}
      {(name || !swatch) && (
        <span className="text-[13.5px] truncate" style={{ color: t.ink }}>
          {name ?? row.label}
        </span>
      )}
    </span>
  );
}

function PriceCell({
  rowKey,
  priceCents,
  inheritedCents,
  surcharge,
  canEdit,
  t,
  onCommit,
}: {
  rowKey: string;
  priceCents: number | null;
  /** Style-inherited (or imported-ladder) cents shown faint when no operator
   * price is set — an override stays optional (Task #3325). */
  inheritedCents?: number | null;
  /** Render as a "+$x.xx" adder (Splatter surcharge-over-style). */
  surcharge?: boolean;
  canEdit: boolean;
  t: Theme;
  onCommit: (cents: number | null) => void;
}) {
  const [val, setVal] = useState(() => centsToInput(priceCents));
  const [invalid, setInvalid] = useState(false);
  const dirty = useRef(false);

  // Re-seed from the shared payload only when NOT mid-edit.
  useEffect(() => {
    if (!dirty.current) setVal(centsToInput(priceCents));
  }, [priceCents]);

  const fmtCents = (c: number) => `${surcharge ? "+" : ""}$${(c / 100).toFixed(2)}`;

  if (!canEdit) {
    const shown = priceCents ?? inheritedCents ?? null;
    return (
      <span className="text-[13.5px] tabular-nums" style={{ color: priceCents == null ? t.faint : t.ink }}>
        {shown == null ? "—" : fmtCents(shown)}
      </span>
    );
  }

  const commit = () => {
    dirty.current = false;
    const cents = inputToCents(val);
    if (cents === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cents !== priceCents) onCommit(cents);
  };

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="text-[13px]" style={{ color: t.faint }}>
        {surcharge ? "+$" : "$"}
      </span>
      <input
        value={val}
        onChange={(e) => {
          dirty.current = true;
          setVal(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder={inheritedCents != null ? (inheritedCents / 100).toFixed(2) : "—"}
        title={inheritedCents != null && priceCents == null ? "Inherited from the style price — type a number to override" : undefined}
        inputMode="decimal"
        aria-invalid={invalid || undefined}
        data-testid={`price-input-${rowKey}`}
        className="w-[84px] h-8 rounded-lg px-2.5 text-right text-[13.5px] tabular-nums outline-none transition-colors focus:ring-2"
        style={{
          background: t.inputBg,
          color: t.ink,
          border: `1px solid ${invalid ? "#e0245e" : t.inputBorder}`,
          // focus ring color rides the accent
          ["--tw-ring-color" as any]: `${t.blue}55`,
        }}
      />
    </div>
  );
}

export function PressComponentPricing({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: PricingComponentConfig) => void;
  saving: boolean;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];

  // Local working copy of the rows. Two quick blurs (cell A, then cell B)
  // must both survive: deriving each PUT from the shared query payload
  // would send a stale config that drops the first price. So edits apply
  // to local state and every save serializes off it; the payload re-seeds
  // only on press switch or when no local edit has happened yet
  // (local-edit vs shared-query re-seed rule).
  const [rows, setRows] = useState<PricingRow[]>(payload.pricing.rows);
  const touched = useRef(false);
  const seededFor = useRef(payload.press.id);
  useEffect(() => {
    if (seededFor.current !== payload.press.id || !touched.current) {
      seededFor.current = payload.press.id;
      touched.current = false;
      setRows(payload.pricing.rows);
    }
  }, [payload.press.id, payload.pricing.rows]);

  // Selected size chip. Default to the first chip that has any rows (a
  // 12"-only press opens on 12″ instead of an empty 7″ view).
  const [size, setSize] = useState<VinylSizeId>(() => defaultSizeChip(payload.pricing.rows));

  const priceFor = (r: PricingRow): number | null => priceForSize(r, size);

  // Bill's ruling (Aug 23 2026): color rows never show raw internal codes —
  // the swatch identifies the color; the name shows only once renamed.
  // Row keys are "color:<categoryId>:<swatchId>", so the swatch resolves
  // straight out of the press's Vinyl component config.
  const swatchByRowKey = useMemo(() => {
    const map = new Map<string, VinylSwatch>();
    for (const cat of payload.vinyl.categories) {
      for (const sw of cat.swatches) map.set(`color:${cat.id}:${sw.id}`, sw);
    }
    return map;
  }, [payload.vinyl.categories]);

  // Group VISIBLE rows: each type row heads a card; its color rows nest
  // under it — filtered to the selected size (Splatter under 10″/12″ only).
  const groups = useMemo(() => groupPricingRows(rows, size), [rows, size]);

  const commitRow = (key: string, cents: number | null) => {
    touched.current = true;
    const next = rows.map((r) =>
      r.key === key ? { ...r, pricesBySize: { ...(r.pricesBySize ?? {}), [size]: cents } } : r,
    );
    setRows(next);
    save({ rows: next } satisfies PricingComponentConfig);
  };

  // Counter reflects the selected size's view — style-first (Task #3325):
  // colors inherit their style price, so only styles + flat rows count.
  const visibleRows = useMemo(() => visibleRowsForSize(rows, size), [rows, size]);
  const styleRows = useMemo(() => styleRowsForSize(rows, size), [rows, size]);
  const pricedCount = pricedCountForSize(rows, size);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 980, paddingBottom: 96 }} data-testid="component-pricing">
      {/* Quiet opening header — matches the components screens */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
          <span>Catalog</span>
          <span style={{ color: t.hairline }}>›</span>
          <span>Components</span>
          <span style={{ color: t.hairline }}>›</span>
          <span style={{ color: t.subink }}>Pricing</span>
        </div>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight" style={{ color: t.ink }}>
          Pricing. <span style={{ color: t.subink, fontWeight: 600 }}>Per-component upcharges.</span>
        </h1>
        <p style={{ fontSize: 15, marginTop: 10, maxWidth: 620, color: t.subink }}>
          Rows come from the vinyl types and colors {payload.press.name} offers. A blank cell means no price yet —
          artists won't see an upcharge until you set one. GoodTunes Package pricing is separate and unaffected.
        </p>
        <div className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: t.subink }}>
          {saving ? (
            <span className="inline-flex items-center gap-1.5" data-testid="pricing-saving">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" style={{ color: t.blue }} />
              {pricedCount} of {styleRows.length} styles priced
            </span>
          )}
        </div>
      </div>

      {/* Segmented size chips — canvas handoff: 7″ Single · 10″ EP · 12″ LP */}
      <div
        className="mt-7 inline-flex items-center rounded-full"
        style={{ padding: 3, background: t.cardSoft }}
        role="tablist"
        aria-label="Vinyl size"
        data-testid="pricing-size-chips"
      >
        {SIZE_CHIPS.map((c) => {
          const active = c.id === size;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSize(c.id)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-4 py-0 text-[13px] leading-none font-semibold transition-colors"
              style={{
                background: active ? t.card : "transparent",
                color: active ? t.ink : t.subink,
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)" : undefined,
              }}
              data-testid={`size-chip-${c.id.replace('"', "in")}`}
            >
              {c.size}
              <span className="text-[11px] font-medium" style={{ color: active ? t.subink : t.faint }}>
                {c.note}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {groups.out.map((g) => (
          <section
            key={g.type.key}
            className="rounded-2xl overflow-hidden"
            style={{ background: t.card, border: `1px solid ${t.hairline}` }}
            data-testid={`pricing-group-${g.type.key}`}
          >
            {/* Type header row */}
            <div
              className="flex items-center justify-between gap-4 px-5 h-[52px]"
              style={{ borderBottom: g.colors.length ? `1px solid ${t.hairline}` : undefined }}
            >
              <div className="min-w-0 flex items-baseline gap-2.5">
                <span className="text-[15px] font-semibold truncate" style={{ color: t.ink }}>
                  {g.type.label}
                </span>
                {g.type.detail && (
                  <span className="text-[12px]" style={{ color: t.faint }}>
                    {g.type.detail}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
                  {g.type.surchargeOver ? "Surcharge · per unit" : "Style price · per unit"}
                </span>
                <PriceCell
                  rowKey={g.type.key}
                  priceCents={priceFor(g.type)}
                  inheritedCents={g.type.pricesBySize?.[size] == null ? ladderCentsForSize(g.type, size) : null}
                  surcharge={Boolean(g.type.surchargeOver)}
                  canEdit={canEdit}
                  t={t}
                  onCommit={(c) => commitRow(g.type.key, c)}
                />
              </div>
            </div>
            {/* Color rows */}
            {g.colors.map((r, i) => (
              <div
                key={r.key}
                className={`flex items-center justify-between gap-4 px-5 h-11 ${t.hoverWash}`}
                style={{ borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
              >
                <ColorRowLabel row={r} swatch={swatchByRowKey.get(r.key) ?? null} t={t} />
                <PriceCell
                  rowKey={r.key}
                  priceCents={priceFor(r)}
                  inheritedCents={colorEffectiveCents(r, rows, size).inherited ? colorEffectiveCents(r, rows, size).cents : null}
                  canEdit={canEdit}
                  t={t}
                  onCommit={(c) => commitRow(r.key, c)}
                />
              </div>
            ))}
          </section>
        ))}

        {groups.orphans.length > 0 && (
          <section
            className="rounded-2xl overflow-hidden"
            style={{ background: t.card, border: `1px solid ${t.hairline}` }}
          >
            {groups.orphans.map((r, i) => (
              <div
                key={r.key}
                className={`flex items-center justify-between gap-4 px-5 h-11 ${t.hoverWash}`}
                style={{ borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
              >
                <div className="min-w-0 flex items-baseline gap-2.5">
                  <span className="text-[13.5px] truncate" style={{ color: t.ink }}>
                    {r.label}
                  </span>
                  {r.detail && (
                    <span className="text-[12px]" style={{ color: t.faint }}>
                      {r.detail}
                    </span>
                  )}
                </div>
                <PriceCell
                  rowKey={r.key}
                  priceCents={priceFor(r)}
                  inheritedCents={priceFor(r) == null ? ladderCentsForSize(r, size) : null}
                  canEdit={canEdit}
                  t={t}
                  onCommit={(c) => commitRow(r.key, c)}
                />
              </div>
            ))}
          </section>
        )}

        {rows.length > 0 && visibleRows.length === 0 && (
          <div
            className="rounded-2xl px-6 py-12 text-center text-[13.5px]"
            style={{ background: t.card, border: `1px dashed ${t.hairline}`, color: t.subink }}
            data-testid="pricing-empty-size"
          >
            No vinyl types are pressed in this size yet.
          </div>
        )}

        {rows.length === 0 && (
          <div
            className="rounded-2xl px-6 py-12 text-center text-[13.5px]"
            style={{ background: t.card, border: `1px dashed ${t.hairline}`, color: t.subink }}
            data-testid="pricing-empty"
          >
            No component rows yet — set up your Vinyl component first and pricing rows will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
