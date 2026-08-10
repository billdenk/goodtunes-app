// ─────────────────────────────────────────────────────────────────────
// CD + Cassette catalog build pages — handoff/cd-cassette-catalog v1
// (Aug 10, 2026). The presentational code below is copied CHARACTER-FOR-
// CHARACTER from CDCatalogBuildDesktop.tsx / CassetteCatalogBuildDesktop.tsx
// per the handoff README ("these files are the source, not a reference").
// Only the handoff's standalone PressShell/top-bar/page-header wrappers are
// omitted (the shipped Catalog page renders the real shell + header + pill
// row), and the MOCK_ consts are swapped for live data:
//   • run prices / turnaround  → GET catalog payload (cdCatalog /
//     cassetteCatalog, resolved server-side with handoff defaults)
//   • custom spot inks (CD)    → persisted via
//     PUT /api/admin/manufacturers/:id/catalog/media/cd
//   • MRP logo in the renders  → the press's labelLogoUrl/logoUrl
// Product photos are the handoff's real cut-outs (assets copied as-is) —
// never rebuilt in CSS.
// ─────────────────────────────────────────────────────────────────────
import { useState, type ReactNode } from "react";
import { Check, Paperclip } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import cdShiny from "@/assets/cd-cassette/cd-shiny.png";
import cdWhite from "@/assets/cd-cassette/cd-white.png";
import shellBlack from "@/assets/cd-cassette/shell-black.png";
import shellWhite from "@/assets/cd-cassette/shell-white.png";
import shellClear from "@/assets/cd-cassette/shell-clear.png";
import shellSmoke from "@/assets/cd-cassette/shell-smoke.png";
import shellSeablue from "@/assets/cd-cassette/shell-seablue.png";
import shellRed from "@/assets/cd-cassette/shell-red.png";
import shellCanary from "@/assets/cd-cassette/shell-canary.png";
import shellGrape from "@/assets/cd-cassette/shell-grape.png";

// Design tokens — handoff-verbatim (the CD/cassette pages are the dark
// desktop canon; they do not theme-flip like the vinyl page).
const BLUE = '#319ED8';
const INK = '#f5f5f7';
const SUBINK = '#98989d';
const FAINT = '#6e6e73';
const HAIRLINE = 'rgba(255,255,255,0.10)';
const CANVAS = '#161617';
const CARD = '#1e1e20';
const CARD_SOFT = '#26262a';
const PILL_ACTIVE = '#3a3a3e';
const COVER_GREEN = '#8fbc7f';

// ─── Shared live-data shape (GET catalog → cdCatalog / cassetteCatalog) ──
export type MediaCatalogData = {
  customSpotColors: { name: string; hex: string }[];
  prices: { qty: number; unitCents: number }[];
  turnaroundWeeksMin: number;
  turnaroundWeeksMax: number;
};

const centsToPrice = (c: number) => `$${(c / 100).toFixed(2)}`;

type Print = { name: string; sub: string; art: boolean };
// Spot colors the press keeps on the silkscreen bench — samples, not the
// full ink book. Same glossy-ball language as the vinyl color pick.
const STOCK_SPOT_COLORS = [
  { name: 'White', base: '#f4f4f2' },
  { name: 'Black', base: '#1a1b1e' },
  { name: 'Red', base: '#d1322e' },
  { name: 'Blue', base: '#2360d8' },
  { name: 'Yellow', base: '#e8c31f' },
  { name: 'Silver', base: '#a9adb4' },
];

const CD_PRINTS: Print[] = [
  { name: 'Silkscreen', sub: 'Up to 3 spot colors', art: false },
  { name: 'Full-color offset', sub: 'Photo-quality artwork', art: true },
];

const CD_CASES = [
  { name: 'Sleeve', sub: 'Printed cardboard wallet' },
  { name: 'Jewel case', sub: 'Standard clear case · booklet + tray card' },
];

// Waveform mark shared by jacket art and disc face. (placeholder-art canon)
function Waveform({ h, bar, color = '#ffffff' }: { h: number; bar: number; color?: string }) {
  return (
    <span className="flex items-center" style={{ gap: bar * 0.9 }}>
      {[0.16, 0.3, 0.44, 0.3, 0.16].map((f, i) => (
        <span key={i} className="rounded-full" style={{ width: bar, height: h * f, backgroundColor: color }} />
      ))}
    </span>
  );
}

// ─── Realistic CD render. The CASE choice changes the whole object; the
// PRINT choice re-paints the disc face. Jewel = clear polycarbonate lid with
// specular sweep, spine + hinge teeth, tray shadow behind booklet art. Sleeve
// = matte cardboard wallet with a soft printed edge. ─────────────────────
function CdRender({ caseName, print, spots, logoUrl }: { caseName: string; print: Print; spots: string[]; logoUrl: string | null }) {
  const S = 260; // case footprint
  const jewel = caseName === 'Jewel case';
  const silk = print.name === 'Silkscreen';
  // Silkscreen inks band the white disc: first pick owns the disc, each
  // extra pick pushes the earlier ones out into rings (outermost = first).
  // Band boundaries are equal-AREA so every ink reads as an even share.
  const bands = spots;
  let tint: string | undefined;
  if (silk && bands.length === 1) {
    tint = `radial-gradient(circle, transparent 12%, ${bands[0]} 12.5% 95.5%, transparent 96%)`;
  } else if (silk && bands.length === 2) {
    tint = `radial-gradient(circle, transparent 12%, ${bands[1]} 12.5% 68%, ${bands[0]} 68.5% 95.5%, transparent 96%)`;
  } else if (silk && bands.length >= 3) {
    tint = `radial-gradient(circle, transparent 12%, ${bands[2]} 12.5% 56%, ${bands[1]} 56.5% 78%, ${bands[0]} 78.5% 95.5%, transparent 96%)`;
  }
  return (
    <div className="relative cd-render" style={{ width: S * 1.42, height: S * 1.06 }}>
      {/* floor shadow so the object sits on the page */}
      <div
        aria-hidden
        className="absolute rounded-full"
        style={{
          bottom: -2,
          left: S * 0.08,
          width: S * 1.05,
          height: 20,
          background: 'rgba(0,0,0,0.4)',
          filter: 'blur(11px)',
        }}
      />

      {/* disc peeking out to the right — same "peek" language as the vinyl.
          Tucked mostly inside the case at rest; slides out on hover. */}
      <div
        className="absolute cd-peek"
        style={{ left: S * 0.3, top: S * 0.01, width: S * 0.98, height: S * 0.98, transition: 'left 0.45s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <img
          src={silk ? cdWhite : cdShiny}
          alt=""
          draggable={false}
          style={{ width: S * 0.98, height: S * 0.98 }}
        />
        {tint && (
          <div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: tint, mixBlendMode: 'multiply', transition: 'background 0.25s ease' }}
          />
        )}
      </div>
      <style>{`.cd-render:hover .cd-peek { left: ${S * 0.56}px; }`}</style>

      {jewel ? (
        // ─── JEWEL CASE — crystal-clear polycarbonate OVER a printed booklet.
        // The container is the transparent tray (dark, barely tinted). The
        // green waveform is the booklet insert, set in with clear margins so
        // clear plastic edges show all around. A glass lid sits on top.
        <div
          className="absolute left-0"
          style={{
            top: 0,
            width: S,
            height: S,
            borderRadius: 7,
            // dark, near-clear plastic tray — NOT green
            background: 'linear-gradient(135deg, rgba(40,42,46,0.55) 0%, rgba(24,25,28,0.7) 55%, rgba(34,36,40,0.6) 100%)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        >
          {/* printed booklet insert — inset with clear plastic margins around it */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: S * 0.115,
              right: S * 0.05,
              top: S * 0.05,
              bottom: S * 0.05,
              borderRadius: 2,
              backgroundColor: COVER_GREEN,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.35)',
            }}
          >
            <Waveform h={S * 0.46} bar={Math.round(S * 0.04)} />
          </div>

          {/* clear polycarbonate lid — full glass sheet with soft body sheen */}
          <div
            className="absolute inset-0"
            style={{
              borderRadius: 7,
              background:
                'linear-gradient(118deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 20%, rgba(255,255,255,0) 42%, rgba(255,255,255,0) 68%, rgba(255,255,255,0.14) 86%, rgba(255,255,255,0.02) 100%)',
              border: '1px solid rgba(255,255,255,0.3)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4), inset 0 0 26px rgba(255,255,255,0.06)',
            }}
          />
          {/* sharp glass streak — plastic catching a hard light */}
          <div
            className="absolute"
            style={{
              top: S * 0.03,
              left: S * 0.28,
              width: S * 0.12,
              height: S * 0.98,
              transform: 'rotate(19deg)',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)',
              filter: 'blur(2.5px)',
              mixBlendMode: 'screen',
            }}
          />
          {/* second faint streak higher up */}
          <div
            className="absolute"
            style={{
              top: S * 0.02,
              left: S * 0.52,
              width: S * 0.06,
              height: S * 0.9,
              transform: 'rotate(19deg)',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)',
              filter: 'blur(3px)',
              mixBlendMode: 'screen',
            }}
          />
          {/* clear hinge spine at left — transparent plastic, bright glass edge */}
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: S * 0.095,
              borderRadius: '7px 0 0 7px',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0.42) 0%, rgba(220,224,230,0.14) 34%, rgba(20,22,26,0.32) 72%, rgba(10,11,14,0.5) 100%)',
              borderRight: '1px solid rgba(0,0,0,0.35)',
              boxShadow: 'inset 1px 0 1px rgba(255,255,255,0.35)',
            }}
          />
          {/* hinge teeth — clear-plastic interlocking nubs down the spine */}
          {[0.08, 0.24, 0.4, 0.6, 0.76, 0.9].map((t) => (
            <div
              key={t}
              className="absolute"
              style={{
                left: S * 0.06,
                top: S * t,
                width: S * 0.03,
                height: S * 0.05,
                borderRadius: 1.5,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(120,124,132,0.25) 45%, rgba(10,11,14,0.4))',
                boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.2), 0 0 0 0.5px rgba(0,0,0,0.3)',
              }}
            />
          ))}
        </div>
      ) : (
        // ─── SLEEVE — matte printed cardboard wallet, MRP black like the album.
        <div
          className="absolute left-0"
          style={{
            top: 0,
            width: S,
            height: S,
            borderRadius: 4,
            backgroundColor: '#0b0b0c',
            boxShadow: '0 14px 34px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.09)',
          }}
        >
          {/* press mark printed on the board — same proportion as the album jacket */}
          <div className="absolute inset-0 flex items-center justify-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                draggable={false}
                style={{ width: S * 0.42, height: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.92 }}
              />
            ) : (
              <Waveform h={S * 0.3} bar={Math.round(S * 0.03)} color="rgba(255,255,255,0.9)" />
            )}
          </div>
          {/* matte cardboard: gentle top-light, no gloss */}
          <div
            className="absolute inset-0"
            style={{
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.1)',
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 38%)',
            }}
          />
          {/* soft rounded paper edge on the right + the open mouth */}
          <div
            className="absolute inset-y-0 right-0"
            style={{
              width: S * 0.02,
              borderRadius: '0 4px 4px 0',
              background: 'linear-gradient(90deg, rgba(0,0,0,0.2), rgba(0,0,0,0.32))',
            }}
          />
          {/* thin lighter edge along the top — the folded cardboard lip */}
          <div
            className="absolute inset-x-0 top-0"
            style={{ height: 3, borderRadius: '4px 4px 0 0', background: 'rgba(255,255,255,0.14)' }}
          />
        </div>
      )}
    </div>
  );
}

function TwoTone({ a, b, size = 24 }: { a: string; b: string; size?: number }) {
  return (
    <h2 style={{ fontSize: size, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.15 }}>
      <span style={{ color: INK }}>{a} </span>
      <span style={{ color: SUBINK, fontWeight: 500 }}>{b}</span>
    </h2>
  );
}

// A small realistic disc chip for the print-choice cards + preview swatch.
function DiscChip({ size, art }: { size: number; art: boolean }) {
  return (
    <span
      className="relative rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        boxShadow: '0 2px 6px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.14)',
      }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: art
            ? `radial-gradient(circle at 36% 30%, rgba(255,255,255,0.55), ${COVER_GREEN} 60%, #6f9a63 88%)`
            : 'radial-gradient(circle at 36% 30%, #fbfcfe, #dcdfe6 45%, #b7bcc6 78%)',
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          inset: size * 0.1,
          mixBlendMode: 'screen',
          opacity: art ? 0.4 : 0.7,
          background:
            'conic-gradient(from 205deg, rgba(120,180,255,0) 0deg, rgba(120,180,255,0.5) 40deg, transparent 90deg, rgba(255,150,205,0.45) 170deg, transparent 220deg, rgba(150,255,190,0.45) 300deg, transparent 360deg)',
        }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{
          mixBlendMode: 'screen',
          background:
            'linear-gradient(118deg, transparent 32%, rgba(255,255,255,0.5) 48%, transparent 58%)',
        }}
      />
      <span
        className="absolute rounded-full"
        style={{ inset: size * 0.36, background: 'rgba(20,20,22,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
      />
    </span>
  );
}

// ═══ CD catalog build body ═══════════════════════════════════════════════
export function CdCatalogBody({
  pressId,
  canEdit,
  logoUrl,
  data,
}: {
  pressId: string;
  canEdit: boolean;
  logoUrl: string | null;
  data: MediaCatalogData;
}) {
  const { toast } = useToast();
  const [cs, setCs] = useState('Sleeve');
  const [print, setPrint] = useState<Print>(CD_PRINTS[0]);
  const [printOpen, setPrintOpen] = useState(false);
  const [spots, setSpots] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addHex, setAddHex] = useState('#4ecb71');
  const customSpots = data.customSpotColors.map((c) => ({ name: c.name, base: c.hex }));
  const allSpots = [...STOCK_SPOT_COLORS, ...customSpots];
  const spotHexes = spots
    .map((n) => allSpots.find((c) => c.name === n)?.base)
    .filter((b): b is string => Boolean(b));
  const toggleSpot = (name: string) =>
    setSpots((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : prev.length >= 3 ? prev : [...prev, name],
    );
  const saveCustomSpots = useMutation({
    mutationFn: async (next: { name: string; hex: string }[]) => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/media/cd`, { customSpotColors: next });
      return r.json();
    },
    // Select the new ink only once it's persisted, so a failed write never
    // leaves a phantom selection in the disc preview.
    onSuccess: (_res, next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/manufacturers", pressId, "catalog"] });
      const added = next[next.length - 1]?.name;
      if (added) setSpots((prev) => (prev.includes(added) || prev.length >= 3 ? prev : [...prev, added]));
    },
    onError: (e: Error) => toast({ title: "Couldn't add color", description: e.message, variant: "destructive" }),
  });
  const addCustomSpot = () => {
    const name = addName.trim();
    // Single-flight: the popover's Add is the only writer; refuse a second
    // add while one is saving so both never PUT from the same stale list.
    if (!name || saveCustomSpots.isPending || allSpots.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    saveCustomSpots.mutate([...data.customSpotColors, { name, hex: addHex }]);
    setAddName('');
    setAddOpen(false);
  };
  const useDefaultTurnaround = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/media/cd`, { turnaroundWeeksMin: null, turnaroundWeeksMax: null });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/manufacturers", pressId, "catalog"] }),
  });
  const [booklet, setBooklet] = useState('4 panels');
  const jewel = cs === 'Jewel case';
  const PRICES: Array<[number, string]> = data.prices.map((p) => [p.qty, centsToPrice(p.unitCents)]);

  return (
    <fieldset disabled={!canEdit} data-testid="panel-cd-catalog">
      <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

      {/* Two-column body — everything below the rule is CD-specific */}
      <div className="grid gap-16" style={{ gridTemplateColumns: 'minmax(0, 1fr) 620px' }}>
        {/* Pinned product — sticky left, the case choice IS this object */}
        <div
          className="flex flex-col items-center justify-center"
          style={{ position: 'sticky', top: 24, alignSelf: 'start', minHeight: 545, paddingBottom: 38 }}
        >
          <CdRender caseName={cs} print={print} spots={spotHexes} logoUrl={logoUrl} />
          {/* Captions — shifted left so they center under the case, not the whole stage (vinyl canon) */}
          <div className="flex flex-col items-center" style={{ transform: 'translateX(-55px)' }}>
          <div className="flex items-center gap-2 text-[13px]" style={{ color: SUBINK, marginTop: 28 }}>
            <span>CD</span>
            <span style={{ color: FAINT }}>·</span>
            <span>{cs}</span>
            <span style={{ color: FAINT }}>·</span>
            <span style={{ color: INK, fontWeight: 600 }}>{print.name}</span>
          </div>
          <p className="text-[12px]" style={{ color: FAINT, marginTop: 8, marginBottom: 16 }}>
            {print.name === 'Silkscreen' ? 'Silkscreened disc' : 'Full-color printed disc'}, {jewel ? 'booklet and tray card' : 'wallet'} included.
          </p>
          </div>
        </div>

        {/* Choices column */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 56, maxWidth: 620 }}>
          {/* Step 1: the case */}
          <section>
            <TwoTone a="Pick a case." b="It sets the look of everything." />
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {CD_CASES.map((c) => {
                const active = cs === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setCs(c.name)}
                    className="rounded-2xl flex flex-col items-start justify-center px-5 transition-colors text-left"
                    style={{ height: 84, backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                  >
                    <span className="text-[14.5px] font-semibold" style={{ color: active ? BLUE : INK }}>
                      {c.name}
                    </span>
                    <span className="text-[12px] mt-0.5" style={{ color: SUBINK }}>
                      {c.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: disc print */}
          <section>
            <TwoTone a="Pick a print." b="The disc is the label." />
            {!printOpen ? (
              // Collapsed — same summary-row pattern as the vinyl type pick
              <div
                className="flex items-center gap-3.5 rounded-2xl"
                style={{ marginTop: 14, padding: '12px 18px', backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}
                data-testid="print-summary-row"
              >
                <DiscChip size={44} art={print.art} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate" style={{ color: INK }}>{print.name}</div>
                  <div className="text-[11.5px]" style={{ marginTop: 1, color: FAINT }}>
                    {print.name === 'Silkscreen' ? `Print · ${spots.length} of 3 colors` : `Print · ${print.sub.toLowerCase()}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintOpen(true)}
                  className="text-[13px] font-medium focus:outline-none"
                  style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  data-testid="button-change-print"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                {CD_PRINTS.map((p) => {
                  const active = print.name === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setPrint(p);
                        setPrintOpen(false);
                      }}
                      className="rounded-2xl flex items-center gap-4 px-5 transition-colors text-left"
                      style={{ height: 84, backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                    >
                      <DiscChip size={44} art={p.art} />
                      <span>
                        <span className="block text-[14px] font-semibold" style={{ color: active ? BLUE : INK }}>
                          {p.name}
                        </span>
                        <span className="block text-[12px] mt-0.5" style={{ color: SUBINK }}>
                          {p.sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Spot color samples — silkscreen only, same ball language as vinyl */}
            {print.name === 'Silkscreen' && (
              <div style={{ marginTop: 16 }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold" style={{ color: SUBINK }}>
                    Build colors · pick up to 3
                  </span>
                  <span className="text-[12px]" style={{ color: FAINT }}>
                    {spots.length} of 3
                  </span>
                </div>
                <div className="grid gap-3" style={{ marginTop: 10, gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
                  {allSpots.map((c) => {
                    const on = spots.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleSpot(c.name)}
                        className="rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
                        style={{
                          padding: '16px 10px 12px',
                          backgroundColor: CARD,
                          border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                        }}
                      >
                        <span className="relative flex justify-center" style={{ marginBottom: 8 }}>
                          <span
                            className="relative block rounded-full"
                            style={{ width: 48, height: 48, boxShadow: '0 0 0 1px rgba(255,255,255,0.14), 0 3px 8px rgba(0,0,0,0.5)' }}
                          >
                            <span
                              className="absolute inset-0 rounded-full"
                              style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${c.base} 70%)` }}
                            />
                          </span>
                          {on && (
                            <span
                              className="absolute flex items-center justify-center rounded-full"
                              style={{ width: 18, height: 18, backgroundColor: 'rgba(255,255,255,0.85)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                            >
                              <Check className="w-3 h-3" style={{ color: BLUE }} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className="block text-[12.5px] font-semibold leading-tight" style={{ color: on ? BLUE : INK }}>
                          {c.name}
                        </span>
                      </button>
                    );
                  })}
                  {/* Add a color — same dashed tile as the vinyl color pick */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAddOpen((v) => !v)}
                      className="w-full h-full rounded-2xl text-center transition-all hover:-translate-y-px focus:outline-none cursor-pointer flex flex-col items-center justify-center"
                      style={{ padding: '16px 10px 12px', border: '1.5px dashed rgba(255,255,255,0.18)', minHeight: 104 }}
                      data-testid="button-add-spot-color"
                    >
                      <span className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, border: `1.5px solid ${BLUE}` }}>
                        <span className="text-[18px] leading-none" style={{ color: BLUE }}>+</span>
                      </span>
                      <span className="block text-[12.5px] font-semibold" style={{ marginTop: 8, color: BLUE }}>
                        Add color
                      </span>
                    </button>
                    {addOpen && (
                      <div
                        className="absolute z-20 rounded-2xl"
                        style={{
                          top: 'calc(100% + 8px)',
                          right: 0,
                          width: 224,
                          padding: 14,
                          backgroundColor: CARD_SOFT,
                          border: `1px solid ${HAIRLINE}`,
                          boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="color"
                            value={addHex}
                            onChange={(e) => setAddHex(e.target.value)}
                            aria-label="Ink color"
                            style={{ width: 34, height: 34, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={addName}
                            onChange={(e) => setAddName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addCustomSpot()}
                            placeholder="Name the ink"
                            className="flex-1 min-w-0 rounded-lg text-[13px] focus:outline-none"
                            style={{ padding: '7px 10px', backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}
                          />
                        </div>
                        <div className="flex justify-end gap-3" style={{ marginTop: 12 }}>
                          <button
                            type="button"
                            onClick={() => setAddOpen(false)}
                            className="text-[13px] font-medium"
                            style={{ color: FAINT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={addCustomSpot}
                            className="text-[13px] font-semibold"
                            style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Step 3: booklet — jewel case only */}
          <section style={{ opacity: jewel ? 1 : 0.45, transition: 'opacity 0.25s ease' }}>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <TwoTone a="Pick a booklet." b="Liner notes, lyrics, credits." />
              {!jewel && (
                <span className="text-[12px]" style={{ color: FAINT }}>
                  Sleeves print on the wallet itself
                </span>
              )}
            </div>
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {['None', '4 panels', '8 panels', '12 panels'].map((b) => {
                const active = booklet === b && jewel;
                return (
                  <button
                    key={b}
                    type="button"
                    disabled={!jewel}
                    onClick={() => setBooklet(b)}
                    className="rounded-2xl flex items-center justify-center transition-colors"
                    style={{ height: 60, backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                  >
                    <span className="text-[13.5px] font-medium" style={{ color: active ? BLUE : INK }}>
                      {b}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Price */}
          <section>
            <TwoTone a="Set your price." b="They’ll show you the money." />
            <p className="text-[12.5px] mt-2" style={{ color: FAINT }}>
              {cs} · one price covers disc, print and packaging.
            </p>
            <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }}>
              {PRICES.map(([units, price], i) => (
                <div
                  key={units}
                  className="flex items-center justify-between px-5"
                  style={{ height: 56, backgroundColor: CARD, borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}
                >
                  <span className="text-[14px] font-semibold tabular-nums" style={{ color: INK }}>
                    {units.toLocaleString()}
                    <span className="text-[10px] uppercase ml-2 font-normal" style={{ color: SUBINK, letterSpacing: '0.08em' }}>
                      units
                    </span>
                  </span>
                  <span
                    className="inline-flex items-center justify-center rounded-lg tabular-nums text-[14px] font-semibold"
                    style={{ width: 88, height: 36, backgroundColor: PILL_ACTIVE, color: INK }}
                  >
                    {price}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[12px] mt-3" style={{ color: FAINT }}>
              Prices are per unit, per finished package.
            </p>
          </section>

          {/* Turnaround */}
          <section>
            <TwoTone a="Turnaround time." b="From order, to out the door." />
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}>
                {data.turnaroundWeeksMin}
              </span>
              <span style={{ color: FAINT }}>–</span>
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}>
                {data.turnaroundWeeksMax}
              </span>
              <span className="text-[13px]" style={{ color: SUBINK }}>
                weeks
              </span>
              <span className="flex-1" />
              <button type="button" onClick={() => useDefaultTurnaround.mutate()} className="text-[12.5px] font-medium" style={{ color: BLUE }}>
                Use press default
              </button>
            </div>
          </section>

          {/* Print prep */}
          <section>
            <TwoTone a="Print prep." b="The template for your templates." />
            <div className="mt-5 rounded-2xl flex items-center gap-3 px-5" style={{ height: 64, backgroundColor: CARD, border: `1px dashed rgba(255,255,255,0.2)` }}>
              <Paperclip className="w-4 h-4 flex-shrink-0" style={{ color: SUBINK }} />
              <span className="text-[13px]" style={{ color: SUBINK }}>
                Attach a file or paste a link to your print template…
              </span>
            </div>
          </section>
        </div>
      </div>
    </fieldset>
  );
}

// ═══ Cassette catalog build body ═══════════════════════════════════════════

// Every shell is the SAME neutral base photo, tinted per color (Bill's
// one-consistent-photo direction). Identical geometry across all 8, so the
// imprint overlay uses ONE fixed coordinate set (see ShellImprint). `light`
// flips the imprint ink to dark; `clear` shells have baked-in partial alpha.
type Shell = { name: string; base: string; img: string; light?: boolean; clear?: boolean };

const CASSETTE_SHELLS: Shell[] = [
  { name: 'Black', base: '#141416', img: shellBlack },
  { name: 'White', base: '#dcdcdc', img: shellWhite, light: true },
  { name: 'Clear', base: '#9aa4ab', img: shellClear, light: true, clear: true },
  { name: 'Smoke', base: '#5a5a60', img: shellSmoke, clear: true },
  { name: 'Sea Blue', base: '#41708c', img: shellSeablue, light: true },
  { name: 'Red', base: '#b03a35', img: shellRed },
  { name: 'Canary', base: '#d9c23a', img: shellCanary, light: true },
  { name: 'Grape', base: '#7a4e9e', img: shellGrape },
];

const CASSETTE_CASES = [
  { name: 'J-card + case', sub: 'Printed insert · clear norelco case' },
  { name: 'O-card slipcase', sub: 'Printed wrap-around board' },
];

const CASSETTE_IMPRINTS = [
  { name: 'On-shell print', sub: 'Silkscreened onto the shell' },
  { name: 'Paper label', sub: 'Printed sticker, classic look' },
];

// Ink flips per shell: dark on light shells, light on dark shells.
function shellInk(shell: Shell) {
  return shell.light
    ? { strong: 'rgba(28,26,24,0.9)', faint: 'rgba(28,26,24,0.62)' }
    : { strong: 'rgba(246,245,241,0.94)', faint: 'rgba(246,245,241,0.66)' };
}

// The imprint / paper-label overlay. Every shell shares the same base photo
// geometry (1000×669 box), so ONE fixed coordinate set works for all:
//   • shell body center ≈ x 48.5%; hub holes centered at y ≈ 46%
//   • flat zone ABOVE the hubs (upper third) → on-shell print sits here
//   • flat zone BETWEEN the hubs and the grip band → paper label sits here
function ShellImprint({ shell, imprint, w }: { shell: Shell; imprint: string; w: number }) {
  const ink = shellInk(shell);
  const paper = imprint === 'Paper label';

  if (paper) {
    // Clean printed sticker strip in the flat zone below the hubs, above grip.
    return (
      <div
        className="absolute"
        style={{ left: '25%', width: '48%', top: '59%', transform: 'translateY(-50%)', textAlign: 'center' }}
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #fbfbf7, #efefe8)',
            borderRadius: Math.max(2, w * 0.006),
            padding: `${w * 0.012}px ${w * 0.02}px`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ fontSize: w * 0.026, fontWeight: 700, letterSpacing: '0.03em', color: '#1c1a18', lineHeight: 1.15 }}>
            GOODTUNES · DEMO ALBUM
          </div>
          <div style={{ fontSize: w * 0.015, fontWeight: 600, letterSpacing: '0.02em', color: '#6a6a6a', lineHeight: 1.3, marginTop: w * 0.004 }}>
            OPENING TRACK · SECOND CUT · THIRD SONG
          </div>
        </div>
      </div>
    );
  }

  // On-shell print: silkscreened text directly on the plastic above the hubs.
  return (
    <div
      className="absolute"
      style={{
        left: '20%',
        width: '58%',
        top: '27%',
        transform: 'translateY(-50%)',
        textAlign: 'center',
        fontFamily: 'Arial, Helvetica, sans-serif',
        textShadow: shell.light ? 'none' : '0 0.5px 0 rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontSize: w * 0.03, fontWeight: 700, letterSpacing: '0.05em', color: ink.strong, lineHeight: 1.1 }}>
        GOODTUNES · DEMO ALBUM
      </div>
      <div style={{ fontSize: w * 0.017, fontWeight: 600, letterSpacing: '0.03em', color: ink.faint, lineHeight: 1.3, marginTop: w * 0.006 }}>
        OPENING TRACK · SECOND CUT · THIRD SONG
      </div>
    </div>
  );
}

// The tape itself — the real product photo for the selected shell, with the
// GoodTunes imprint overlaid. Drop-shadowed so it sits in the dark canvas.
function PhotoShell({ w, shell, imprint }: { w: number; shell: Shell; imprint: string }) {
  const h = w / 1.5; // vendor photos are ~3:2
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <img
        src={shell.img}
        alt={`${shell.name} cassette shell`}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          // faint 1px rim light traces the shell's outline (not a box) so the
          // black shell separates from the dark page
          filter: 'drop-shadow(0 0 1px rgba(255,255,255,0.3))',
          transition: 'opacity 0.2s ease',
        }}
      />
      <ShellImprint shell={shell} imprint={imprint} w={w} />
    </div>
  );
}

// Small shell-picker thumb — a small version of the same product photo.
function MiniShell({ shell, size = 60 }: { shell: Shell; size?: number }) {
  return (
    <img
      src={shell.img}
      alt={`${shell.name} shell`}
      draggable={false}
      className="flex-shrink-0"
      style={{
        width: size,
        height: size / 1.5,
        objectFit: 'contain',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
      }}
    />
  );
}

// ─── Realistic cassette render: printed piece left, tape peeking right —
// the same "peek" language as the record and the CD. ────────────────────
function CassetteRender({ caseName, shell, imprint, logoUrl }: { caseName: string; shell: Shell; imprint: string; logoUrl: string | null }) {
  const W = 330; // printed piece width
  const H = W * 0.66;
  const jcard = caseName === 'J-card + case';
  return (
    <div className="relative" style={{ width: W * 1.24, height: H * 1.21 }}>
      {/* printed piece: J-card front (in clear case) or O-card sleeve */}
      <div
        className="absolute left-0 flex items-center justify-center"
        style={{
          top: 0,
          width: H * 1.18 * 0.604, // real J-card front: 2.56in × 4.24in
          height: H * 1.18,
          backgroundColor: '#0b0b0c',
          backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.2) 60%)',
          borderRadius: 4,
          boxShadow: '0 16px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)',
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            draggable={false}
            style={{ width: '58%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
        ) : (
          <Waveform h={H * 0.3} bar={Math.round(H * 0.035)} color="rgba(255,255,255,0.9)" />
        )}
        {jcard ? (
          <>
            {/* clear norelco front over the J-card */}
            <div
              className="absolute inset-0"
              style={{
                borderRadius: 4,
                background:
                  'linear-gradient(115deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0) 48%, rgba(255,255,255,0.10) 80%)',
                border: '1px solid rgba(255,255,255,0.22)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            />
          </>
        ) : (
          <>
            {/* O-card: open top and bottom, paper edge */}
            <div
              className="absolute inset-0"
              style={{
                borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 40%)',
              }}
            />
            <div className="absolute inset-x-0 top-0" style={{ height: 2, background: 'rgba(0,0,0,0.26)' }} />
            <div className="absolute inset-x-0 bottom-0" style={{ height: 2, background: 'rgba(0,0,0,0.26)' }} />
          </>
        )}
      </div>
      {/* tape sitting in front of the case, low and overlapping */}
      <div className="absolute" style={{ left: W * 0.24, top: H * 0.42 }}>
        <PhotoShell w={W * 0.96} shell={shell} imprint={imprint} />
      </div>
    </div>
  );
}

export function CassetteCatalogBody({
  pressId,
  canEdit,
  logoUrl,
  data,
}: {
  pressId: string;
  canEdit: boolean;
  logoUrl: string | null;
  data: MediaCatalogData;
}) {
  const [cs, setCs] = useState('J-card + case');
  const [shell, setShell] = useState<Shell>(CASSETTE_SHELLS[0]);
  const [imprint, setImprint] = useState('On-shell print');
  const [jcard, setJcard] = useState('3 panels');
  const usesJcard = cs === 'J-card + case';
  const useDefaultTurnaround = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/catalog/media/cassette`, { turnaroundWeeksMin: null, turnaroundWeeksMax: null });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/manufacturers", pressId, "catalog"] }),
  });
  const PRICES: Array<[number, string]> = data.prices.map((p) => [p.qty, centsToPrice(p.unitCents)]);

  return (
    <fieldset disabled={!canEdit} data-testid="panel-cassette-catalog">
      <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

      {/* Two-column body — everything below the rule is cassette-specific */}
      <div className="grid gap-16" style={{ gridTemplateColumns: 'minmax(0, 1fr) 620px' }}>
        {/* Pinned product */}
        <div
          className="flex flex-col items-center justify-center"
          style={{ position: 'sticky', top: 24, alignSelf: 'start', minHeight: 545, paddingBottom: 38 }}
        >
          <CassetteRender caseName={cs} shell={shell} imprint={imprint} logoUrl={logoUrl} />
          <div className="flex items-center gap-2 text-[13px]" style={{ color: SUBINK, marginTop: 28 }}>
            <span
              className="w-3.5 h-3.5 rounded-full inline-block"
              style={{
                background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), ${shell.base} 68%)`,
                border: `1px solid ${HAIRLINE}`,
                transition: 'background 0.25s ease',
              }}
            />
            <span>Cassette</span>
            <span style={{ color: FAINT }}>·</span>
            <span>{cs}</span>
            <span style={{ color: FAINT }}>·</span>
            <span style={{ color: INK, fontWeight: 600 }}>{shell.name} shell</span>
          </div>
          <p className="text-[12px]" style={{ color: FAINT, marginTop: 8, marginBottom: 16 }}>
            Tape length is set by the album&rsquo;s runtime — C-30 up to C-90.
          </p>
        </div>

        {/* Choices column */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 56, maxWidth: 620 }}>
          {/* Step 1: the case */}
          <section>
            <TwoTone a="Pick a case." b="It sets the look of everything." />
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {CASSETTE_CASES.map((c) => {
                const active = cs === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setCs(c.name)}
                    className="rounded-2xl flex flex-col items-start justify-center px-5 transition-colors text-left"
                    style={{ height: 84, backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                  >
                    <span className="text-[14.5px] font-semibold" style={{ color: active ? BLUE : INK }}>
                      {c.name}
                    </span>
                    <span className="text-[12px] mt-0.5" style={{ color: SUBINK }}>
                      {c.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: shell color — the tape re-tints */}
          <section>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <TwoTone a="Pick a shell." b="Watch the tape change." />
              <span className="text-[12px]" style={{ color: FAINT }}>
                {CASSETTE_SHELLS.length} shells
              </span>
            </div>
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {CASSETTE_SHELLS.map((s) => {
                const active = shell.name === s.name;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setShell(s)}
                    className="rounded-2xl flex flex-col items-center pt-4 pb-3 px-2 transition-colors"
                    style={{ backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                  >
                    <MiniShell shell={s} />
                    <span className="text-[12.5px] font-medium mt-2.5 truncate max-w-full" style={{ color: active ? BLUE : INK }}>
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 3: imprint */}
          <section>
            <TwoTone a="Pick an imprint." b="How the shell gets its ink." />
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {CASSETTE_IMPRINTS.map((l) => {
                const active = imprint === l.name;
                return (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() => setImprint(l.name)}
                    className="rounded-2xl flex flex-col items-start justify-center px-5 transition-colors text-left"
                    style={{ height: 84, backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                  >
                    <span className="text-[14.5px] font-semibold" style={{ color: active ? BLUE : INK }}>
                      {l.name}
                    </span>
                    <span className="text-[12px] mt-0.5" style={{ color: SUBINK }}>
                      {l.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 4: J-card panels — only with the J-card case */}
          <section style={{ opacity: usesJcard ? 1 : 0.45, transition: 'opacity 0.25s ease' }}>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <TwoTone a="Pick a J-card." b="More panels, more room." />
              {!usesJcard && (
                <span className="text-[12px]" style={{ color: FAINT }}>
                  O-cards print on the wrap itself
                </span>
              )}
            </div>
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {['3 panels', '4 panels', '5 panels'].map((j) => {
                const active = jcard === j && usesJcard;
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={!usesJcard}
                    onClick={() => setJcard(j)}
                    className="rounded-2xl flex items-center justify-center transition-colors"
                    style={{ height: 60, backgroundColor: CARD, border: `1.5px solid ${active ? BLUE : HAIRLINE}` }}
                  >
                    <span className="text-[13.5px] font-medium" style={{ color: active ? BLUE : INK }}>
                      {j}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Price */}
          <section>
            <TwoTone a="Set your price." b="They’ll show you the money." />
            <p className="text-[12.5px] mt-2" style={{ color: FAINT }}>
              {cs} · one price covers all 8 shells.
            </p>
            <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }}>
              {PRICES.map(([units, price], i) => (
                <div
                  key={units}
                  className="flex items-center justify-between px-5"
                  style={{ height: 56, backgroundColor: CARD, borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}
                >
                  <span className="text-[14px] font-semibold tabular-nums" style={{ color: INK }}>
                    {units.toLocaleString()}
                    <span className="text-[10px] uppercase ml-2 font-normal" style={{ color: SUBINK, letterSpacing: '0.08em' }}>
                      units
                    </span>
                  </span>
                  <span
                    className="inline-flex items-center justify-center rounded-lg tabular-nums text-[14px] font-semibold"
                    style={{ width: 88, height: 36, backgroundColor: PILL_ACTIVE, color: INK }}
                  >
                    {price}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[12px] mt-3" style={{ color: FAINT }}>
              Prices are per unit, per finished package — shell, imprint, {usesJcard ? 'J-card and case' : 'O-card'} included.
            </p>
          </section>

          {/* Turnaround */}
          <section>
            <TwoTone a="Turnaround time." b="From order, to out the door." />
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}>
                {data.turnaroundWeeksMin}
              </span>
              <span style={{ color: FAINT }}>–</span>
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}>
                {data.turnaroundWeeksMax}
              </span>
              <span className="text-[13px]" style={{ color: SUBINK }}>
                weeks
              </span>
              <span className="flex-1" />
              <button type="button" onClick={() => useDefaultTurnaround.mutate()} className="text-[12.5px] font-medium" style={{ color: BLUE }}>
                Use press default
              </button>
            </div>
          </section>

          {/* Print prep */}
          <section>
            <TwoTone a="Print prep." b="The template for your templates." />
            <div className="mt-5 rounded-2xl flex items-center gap-3 px-5" style={{ height: 64, backgroundColor: CARD, border: `1px dashed rgba(255,255,255,0.2)` }}>
              <Paperclip className="w-4 h-4 flex-shrink-0" style={{ color: SUBINK }} />
              <span className="text-[13px]" style={{ color: SUBINK }}>
                Attach a file or paste a link to your print template…
              </span>
            </div>
          </section>
        </div>
      </div>
    </fieldset>
  );
}

// The dark canvas the handoff pages sit on (the pages are dark-canon even
// when the surrounding admin shell is light).
export const MEDIA_CATALOG_CANVAS = CANVAS;
