// Press Components — GoodDeed Certificates pricing (Ruby handoff,
// handoff/press-components/PressGoodDeedPricing.tsx, 2026-08-12). The
// press-facing editable batch ladder: the press (as GoodTunes' certificate
// printer) sets what THEY charge GoodTunes per printed, hologrammed GoodDeed
// certificate at each batch size. This is the press's cost TO GoodTunes —
// it is NOT the wholesale ladder GoodTunes charges artists, and no GoodTunes
// margin or artist pricing appears here (that matrix stays admin-only on
// Platform pricing).
//
// Visuals are the handoff verbatim (page content; the mock's shell chrome is
// the portal's OperatorShell here, and the mock-only theme pill is replaced
// by the app's real theme source, useAdminDark). Persisted in the press's
// gooddeed_printing_json ladder ({ active, tiers: [{ qty, perUnitCents }] })
// via the existing press-manager-gated GET/PUT.

import { useEffect, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { useAdminDark } from "@/lib/adminAppearance";
import type { GoodDeedPrintingConfig } from "./usePressComponents";

type Theme = {
  ink: string;
  subink: string;
  faint: string;
  tick: string;
  hairline: string;
  card: string;
  blue: string;
  chipFill: string;
  searchPlaceholder: string;
};

// Handoff THEMES, page-content subset — light = apple-canon, dark = charcoal.
const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    ink: "#1d1d1f",
    subink: "#6e6e73",
    faint: "#a1a1a6",
    tick: "#d0d0d5",
    hairline: "#e6e6ea",
    card: "#ffffff",
    blue: "#319ED8",
    chipFill: "rgba(0,0,0,0.06)",
    searchPlaceholder: "placeholder:text-slate-400",
  },
  dark: {
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    tick: "#48484c",
    hairline: "rgba(255,255,255,0.10)",
    card: "#1e1e20",
    blue: "#319ED8",
    chipFill: "rgba(255,255,255,0.08)",
    searchPlaceholder: "placeholder:text-white/30",
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Two-tone headings (handoff verbatim) ────────────────────────────
function PageHeading({ lead, rest, t }: { lead: React.ReactNode; rest: string; t: Theme }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint }}>{rest}</span>
    </h2>
  );
}

// ─── Batch rungs — same rungs GoodTunes orders in after a signed window ──
// Rung ids double as the persisted tier qty (the ladder's floor quantity).
type Rung = { id: string; qty: number; batch: string; note: string };
const RUNGS: Rung[] = [
  { id: "25", qty: 25, batch: "25–49", note: "Smallest print run" },
  { id: "50", qty: 50, batch: "50–99", note: "" },
  { id: "100", qty: 100, batch: "100–199", note: "" },
  { id: "200", qty: 200, batch: "200–299", note: "" },
  { id: "300", qty: 300, batch: "300+", note: "Best rate" },
];
const RUNG_QTYS = new Set(RUNGS.map((r) => r.qty));

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

// "" = no price (tier removed); undefined = invalid input.
function inputToCents(v: string): number | null | undefined {
  const s = v.trim().replace(/^\$/, "");
  if (s === "") return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return undefined;
  return Math.round(parseFloat(s) * 100);
}

// ─── Price cell — quiet editable input, $-prefixed, tabular (handoff) ──
function PriceCell({
  priceCents,
  canEdit,
  onCommit,
  t,
  testId,
}: {
  priceCents: number | null;
  canEdit: boolean;
  onCommit: (cents: number | null) => void;
  t: Theme;
  testId: string;
}) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState(() => centsToInput(priceCents));
  const [invalid, setInvalid] = useState(false);
  const dirty = useRef(false);

  // Re-seed from the shared payload only when NOT mid-edit
  // (local-edit vs shared-query re-seed rule).
  useEffect(() => {
    if (!dirty.current && !focused) setValue(centsToInput(priceCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceCents]);

  if (!canEdit) {
    // Staff view-only: quiet read-only figure, no input chrome.
    return (
      <span
        className="text-[14px] font-semibold tabular-nums"
        style={{ color: priceCents == null ? t.faint : t.ink }}
        data-testid={testId}
      >
        {priceCents == null ? "—" : `$${(priceCents / 100).toFixed(2)}`}
      </span>
    );
  }

  const commit = () => {
    dirty.current = false;
    const cents = inputToCents(value);
    if (cents === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (cents !== priceCents) onCommit(cents);
  };

  return (
    <div
      className="flex items-center justify-end gap-0.5 rounded-lg transition-all"
      style={{
        width: 128,
        height: 36,
        paddingRight: 10,
        border: focused ? `2px solid ${invalid ? "#e0245e" : t.blue}` : `1px solid ${invalid ? "#e0245e" : t.hairline}`,
        backgroundColor: t.card,
      }}
    >
      <span className="text-[13px]" style={{ color: value ? t.ink : t.faint }}>$</span>
      <input
        value={value}
        onChange={(e) => {
          dirty.current = true;
          setInvalid(false);
          setValue(e.target.value.replace(/[^0-9.]/g, ""));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="0.00"
        inputMode="decimal"
        aria-invalid={invalid || undefined}
        data-testid={testId}
        className={cn("text-right text-[14px] font-semibold tabular-nums focus:outline-none", t.searchPlaceholder)}
        style={{ width: 68, background: "transparent", border: "none", color: t.ink }}
      />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export function PressGoodDeedPricingComponent({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: GoodDeedPrintingConfig;
  canEdit: boolean;
  save: (config: GoodDeedPrintingConfig) => void;
  saving: boolean;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];

  // Local working copy of the per-rung prices. Two quick blurs (rung A,
  // then rung B) must both survive: deriving each PUT from the shared query
  // payload would send a stale ladder that drops the first price. Edits
  // apply locally and every save serializes off it; the payload re-seeds
  // only when no local edit has happened yet.
  const seed = () => {
    const byQty: Record<string, number | null> = {};
    for (const r of RUNGS) byQty[r.id] = null;
    for (const tier of payload.tiers ?? []) {
      if (RUNG_QTYS.has(tier.qty)) byQty[String(tier.qty)] = tier.perUnitCents;
    }
    return byQty;
  };
  const [prices, setPrices] = useState<Record<string, number | null>>(seed);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setPrices(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const commitRung = (rung: Rung, cents: number | null) => {
    touched.current = true;
    const next = { ...prices, [rung.id]: cents };
    setPrices(next);
    // Preserve the active flag and any non-rung tiers (older configs used
    // extra qtys like 500/1000 via the legacy catalog editor) — this page
    // only owns the five handoff rungs.
    const tiers = [
      ...(payload.tiers ?? []).filter((x) => !RUNG_QTYS.has(x.qty)),
      ...RUNGS.filter((r) => next[r.id] != null).map((r) => ({
        qty: r.qty,
        perUnitCents: next[r.id] as number,
      })),
    ].sort((a, b) => a.qty - b.qty);
    save({ active: payload.active ?? false, tiers });
  };

  const priced = RUNGS.filter((r) => prices[r.id] != null).length;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingBottom: 96 }} data-testid="gooddeed-pricing">
      {/* Quiet opening header */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
          <span>Catalog</span>
          <span style={{ color: t.tick }}>›</span>
          <span style={{ color: t.subink }}>GoodDeed Certificates</span>
        </div>
        <PageHeading
          lead={<>GoodDeed<span style={{ fontSize: "0.45em", verticalAlign: "super", fontWeight: 600 }}>®</span> Certificate.</>}
          rest="Signed Sealed & Delivered."
          t={t}
        />
        <p style={{ fontSize: 16, marginTop: 10, maxWidth: 620, color: t.subink }}>
          When a pre-sale window closes, GoodTunes orders the whole batch from you in one run.
          Set the per-certificate price you charge at each batch size.
        </p>
      </div>

      <div
        style={{
          marginTop: 44,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 56,
          alignItems: "start",
        }}
      >
        {/* LEFT — the editable ladder */}
        <section className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <StepHeading lead="Batch ladder." rest="Price each run size." t={t} />
            <span className="text-[12px] tabular-nums flex-shrink-0 inline-flex items-center gap-1.5" style={{ marginTop: 6, color: t.faint }}>
              {saving ? (
                <span className="inline-flex items-center gap-1.5" data-testid="gooddeed-pricing-saving">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" style={{ color: t.blue }} />
                  {priced} of {RUNGS.length} priced
                </>
              )}
            </span>
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
            Per certificate — printed, hologrammed, and shrink-wrap ready. Larger batches
            usually earn a better rate.
          </p>

          <div className="rounded-2xl overflow-hidden" style={{ marginTop: 18, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>
            <div className="flex items-center" style={{ padding: "10px 20px", borderBottom: `1px solid ${t.hairline}` }}>
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Batch</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-right" style={{ color: t.faint }}>Your price / unit</span>
            </div>
            {RUNGS.map((r, i) => (
              <div
                key={r.id}
                className="flex items-center"
                style={{ padding: "12px 20px", borderBottom: i < RUNGS.length - 1 ? `1px solid ${t.hairline}` : undefined }}
                data-testid={`row-rung-${r.id}`}
              >
                <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
                  <span className="text-[15px] font-semibold tabular-nums" style={{ color: t.ink }}>{r.batch}</span>
                  {r.note && <span className="text-[11.5px]" style={{ color: t.faint }}>{r.note}</span>}
                </div>
                <PriceCell
                  priceCents={prices[r.id] ?? null}
                  canEdit={canEdit}
                  onCommit={(cents) => commitRung(r, cents)}
                  t={t}
                  testId={`input-price-${r.id}`}
                />
              </div>
            ))}
          </div>

          <p className="text-[12px]" style={{ marginTop: 14, maxWidth: 560, color: t.faint, lineHeight: 1.5 }}>
            <span className="font-semibold" style={{ color: t.subink }}>25-certificate minimum.</span>{" "}
            If fewer than 25 sell by window close, no print run happens — you&rsquo;re never
            asked to run a batch below your smallest rung.
          </p>
        </section>

        {/* RIGHT — how batches work (quiet explainer). Wrapped so the card can
            stretch to match the left table's bottom edge, with the fine print
            sitting below the card like the left column's minimum note. */}
        <div className="self-stretch flex flex-col min-w-0" style={{ marginTop: 77 }}>
        <aside className="rounded-2xl flex-1" style={{ padding: "22px 24px", border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>
          <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>How a batch works.</h3>
          <ol style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              ["Window closes", "A signed pre-sale window ends and every buyer is known."],
              ["One print run", "GoodTunes orders the full batch from you — numbered, hologrammed, one run."],
              ["Ship to artist", "The stack ships out for wet signatures, then returns for insertion."],
              ["You get paid", "At the rate you set here, snapped to the actual batch size."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span
                  className="flex items-center justify-center rounded-full text-[11px] font-semibold flex-shrink-0 tabular-nums"
                  style={{ width: 22, height: 22, marginTop: 1, backgroundColor: t.chipFill, color: t.subink }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: t.ink }}>{title}</span>
                  <span className="block text-[12px]" style={{ marginTop: 2, color: t.subink, lineHeight: 1.45 }}>{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
        <p className="text-xs" style={{ marginTop: 14, color: t.faint, lineHeight: 1.5 }}>
          <span className="font-semibold" style={{ color: t.subink }}>These rates are between you and GoodTunes.</span>{" "}
          Artists never see them.
        </p>
        </div>
      </div>
    </div>
  );
}
