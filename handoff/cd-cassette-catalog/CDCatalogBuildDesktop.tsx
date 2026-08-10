// CDCatalogBuildDesktopDark — DESKTOP (1440) catalog build page for a CD
// GoodTunes package. Bill's direction, Aug 9 2026:
//
//   • PACKAGES version, not components: step one is the CASE — Jewel case
//     or Sleeve, ONLY those two — and that choice sets the realistic
//     product render that anchors the whole page, just like the vinyl
//     album on the vinyl build page.
//   • The render must look REAL: jewel = clear hinged case w/ dark tray,
//     booklet art behind the front; sleeve = printed cardboard wallet.
//     Either way the silver disc peeks out and live-updates to the print
//     choice (silkscreen spot mark vs full-color offset art).
//   • Two-column: product pinned left (sticky), choices scroll right.
//     48px gutter, same as the vinyl desktop page.
//
// Canon: charcoal, GoodTunes blue, two-tone Apple headings.

import { useState, type ReactNode } from 'react';
import {
  Bell,
  Check,
  Paperclip,
  Search,
  MessageSquarePlus,
  LayoutDashboard,
  Users,
  Disc3,
  UserPlus,
  Library,
  Settings as Cog,
  Gift,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import goodtunesLogo from './assets/goodtunes-logo.png';
import cdShiny from './assets/cd-shiny.png';
import cdWhite from './assets/cd-white.png';
import mrpLabelLogo from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';

const BLUE = '#319ED8';
const INK = '#f5f5f7';
const SUBINK = '#98989d';
const FAINT = '#6e6e73';
const HAIRLINE = 'rgba(255,255,255,0.10)';
const CANVAS = '#161617';
const RAIL = '#1c1c1e';
const CARD = '#1e1e20';
const CARD_SOFT = '#26262a';
const PILL_ACTIVE = '#3a3a3e';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)';
const COVER_GREEN = '#8fbc7f';

type Print = { name: string; sub: string; art: boolean };
// Spot colors the press keeps on the silkscreen bench — samples, not the
// full ink book. Same glossy-ball language as the vinyl color pick.
const MOCK_SPOT_COLORS = [
  { name: 'White', base: '#f4f4f2' },
  { name: 'Black', base: '#1a1b1e' },
  { name: 'Red', base: '#d1322e' },
  { name: 'Blue', base: '#2360d8' },
  { name: 'Yellow', base: '#e8c31f' },
  { name: 'Silver', base: '#a9adb4' },
];

const MOCK_PRINTS: Print[] = [
  { name: 'Silkscreen', sub: 'Up to 3 spot colors', art: false },
  { name: 'Full-color offset', sub: 'Photo-quality artwork', art: true },
];

const MOCK_CASES = [
  { name: 'Sleeve', sub: 'Printed cardboard wallet' },
  { name: 'Jewel case', sub: 'Standard clear case · booklet + tray card' },
];

const PRICES: Array<[number, string]> = [
  [100, '$2.40'],
  [300, '$1.85'],
  [500, '$1.55'],
  [1000, '$1.35'],
  [2000, '$1.10'],
  [3000, '$0.95'],
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

// ─── RealisticDisc — a believable SILVER CD. Silver is the material; the base
// is a mirror-silver radial with a rainbow iridescent conic sheen. Structure,
// outer edge inward: silver rim → bright mirror ring → printed face (silver for
// silkscreen w/ a spot mark, green offset artwork for full-color, but the mirror
// rim and clear hub always stay visible) → clear transparent hub ring → punched
// center hole. Same layered material craft as the vinyl VinylDisc.
function RealisticDisc({ size, print }: { size: number; print: Print }) {
  const art = print.art;
  return (
    <div
      className="relative rounded-full flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        transition: 'filter 0.25s ease',
        // silver base — always the material, regardless of print choice
        background:
          'radial-gradient(circle at 38% 30%, #ffffff 0%, #e6e9ee 26%, #c2c7d0 52%, #9aa0ac 74%, #cfd4dd 92%, #a7adb8 100%)',
        boxShadow:
          '0 14px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.16)',
      }}
    >
      {/* iridescent rainbow data track — the tell-tale CD sheen, across the silver */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          mixBlendMode: 'screen',
          opacity: 0.85,
          background:
            'conic-gradient(from 205deg,' +
            'rgba(90,160,255,0) 0deg, rgba(90,160,255,0.6) 30deg, rgba(255,255,255,0) 66deg,' +
            'rgba(255,120,190,0.55) 132deg, rgba(255,255,255,0) 172deg,' +
            'rgba(120,255,180,0.55) 250deg, rgba(255,255,255,0) 292deg,' +
            'rgba(255,210,120,0.5) 332deg, rgba(90,160,255,0) 360deg)',
        }}
      />
      {/* printed FACE band — offset artwork prints here, between rim and hub;
          silkscreen keeps silver with just a faint spot ink wash */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.13,
          transition: 'background 0.25s ease, opacity 0.25s ease',
          background: art
            ? `radial-gradient(circle at 40% 34%, rgba(255,255,255,0.35), ${COVER_GREEN} 44%, #6f9a63 88%)`
            : 'radial-gradient(circle at 40% 34%, rgba(255,255,255,0.28), rgba(214,218,226,0.35) 60%, rgba(150,156,168,0.28) 100%)',
          opacity: art ? 0.94 : 0.6,
          maskImage: `radial-gradient(circle, #000 0%, #000 62%, transparent 74%)`,
          WebkitMaskImage: `radial-gradient(circle, #000 0%, #000 62%, transparent 74%)`,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}
      />
      {/* centered mark on the face */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Waveform h={size * 0.42} bar={Math.round(size * 0.024)} color={art ? '#ffffff' : '#6b7280'} />
      </div>
      {/* bright mirror ring — the reflective band near the outer edge */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.035,
          background: 'transparent',
          boxShadow:
            'inset 0 0 0 ' + Math.round(size * 0.02) + 'px rgba(255,255,255,0.5), inset 0 0 ' + Math.round(size * 0.04) + 'px rgba(255,255,255,0.35)',
        }}
      />
      {/* specular sweep — a hard glossy highlight raking across the disc */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          mixBlendMode: 'screen',
          background:
            'linear-gradient(118deg, rgba(255,255,255,0) 32%, rgba(255,255,255,0.7) 47%, rgba(255,255,255,0.08) 53%, rgba(255,255,255,0) 60%)',
        }}
      />
      {/* clear transparent hub ring — the inner polycarbonate collar */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.36,
          background:
            'radial-gradient(circle at 42% 36%, rgba(255,255,255,0.32), rgba(120,124,132,0.22) 55%, rgba(40,42,46,0.32) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.28), 0 0 0 1px rgba(0,0,0,0.25)',
        }}
      />
      {/* mirror-silver hub face (the shiny ring right around the hole) */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.41,
          background: 'radial-gradient(circle at 42% 36%, #ffffff, #d4d8df 55%, #9aa0ac 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)',
        }}
      />
      {/* center hole — punched, with a faint inner shadow */}
      <div
        className="absolute rounded-full"
        style={{
          width: size * 0.06,
          height: size * 0.06,
          left: '47%',
          top: '47%',
          backgroundColor: CANVAS,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.16)',
        }}
      />
    </div>
  );
}

// ─── Realistic CD render. The CASE choice changes the whole object; the
// PRINT choice re-paints the disc face. Jewel = clear polycarbonate lid with
// specular sweep, spine + hinge teeth, tray shadow behind booklet art. Sleeve
// = matte cardboard wallet with a soft printed edge. ─────────────────────
function CdRender({ caseName, print, spots }: { caseName: string; print: Print; spots: string[] }) {
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
          {/* MRP mark printed on the board — same proportion as the album jacket */}
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={mrpLabelLogo}
              alt=""
              draggable={false}
              style={{ width: S * 0.42, height: 'auto', filter: 'invert(1) brightness(1.7)', opacity: 0.92 }}
            />
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

function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  // Render a registered mark small and light, Apple-style, never bold.
  const parts = lead.split('®');
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>
        {parts.map((chunk, i) => (
          <span key={i}>
            {i > 0 && (
              <span style={{ fontSize: '0.38em', fontWeight: 400, verticalAlign: 'super', position: 'relative', top: '-0.15em' }}>
                {'®'}
              </span>
            )}
            {chunk}
          </span>
        ))}{' '}
      </span>
      <span style={{ color: FAINT, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: FAINT }}>
      {children}
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

// ─── Press portal shell — same rail + top bar + powered-by footer as the
// finished vinyl catalog page, so the CD build reads as the same product.
type NavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };
const PRESS_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog', icon: Library, active: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];
const PARTNER_NAME = 'Memphis Record Pressing';

function NavRow({ label, icon: Icon, active }: NavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={`flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors ${active ? '' : 'hover:bg-white/5'}`}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? CARD : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : FAINT }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

function PressShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-30"
        style={{
          backgroundColor: 'rgba(22,22,23,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-full bg-white ring-1 ring-white/15 flex items-center justify-center flex-shrink-0 p-1">
            <img src={mrpLabelLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" style={{ filter: 'brightness(0)' }} />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {PARTNER_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" variant="ghost" className="rounded-full" style={{ color: SUBINK, paddingLeft: 12, paddingRight: 12 }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: SUBINK }} aria-label="Search">
            <Search style={{ width: 18, height: 18 }} />
          </button>
          <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: SUBINK }} aria-label="Notifications">
            <Bell style={{ width: 18, height: 18 }} />
          </button>
          <button type="button" className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/15" aria-label="Account menu">
            <img src={brandonPhoto} alt="BS" className="w-full h-full object-cover" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
              <input
                className="w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] placeholder:text-white/30 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK, backgroundColor: CARD_SOFT }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: FAINT }}>
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: FAINT }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: 'invert(1) brightness(1.8)' }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function CDCatalogBuildDesktop() {
  const [cs, setCs] = useState('Sleeve');
  const [print, setPrint] = useState<Print>(MOCK_PRINTS[0]);
  const [printOpen, setPrintOpen] = useState(false);
  const [spots, setSpots] = useState<string[]>([]);
  const [customSpots, setCustomSpots] = useState<{ name: string; base: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addHex, setAddHex] = useState('#4ecb71');
  const allSpots = [...MOCK_SPOT_COLORS, ...customSpots];
  const spotHexes = spots
    .map((n) => allSpots.find((c) => c.name === n)?.base)
    .filter((b): b is string => Boolean(b));
  const toggleSpot = (name: string) =>
    setSpots((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : prev.length >= 3 ? prev : [...prev, name],
    );
  const addCustomSpot = () => {
    const name = addName.trim();
    if (!name || allSpots.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setCustomSpots((prev) => [...prev, { name, base: addHex }]);
    setSpots((prev) => (prev.length >= 3 ? prev : [...prev, name]));
    setAddName('');
    setAddOpen(false);
  };
  const [booklet, setBooklet] = useState('4 panels');
  const jewel = cs === 'Jewel case';

  return (
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Page header — verbatim from the vinyl Catalog page */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="tracking-tight" style={{ color: INK, fontSize: 32, lineHeight: 1.1, fontWeight: 700 }}>
              Catalog
            </h1>
            {/* Format switcher — same control as vinyl, CD turned on */}
            <div
              className="inline-flex items-center rounded-full"
              style={{ marginTop: 16, padding: 3, backgroundColor: CARD_SOFT }}
              role="tablist"
              aria-label="Catalog format"
            >
              {[
                { label: 'Vinyl', enabled: false },
                { label: 'CD', enabled: true },
                { label: 'Cassette', enabled: false },
              ].map((f) => (
                <button
                  key={f.label}
                  type="button"
                  role="tab"
                  aria-selected={f.enabled}
                  data-testid={`format-${f.label.toLowerCase()}`}
                  className="rounded-full transition-colors"
                  style={{
                    padding: '6px 18px',
                    fontSize: 13.5,
                    fontWeight: f.enabled ? 600 : 500,
                    color: f.enabled ? INK : FAINT,
                    backgroundColor: f.enabled ? PILL_ACTIVE : 'transparent',
                    boxShadow: f.enabled ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 24 }}>
              <SectionLabel>CD · Package pricing</SectionLabel>
              <PageHeading lead="Build your GoodTunes® packages." rest="On disc." />
            </div>
            <p className="text-[15px]" style={{ color: SUBINK, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
              Every CD is a 12 cm silver disc. No size, no type, no color builds — pick the case, pick the print, price the runs.
            </p>
          </div>
        </div>

        <div className="h-px w-full" style={{ backgroundColor: HAIRLINE, margin: '28px 0' }} />

        {/* Two-column body — everything below the rule is CD-specific */}
        <div className="grid gap-16" style={{ gridTemplateColumns: 'minmax(0, 1fr) 620px' }}>
        {/* Pinned product — sticky left, the case choice IS this object */}
        <div
          className="flex flex-col items-center justify-center"
          style={{ position: 'sticky', top: 24, alignSelf: 'start', minHeight: 545, paddingBottom: 38 }}
        >
          <CdRender caseName={cs} print={print} spots={spotHexes} />
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
              {MOCK_CASES.map((c) => {
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
                {MOCK_PRINTS.map((p) => {
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
                3
              </span>
              <span style={{ color: FAINT }}>–</span>
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}>
                5
              </span>
              <span className="text-[13px]" style={{ color: SUBINK }}>
                weeks
              </span>
              <span className="flex-1" />
              <button type="button" className="text-[12.5px] font-medium" style={{ color: BLUE }}>
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
      </div>
    </PressShell>
  );
}

export default CDCatalogBuildDesktopDark;
