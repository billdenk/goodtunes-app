// CassetteCatalogBuildDesktopDark — DESKTOP (1440) catalog build page for
// a cassette GoodTunes package. Same case-first logic as the CD page:
//
//   • Step one is the CASE — J-card + clear case, or O-card slipcase —
//     and that choice sets the realistic render for the whole page.
//   • Bill's "tall box vs wide tape" question, answered OUR way: the
//     cassette is WIDE, exactly like the record and the CD — the printed
//     piece sits left and the tape peeks out to the right. One visual
//     language across all three formats.
//   • The shell peeking out is the LIVE color preview (like the vinyl
//     record) — pick a shell color and the tape re-tints.
//
// This desktop page is wrapped in the press portal shell (left rail, top
// bar, POWERED BY GoodTunes footer, Catalog active) so it reads as the
// same product as the finished vinyl catalog page. The tape render itself
// is built to the vinyl page's realism level — layered plastic sheen,
// specular highlights, edge bevels, screws, write-protect notches, and a
// clear window showing two hubs with a wound tape pack (more on one side).
//
// Canon: charcoal, GoodTunes blue, two-tone Apple headings.

import { useState, type ReactNode } from 'react';
import {
  Bell,
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
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';
import shellBlack from '../assets/shell-black.png';
import shellWhite from '../assets/shell-white.png';
import shellClear from '../assets/shell-clear.png';
import shellSmoke from '../assets/shell-smoke.png';
import shellSeablue from '../assets/shell-seablue.png';
import shellRed from '../assets/shell-red.png';
import shellCanary from '../assets/shell-canary.png';
import shellGrape from '../assets/shell-grape.png';

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon light ──
// Only page SURFACES / ink / rail / cards / hairlines are theme tokens. The
// realistic cassette render (shell photos, J-card, O-card) is its own product
// artwork and stays identical in both themes — a black shell is black in
// light mode too.
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  rail: string;
  card: string;
  cardSoft: string;
  pillActive: string;
  pillShadow: string;
  dashed: string;        // dashed "add" cell borders
  headerBg: string;      // sticky translucent header
  navHoverClass: string; // hover wash utility class for nav/icon buttons
  placeholderClass: string;
  logoFilter: string;    // GoodTunes wordmark: invert on dark, none on light
  railLogoRing: string;  // ring for avatar/logo carriers
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    ink: '#1d1d1f',
    subink: 'rgba(0,0,0,0.62)',
    faint: 'rgba(0,0,0,0.4)',
    hairline: 'rgba(0,0,0,0.08)',
    canvas: '#ffffff',
    rail: '#f5f5f7',
    card: '#ffffff',
    cardSoft: '#f0f0f2',
    pillActive: '#ffffff',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    dashed: 'rgba(0,0,0,0.18)',
    headerBg: 'rgba(255,255,255,0.72)',
    navHoverClass: 'hover:bg-black/5',
    placeholderClass: 'placeholder:text-black/30',
    logoFilter: 'none',
    railLogoRing: 'ring-black/10',
  },
  dark: {
    blue: '#319ED8',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)',
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    cardSoft: '#26262a',
    pillActive: '#3a3a3e',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    dashed: 'rgba(255,255,255,0.20)',
    headerBg: 'rgba(22,22,23,0.72)',
    navHoverClass: 'hover:bg-white/5',
    placeholderClass: 'placeholder:text-white/30',
    logoFilter: 'invert(1) brightness(1.8)',
    railLogoRing: 'ring-white/15',
  },
};

const COVER_GREEN = '#8fbc7f';

// Every shell is now the SAME neutral base photo, tinted per color (Bill's
// one-consistent-photo direction). Identical geometry across all 8, so the
// imprint overlay uses ONE fixed coordinate set (see ShellImprint). `light`
// flips the imprint ink to dark; `clear` shells have baked-in partial alpha.
type Shell = { name: string; base: string; img: string; light?: boolean; clear?: boolean };

const SHELLS: Shell[] = [
  { name: 'Black', base: '#141416', img: shellBlack },
  { name: 'White', base: '#dcdcdc', img: shellWhite, light: true },
  { name: 'Clear', base: '#9aa4ab', img: shellClear, light: true, clear: true },
  { name: 'Smoke', base: '#5a5a60', img: shellSmoke, clear: true },
  { name: 'Sea Blue', base: '#41708c', img: shellSeablue, light: true },
  { name: 'Red', base: '#b03a35', img: shellRed },
  { name: 'Canary', base: '#d9c23a', img: shellCanary, light: true },
  { name: 'Grape', base: '#7a4e9e', img: shellGrape },
];

const CASES = [
  { name: 'J-card + case', sub: 'Printed insert · clear norelco case' },
  { name: 'O-card slipcase', sub: 'Printed wrap-around board' },
];

const IMPRINTS = [
  { name: 'On-shell print', sub: 'Silkscreened onto the shell' },
  { name: 'Paper label', sub: 'Printed sticker, classic look' },
];

const PRICES: Array<[number, string]> = [
  [50, '$3.10'],
  [100, '$2.45'],
  [250, '$1.95'],
  [500, '$1.68'],
  [1000, '$1.48'],
];

function Waveform({ h, bar, color = '#ffffff' }: { h: number; bar: number; color?: string }) {
  return (
    <span className="flex items-center" style={{ gap: bar * 0.9 }}>
      {[0.16, 0.3, 0.44, 0.3, 0.16].map((f, i) => (
        <span key={i} className="rounded-full" style={{ width: bar, height: h * f, backgroundColor: color }} />
      ))}
    </span>
  );
}

// ─── Photo-realistic cassette from real vendor product photos ─────────────
// Instead of a CSS-drawn shell, we render the A to Z Media stock shell photo
// for the selected color and overlay GoodTunes' demo imprint (or a paper
// label) positioned against the actual photo's window.

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
function CassetteRender({ caseName, shell, imprint }: { caseName: string; shell: Shell; imprint: string }) {
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
        <img
          src={mrpLogo}
          alt="Memphis Record Pressing"
          draggable={false}
          style={{ width: '58%', objectFit: 'contain', filter: 'invert(1)' }}
        />
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


function PageHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  // Render a registered mark small and light, Apple-style, never bold.
  const parts = lead.split('®');
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: t.ink }}>
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
      <span style={{ color: t.faint, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function SectionLabel({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>
      {children}
    </div>
  );
}

function TwoTone({ a, b, size = 24, t }: { a: string; b: string; size?: number; t: Theme }) {
  return (
    <h2 style={{ fontSize: size, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.15 }}>
      <span style={{ color: t.ink }}>{a} </span>
      <span style={{ color: t.subink, fontWeight: 500 }}>{b}</span>
    </h2>
  );
}

// ─── Press portal shell (rail + top bar + powered-by footer) ──────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog', icon: Library, active: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

const PARTNER_NAME = 'Memphis Record Pressing';

function NavRow({ label, icon: Icon, active, t }: PressNavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={`flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors${active ? '' : ` ${t.navHoverClass}`}`}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.card : undefined,
        boxShadow: active ? t.pillShadow : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

function PressShell({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`h-9 w-9 rounded-full bg-white ring-1 ${t.railLogoRing} flex items-center justify-center flex-shrink-0 p-1`}>
            <img src={mrpLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {PARTNER_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" variant="ghost" className="rounded-full" style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button type="button" className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.navHoverClass}`} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={`w-8 h-8 rounded-full overflow-hidden ring-1 ${t.railLogoRing} focus:outline-none`}
            aria-label="Account menu"
          >
            <img src={brandonPhoto} alt="BS" className="w-full h-full object-cover" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={`w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] ${t.placeholderClass} focus:outline-none`}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.cardSoft }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) => (
              <NavRow key={item.label} {...item} t={t} />
            ))}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function CassetteCatalogBuildDesktopDark() {
  const [cs, setCs] = useState('J-card + case');
  const [shell, setShell] = useState<Shell>(SHELLS[0]);
  const [imprint, setImprint] = useState('On-shell print');
  const [jcard, setJcard] = useState('3 panels');
  const usesJcard = cs === 'J-card + case';
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];

  return (
    <PressShell t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Page header — verbatim from the vinyl Catalog page */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="tracking-tight" style={{ color: t.ink, fontSize: 32, lineHeight: 1.1, fontWeight: 700 }}>
              Catalog
            </h1>
            {/* Format switcher — same control as vinyl, Cassette turned on */}
            <div
              className="inline-flex items-center rounded-full"
              style={{ marginTop: 16, padding: 3, backgroundColor: t.cardSoft }}
              role="tablist"
              aria-label="Catalog format"
            >
              {[
                { label: 'Vinyl', enabled: false },
                { label: 'CD', enabled: false },
                { label: 'Cassette', enabled: true },
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
                    color: f.enabled ? t.ink : t.faint,
                    backgroundColor: f.enabled ? t.pillActive : 'transparent',
                    boxShadow: f.enabled ? t.pillShadow : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 24 }}>
              <SectionLabel t={t}>Cassette · Package pricing</SectionLabel>
              <PageHeading lead="Build your GoodTunes® packages." rest="On tape." t={t} />
            </div>
            <p className="text-[15px]" style={{ color: t.subink, marginTop: 12, maxWidth: 560, lineHeight: 1.5 }}>
              One shell, one speed. No size, no type — but shells come in stock colors, so color survives here in miniature.
            </p>
          </div>
        </div>

        <div className="h-px w-full" style={{ backgroundColor: t.hairline, margin: '28px 0' }} />

        {/* Two-column body — everything below the rule is cassette-specific.
            Grid wraps (single column) below ~1100px so the sticky product and
            the choices don't overflow horizontally on narrow viewports. */}
        <div className="cassette-build-grid grid gap-16">
          <style>{`
            .cassette-build-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 620px); }
            @media (max-width: 1100px) {
              .cassette-build-grid { grid-template-columns: minmax(0, 1fr); }
              .cassette-build-grid > .cassette-build-product { position: static !important; }
            }
          `}</style>
        {/* Pinned product */}
        <div
          className="cassette-build-product flex flex-col items-center justify-center"
          style={{ position: 'sticky', top: 24, alignSelf: 'start', minHeight: 545, paddingBottom: 38 }}
        >
          <CassetteRender caseName={cs} shell={shell} imprint={imprint} />
          <div className="flex items-center gap-2 text-[13px]" style={{ color: t.subink, marginTop: 28 }}>
            <span
              className="w-3.5 h-3.5 rounded-full inline-block"
              style={{
                background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), ${shell.base} 68%)`,
                border: `1px solid ${t.hairline}`,
                transition: 'background 0.25s ease',
              }}
            />
            <span>Cassette</span>
            <span style={{ color: t.faint }}>·</span>
            <span>{cs}</span>
            <span style={{ color: t.faint }}>·</span>
            <span style={{ color: t.ink, fontWeight: 600 }}>{shell.name} shell</span>
          </div>
          <p className="text-[12px]" style={{ color: t.faint, marginTop: 8, marginBottom: 16 }}>
            Tape length is set by the album&rsquo;s runtime — C-30 up to C-90.
          </p>
        </div>

        {/* Choices column */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 56, maxWidth: 620 }}>
          {/* Step 1: the case */}
          <section>
            <TwoTone a="Pick a case." b="It sets the look of everything." t={t} />
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {CASES.map((c) => {
                const active = cs === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setCs(c.name)}
                    className="rounded-2xl flex flex-col items-start justify-center px-5 transition-colors text-left"
                    style={{ height: 84, backgroundColor: t.card, border: `1.5px solid ${active ? t.blue : t.hairline}` }}
                  >
                    <span className="text-[14.5px] font-semibold" style={{ color: active ? t.blue : t.ink }}>
                      {c.name}
                    </span>
                    <span className="text-[12px] mt-0.5" style={{ color: t.subink }}>
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
              <TwoTone a="Pick a shell." b="Watch the tape change." t={t} />
              <span className="text-[12px]" style={{ color: t.faint }}>
                {SHELLS.length} shells
              </span>
            </div>
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {SHELLS.map((s) => {
                const active = shell.name === s.name;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setShell(s)}
                    className="rounded-2xl flex flex-col items-center pt-4 pb-3 px-2 transition-colors"
                    style={{ backgroundColor: t.card, border: `1.5px solid ${active ? t.blue : t.hairline}` }}
                  >
                    <MiniShell shell={s} />
                    <span className="text-[12.5px] font-medium mt-2.5 truncate max-w-full" style={{ color: active ? t.blue : t.ink }}>
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 3: imprint */}
          <section>
            <TwoTone a="Pick an imprint." b="How the shell gets its ink." t={t} />
            <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {IMPRINTS.map((l) => {
                const active = imprint === l.name;
                return (
                  <button
                    key={l.name}
                    type="button"
                    onClick={() => setImprint(l.name)}
                    className="rounded-2xl flex flex-col items-start justify-center px-5 transition-colors text-left"
                    style={{ height: 84, backgroundColor: t.card, border: `1.5px solid ${active ? t.blue : t.hairline}` }}
                  >
                    <span className="text-[14.5px] font-semibold" style={{ color: active ? t.blue : t.ink }}>
                      {l.name}
                    </span>
                    <span className="text-[12px] mt-0.5" style={{ color: t.subink }}>
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
              <TwoTone a="Pick a J-card." b="More panels, more room." t={t} />
              {!usesJcard && (
                <span className="text-[12px]" style={{ color: t.faint }}>
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
                    style={{ height: 60, backgroundColor: t.card, border: `1.5px solid ${active ? t.blue : t.hairline}` }}
                  >
                    <span className="text-[13.5px] font-medium" style={{ color: active ? t.blue : t.ink }}>
                      {j}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Price */}
          <section>
            <TwoTone a="Set your price." b="They’ll show you the money." t={t} />
            <p className="text-[12.5px] mt-2" style={{ color: t.faint }}>
              {cs} · one price covers all 8 shells.
            </p>
            <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}` }}>
              {PRICES.map(([units, price], i) => (
                <div
                  key={units}
                  className="flex items-center justify-between px-5"
                  style={{ height: 56, backgroundColor: t.card, borderTop: i ? `1px solid ${t.hairline}` : 'none' }}
                >
                  <span className="text-[14px] font-semibold tabular-nums" style={{ color: t.ink }}>
                    {units.toLocaleString()}
                    <span className="text-[10px] uppercase ml-2 font-normal" style={{ color: t.subink, letterSpacing: '0.08em' }}>
                      units
                    </span>
                  </span>
                  <span
                    className="inline-flex items-center justify-center rounded-lg tabular-nums text-[14px] font-semibold"
                    style={{ width: 88, height: 36, backgroundColor: t.pillActive, color: t.ink }}
                  >
                    {price}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[12px] mt-3" style={{ color: t.faint }}>
              Prices are per unit, per finished package — shell, imprint, {usesJcard ? 'J-card and case' : 'O-card'} included.
            </p>
          </section>

          {/* Turnaround */}
          <section>
            <TwoTone a="Turnaround time." b="From order, to out the door." t={t} />
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.ink }}>
                4
              </span>
              <span style={{ color: t.faint }}>–</span>
              <span className="inline-flex items-center justify-center rounded-xl tabular-nums text-[16px] font-semibold" style={{ width: 64, height: 44, backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.ink }}>
                6
              </span>
              <span className="text-[13px]" style={{ color: t.subink }}>
                weeks
              </span>
              <span className="flex-1" />
              <button type="button" className="text-[12.5px] font-medium" style={{ color: t.blue }}>
                Use press default
              </button>
            </div>
          </section>

          {/* Print prep */}
          <section>
            <TwoTone a="Print prep." b="The template for your templates." t={t} />
            <div className="mt-5 rounded-2xl flex items-center gap-3 px-5" style={{ height: 64, backgroundColor: t.card, border: `1px dashed ${t.dashed}` }}>
              <Paperclip className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} />
              <span className="text-[13px]" style={{ color: t.subink }}>
                Attach a file or paste a link to your print template…
              </span>
            </div>
          </section>
        </div>
        </div>
      </div>

      {/* Mock-only theme toggle — bottom-right floating pill */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-40 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}

export default CassetteCatalogBuildDesktopDark;
