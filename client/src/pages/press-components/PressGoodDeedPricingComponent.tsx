// Press Components — GoodDeed Certificates pricing (Ruby handoff,
// handoff/press-components/PressGoodDeedPricing.tsx, 2026-08-12; restructured
// Task #3073 into per-service ladders). The press-facing editable pricing
// page: the press (as GoodTunes' certificate printer) sets what THEY charge
// GoodTunes per certificate at each batch size, per SERVICE LEG:
//   1. PRINTING only — print the GoodTunes-supplied per-cert PDF (unique
//      name/number/QR) on spec cert stock. Legacy bundled rates map onto
//      this ladder unchanged (no data wipe; copy just stops claiming
//      hologram/shrinkwrap is included).
//   2. FINISHING (optional, toggle) — receive signed certs back and apply
//      GoodTunes-supplied holographic stickers + shrinkwrap, on its own
//      ladder. Plus a ship-to-fulfillment flag so operators can route the
//      final leg.
// This is the press's cost TO GoodTunes — it is NOT the wholesale ladder
// GoodTunes charges artists, and no GoodTunes margin or artist pricing
// appears here (that matrix stays admin-only on Platform pricing).
//
// Visuals follow the handoff (page content; the mock's shell chrome is
// the portal's OperatorShell here, and the mock-only theme pill is replaced
// by the app's real theme source, useAdminDark). Persisted in the press's
// gooddeed_printing_json store ({ active, tiers, finishing, shipToFulfillment })
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
  typicalRange,
  canEdit,
  onCommit,
  t,
  testId,
}: {
  priceCents: number | null;
  typicalRange?: { minCents: number; maxCents: number };
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
    <div className="flex flex-col items-end">
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
      {!value && typicalRange && (
        <span className="text-[10.5px] tabular-nums" style={{ marginTop: 4, color: t.faint }} data-testid={`${testId}-typical`}>
          Typical: ${(typicalRange.minCents / 100).toFixed(2)}–${(typicalRange.maxCents / 100).toFixed(2)}
        </span>
      )}
    </div>
  );
}

// ─── Ladder table — shared by the print + finishing sections ─────────
function LadderTable({
  prices,
  canEdit,
  onCommit,
  t,
  idPrefix,
  priceHeader,
  typicalRanges,
}: {
  prices: Record<string, number | null>;
  canEdit: boolean;
  onCommit: (rung: Rung, cents: number | null) => void;
  t: Theme;
  idPrefix: string;
  priceHeader: string;
  typicalRanges: Array<{ qty: number; minCents: number; maxCents: number }>;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ marginTop: 18, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>
      <div className="flex items-center" style={{ padding: "10px 20px", borderBottom: `1px solid ${t.hairline}` }}>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Batch</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-right" style={{ color: t.faint }}>{priceHeader}</span>
      </div>
      {RUNGS.map((r, i) => (
        <div
          key={r.id}
          className="flex items-center"
          style={{ padding: "12px 20px", borderBottom: i < RUNGS.length - 1 ? `1px solid ${t.hairline}` : undefined }}
          data-testid={`row-${idPrefix}-rung-${r.id}`}
        >
          <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
            <span className="text-[15px] font-semibold tabular-nums" style={{ color: t.ink }}>{r.batch}</span>
            {r.note && <span className="text-[11.5px]" style={{ color: t.faint }}>{r.note}</span>}
          </div>
          <PriceCell
            priceCents={prices[r.id] ?? null}
            typicalRange={typicalRanges.find((range) => range.qty === r.qty)}
            canEdit={canEdit}
            onCommit={(cents) => onCommit(r, cents)}
            t={t}
            testId={`input-${idPrefix}-price-${r.id}`}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Quiet iOS-style toggle (handoff-consistent) ─────────────────────
function Toggle({
  on,
  disabled,
  onChange,
  t,
  testId,
}: {
  on: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  t: Theme;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative inline-flex flex-shrink-0 rounded-full transition-colors"
      style={{
        width: 44,
        height: 26,
        backgroundColor: on ? t.blue : t.chipFill,
        border: `1px solid ${on ? t.blue : t.hairline}`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      data-testid={testId}
    >
      <span
        className="absolute rounded-full bg-white shadow transition-transform"
        style={{ width: 20, height: 20, top: 2, left: 2, transform: on ? "translateX(18px)" : "translateX(0)" }}
      />
    </button>
  );
}

// ─── Certificate stock spec — matches the locked GoodDeed print template
// (server/goodDeedPrintTemplate.ts, Figma spec, Bill May 2026). Shown so a
// print-only price is quoted against the real stock requirements.
const CERT_SPECS: Array<[string, string]> = [
  ["Page size", "US Letter 8.5 × 11 in (A4 on request)"],
  ["Print file", "GoodTunes supplies one print-ready PDF per certificate — unique name, GoodDeed number, and QR code on every page"],
  ["Coverage", "Full-color, single-sided; white mat on all four sides — no bleed past the mat"],
  ["Stock", "Heavyweight certificate stock, smooth uncoated finish (must take a wet ink signature)"],
];

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

  // Local working copy of the per-rung prices + service flags. Two quick
  // blurs (rung A, then rung B) must both survive: deriving each PUT from
  // the shared query payload would send a stale ladder that drops the first
  // price. Edits apply locally and every save serializes off it; the payload
  // re-seeds only when no local edit has happened yet.
  const seedLadder = (tiers: Array<{ qty: number; perUnitCents: number }> | undefined) => {
    const byQty: Record<string, number | null> = {};
    for (const r of RUNGS) byQty[r.id] = null;
    for (const tier of tiers ?? []) {
      if (RUNG_QTYS.has(tier.qty)) byQty[String(tier.qty)] = tier.perUnitCents;
    }
    return byQty;
  };
  const [printPrices, setPrintPrices] = useState<Record<string, number | null>>(() => seedLadder(payload.tiers));
  const [finishPrices, setFinishPrices] = useState<Record<string, number | null>>(() => seedLadder(payload.finishing?.tiers));
  const [finishingOffered, setFinishingOffered] = useState<boolean>(payload.finishing?.offered ?? false);
  const [shipToFulfillment, setShipToFulfillment] = useState<boolean>(payload.shipToFulfillment ?? false);
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) {
      setPrintPrices(seedLadder(payload.tiers));
      setFinishPrices(seedLadder(payload.finishing?.tiers));
      setFinishingOffered(payload.finishing?.offered ?? false);
      setShipToFulfillment(payload.shipToFulfillment ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  // Serialize the WHOLE config off local state so any edit (either ladder,
  // either flag) persists everything consistently. Preserve any non-rung
  // print tiers (older configs used extra qtys like 500/1000 via the legacy
  // catalog editor) — this page only owns the five handoff rungs.
  const serialize = (next: {
    print?: Record<string, number | null>;
    finish?: Record<string, number | null>;
    offered?: boolean;
    ship?: boolean;
  }): GoodDeedPrintingConfig => {
    const p = next.print ?? printPrices;
    const f = next.finish ?? finishPrices;
    const ladderTiers = (byQty: Record<string, number | null>) =>
      RUNGS.filter((r) => byQty[r.id] != null).map((r) => ({ qty: r.qty, perUnitCents: byQty[r.id] as number }));
    return {
      active: payload.active ?? false,
      tiers: [
        ...(payload.tiers ?? []).filter((x) => !RUNG_QTYS.has(x.qty)),
        ...ladderTiers(p),
      ].sort((a, b) => a.qty - b.qty),
      finishing: {
        offered: next.offered ?? finishingOffered,
        tiers: ladderTiers(f),
      },
      shipToFulfillment: next.ship ?? shipToFulfillment,
      // Reference-only GoodTunes config is preserved byte-for-byte. It is
      // never derived from or submitted as a field value.
      typicalRanges: payload.typicalRanges ?? { printing: [], finishing: [] },
    };
  };

  const commitPrintRung = (rung: Rung, cents: number | null) => {
    touched.current = true;
    const next = { ...printPrices, [rung.id]: cents };
    setPrintPrices(next);
    save(serialize({ print: next }));
  };

  const commitFinishRung = (rung: Rung, cents: number | null) => {
    touched.current = true;
    const next = { ...finishPrices, [rung.id]: cents };
    setFinishPrices(next);
    save(serialize({ finish: next }));
  };

  const commitOffered = (on: boolean) => {
    touched.current = true;
    setFinishingOffered(on);
    // Turning the toggle off keeps the saved finishing rates (offered:false
    // just hides the service from routing) — nothing is wiped.
    save(serialize({ offered: on }));
  };

  const commitShip = (on: boolean) => {
    touched.current = true;
    setShipToFulfillment(on);
    save(serialize({ ship: on }));
  };

  const printPriced = RUNGS.filter((r) => printPrices[r.id] != null).length;
  const finishPriced = RUNGS.filter((r) => finishPrices[r.id] != null).length;

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
          Price each service leg you offer — printing, and (if you can) hologram + shrinkwrap
          finishing after the certs come back signed.
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
        {/* LEFT — the editable ladders */}
        <section className="min-w-0">
          {/* ── Section 1: printing only ── */}
          <div className="flex items-start justify-between gap-3">
            <StepHeading lead="Printing." rest="Price each run size." t={t} />
            <span className="text-[12px] tabular-nums flex-shrink-0 inline-flex items-center gap-1.5" style={{ marginTop: 6, color: t.faint }}>
              {saving ? (
                <span className="inline-flex items-center gap-1.5" data-testid="gooddeed-pricing-saving">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" style={{ color: t.blue }} />
                  {printPriced} of {RUNGS.length} priced
                </>
              )}
            </span>
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
            Per certificate — <span className="font-semibold" style={{ color: t.ink }}>printing only</span>.
            Holograms and shrinkwrap are a separate service below. Larger batches usually earn a better rate.
          </p>

          <LadderTable
            prices={printPrices}
            canEdit={canEdit}
            onCommit={commitPrintRung}
            t={t}
            idPrefix="print"
            priceHeader="Your price / unit"
            typicalRanges={payload.typicalRanges?.printing ?? []}
          />

          <p className="text-[12px]" style={{ marginTop: 14, maxWidth: 560, color: t.faint, lineHeight: 1.5 }}>
            <span className="font-semibold" style={{ color: t.subink }}>25-certificate minimum.</span>{" "}
            If fewer than 25 sell by window close, no print run happens — you&rsquo;re never
            asked to run a batch below your smallest rung.
          </p>

          {/* ── Section 2: finishing (holograms + shrinkwrap) ── */}
          <div className="flex items-start justify-between gap-4" style={{ marginTop: 52 }}>
            <div className="min-w-0">
              <StepHeading lead="Finishing." rest="Holograms + shrinkwrap." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, maxWidth: 520, color: t.subink, lineHeight: 1.5 }}>
                We can receive signed certs back and apply holograms + shrinkwrap.
                GoodTunes supplies the holographic stickers — you price the application
                and shrinkwrap per certificate.
              </p>
            </div>
            <div style={{ marginTop: 6 }}>
              <Toggle
                on={finishingOffered}
                disabled={!canEdit}
                onChange={commitOffered}
                t={t}
                testId="toggle-finishing-offered"
              />
            </div>
          </div>

          {finishingOffered && (
            <div data-testid="finishing-section">
              <div className="flex items-center justify-end" style={{ marginTop: 4 }}>
                <span className="text-[12px] tabular-nums inline-flex items-center gap-1.5" style={{ color: t.faint }}>
                  <Check className="w-3.5 h-3.5" style={{ color: t.blue }} />
                  {finishPriced} of {RUNGS.length} priced
                </span>
              </div>
              <LadderTable
                prices={finishPrices}
                canEdit={canEdit}
                onCommit={commitFinishRung}
                t={t}
                idPrefix="finishing"
                priceHeader="Your price / unit"
                typicalRanges={payload.typicalRanges?.finishing ?? []}
              />

              {/* Ship-to-fulfillment routing flag */}
              <div
                className="flex items-center justify-between gap-4 rounded-2xl"
                style={{ marginTop: 14, padding: "16px 20px", border: `1px solid ${t.hairline}`, backgroundColor: t.card }}
              >
                <div className="min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: t.ink }}>
                    We can ship finished certs to fulfillment.
                  </span>
                  <span className="block text-[12px]" style={{ marginTop: 2, color: t.subink, lineHeight: 1.45 }}>
                    After holograms + shrinkwrap, you hand the batch off to GoodTunes fulfillment
                    for insertion and shipping.
                  </span>
                </div>
                <Toggle
                  on={shipToFulfillment}
                  disabled={!canEdit}
                  onChange={commitShip}
                  t={t}
                  testId="toggle-ship-to-fulfillment"
                />
              </div>
            </div>
          )}
          {!finishingOffered && (
            <p className="text-[12px]" style={{ marginTop: 12, maxWidth: 560, color: t.faint, lineHeight: 1.5 }} data-testid="finishing-off-note">
              Print-only is fine — signed certs route to another finisher for holograms,
              shrinkwrap, and fulfillment.
            </p>
          )}
        </section>

        {/* RIGHT — cert stock spec + how batches work (quiet explainers). */}
        <div className="self-stretch flex flex-col min-w-0" style={{ marginTop: 77 }}>
          {/* Certificate stock requirements — the spec the print price is quoted against. */}
          <aside className="rounded-2xl" style={{ padding: "22px 24px", border: `1px solid ${t.hairline}`, backgroundColor: t.card }} data-testid="cert-spec-card">
            <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>Certificate stock spec.</h3>
            <dl style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {CERT_SPECS.map(([label, body]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>{label}</dt>
                  <dd className="text-[12px]" style={{ marginTop: 2, color: t.subink, lineHeight: 1.45 }}>{body}</dd>
                </div>
              ))}
            </dl>
          </aside>

          <aside className="rounded-2xl flex-1" style={{ marginTop: 16, padding: "22px 24px", border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>
            <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>How a batch works.</h3>
            <ol style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                ["Window closes", "A signed pre-sale window ends and every buyer is known."],
                ["One print run", "GoodTunes orders the full batch from you — each cert numbered, one run."],
                ["Ship to artist", "The stack ships out for wet signatures (or local pickup)."],
                ["Finishing", "Signed certs get holograms + shrinkwrap — by you if you offer it, otherwise elsewhere."],
                ["You get paid", "At the rates you set here, snapped to the actual batch size, per service you performed."],
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
