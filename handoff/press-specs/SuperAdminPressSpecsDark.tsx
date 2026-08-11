// SuperAdminPressSpecsDark — the SUPER ADMIN view of one press
// (Memphis Record Pressing), Catalog tab → Specs section, 1440×1100.
//
// CORRECTED Aug 11 2026 per Bill to match the real app shell:
// - Full-width TOP BAR (GoodTunes logo left · bell + avatar right); the
//   rail sits below it and starts with the ⌘K search.
// - The CATALOG TAB ITSELF is the pull-down (GoodTunes Packages / White
//   Label / GoodDeed Certificates / Specs) — no separate "Catalog"
//   heading or stray pill. With Specs picked, the specs page renders
//   directly (shared header: Audio | Art left, idle Save right).
// - Memphis mark = white bullseye on black, matching the real app.
//
// Canon: super-admin charcoal (never fan navy), one blue pill max,
// dot+label for status, h1 two-tone -0.02em.
//
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock
// page (mock-only chrome). Dark is the canon default and unchanged.

import { useState } from 'react';
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileAudio,
  FileText,
  Grid2x2,
  HandHeart,
  Handshake,
  Info,
  Moon,
  Package,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sun,
  Tags,
  Trash2,
  Users,
  Waves,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon ──

type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  card: string;
  cardSoft: string;
  rail: string;
  pillActive: string;
  pillShadow: string;
  menuShadow: string;    // dropdown popover shadow
  hoverWash: string;     // hover class for menu rows
  logoFilter?: string;   // CSS invert for the dark-only wordmark asset
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    ink: '#1d1d1f',
    subink: 'rgba(0,0,0,0.62)',
    faint: 'rgba(0,0,0,0.4)',
    hairline: 'rgba(0,0,0,0.08)',
    canvas: '#ffffff',
    card: '#ffffff',
    cardSoft: '#f0f0f2',
    rail: '#f5f5f7',
    pillActive: '#ffffff',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    menuShadow: '0 12px 32px rgba(0,0,0,0.16)',
    hoverWash: 'hover:bg-black/5',
    logoFilter: undefined,
  },
  dark: {
    blue: '#319ED8',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)',
    canvas: '#161617',
    card: '#1e1e20',
    cardSoft: '#26262a',
    rail: '#1b1b1d',
    pillActive: '#3a3a3e',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    menuShadow: '0 12px 32px rgba(0,0,0,0.55)',
    hoverWash: 'hover:bg-white/5',
    logoFilter: 'invert(1) brightness(2)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Dummy data (handoff rule: all mock values in MOCK_ consts) ──────
const MOCK_VINYL_AUDIO = {
  formats: 'WAV, AIFF',
  bitDepth: '24',
  sampleRate: '44.1 – 192',
  onePerSide: 'Required, with track sheet',
  side12_33: '22',
  side12_45: '12',
  side10_33: '14',
  side10_45: '9',
  side7_45: '4:30',
  monoBelow: '150',
  deEss: 'Heavy de-essing above 8 kHz',
};

const MOCK_TOPBAR = { initials: 'B' };

const RAIL_TOP = [
  { name: 'Dashboard', icon: Grid2x2 },
  { name: 'People', icon: Users, count: '223' },
  { name: 'Catalog', icon: FileText, chev: true },
];

const PARTNER_CHILDREN = [
  { name: 'Labels', icon: Tags, count: '8' },
  { name: 'Managers', icon: Users, count: '1' },
  { name: 'NPOs', icon: HandHeart, count: '5' },
  { name: 'Presses', icon: Package, count: '6', active: true },
  { name: 'Find a press', icon: Search },
  { name: 'Makers', icon: Handshake, count: '14' },
  { name: 'Resellers', icon: Tags, count: '11' },
  { name: 'Fulfillment', icon: Send, count: '2' },
  { name: 'Team accounts', icon: Users },
];

const RAIL_BOTTOM = [
  { name: 'Queues', icon: Send, chev: true },
  { name: 'Audience', icon: Users },
  { name: 'Reports', icon: BarChart3 },
  { name: 'GoodDeed®', icon: HandHeart },
  { name: 'Publishing', icon: FileText },
  { name: 'System', icon: Settings, chev: true },
];

const TABS = ['Dashboard', 'Overview', 'People', 'Albums', 'Catalog', 'Analytics'];

const CATALOG_SECTIONS = ['GoodTunes Packages', 'White Label', 'GoodDeed Certificates', 'Specs'];

// White bullseye on black — matches the real app's Memphis mark. This is a
// partner mark on its own black carrier (a content asset), so it is NOT
// theme-dependent — it stays identical in light and dark per the logo rule.
function MemphisMark({ size = 34 }: { size?: number }) {
  return (
    <span className="relative rounded-full inline-block flex-shrink-0" style={{ width: size, height: size, backgroundColor: '#0d0d0e' }}>
      <span className="absolute rounded-full" style={{ inset: size * 0.12, border: `${Math.max(2, size * 0.12)}px solid #ffffff` }} />
      <span className="absolute rounded-full" style={{ inset: size * 0.4, backgroundColor: '#ffffff' }} />
    </span>
  );
}

// ─── Small form atoms (duplicated from PressSpecsAudioDark) ──────────
function Field({ label, value, suffix, t }: { label: string; value: string; suffix?: string; t: Theme }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: t.subink }}>
        {label}
      </span>
      <span className="flex items-center h-9 rounded-lg px-3" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
        <input className="flex-1 bg-transparent text-[13.5px] focus:outline-none" style={{ color: t.ink, minWidth: 0, width: '100%' }} defaultValue={value} readOnly />
        {suffix && (
          <span className="text-[12px] flex-shrink-0 pl-2" style={{ color: t.faint }}>
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function SpecCard({ icon: Icon, title, sub, children, t }: { icon: typeof FileAudio; title: string; sub: string; children: React.ReactNode; t: Theme }) {
  return (
    <section className="rounded-2xl p-6" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
          <Icon className="w-4 h-4" style={{ color: t.subink }} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: t.ink }}>
            {title}
          </h2>
          <p className="text-[12px]" style={{ color: t.faint }}>
            {sub}
          </p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SuperAdminPressSpecsDark() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [sectionOpen, setSectionOpen] = useState(false);

  return (
    <div className="h-screen w-full flex flex-col font-sans overflow-hidden" style={{ backgroundColor: t.canvas, color: t.ink }}>
      {/* Top bar — full width: logo left, bell + avatar right */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4" style={{ backgroundColor: t.rail, borderBottom: `1px solid ${t.hairline}` }}>
        <img src={goodtunesLogo} alt="GoodTunes" className="h-6 w-auto object-contain" style={{ filter: t.logoFilter }} />
        <span className="flex items-center gap-3">
          <Bell className="w-4 h-4" style={{ color: t.subink }} />
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-semibold" style={{ backgroundColor: t.pillActive, color: t.ink, boxShadow: t.pillShadow }}>
            {MOCK_TOPBAR.initials}
          </span>
        </span>
      </header>

      <div className="flex-1 min-h-0 flex">
      {/* Left rail */}
      <aside className="w-52 flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <div className="h-8 rounded-full flex items-center gap-2 px-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
            <span className="text-[12px] flex-1" style={{ color: t.faint }}>
              Search admin...
            </span>
            <span className="text-[9.5px] px-1 rounded" style={{ color: t.faint, border: `1px solid ${t.hairline}` }}>
              ⌘K
            </span>
          </div>
        </div>
        <nav className="flex-1 px-3 pb-2 overflow-hidden">
          {RAIL_TOP.map((it) => (
            <div key={it.name} className="h-[30px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: t.subink }}>
              <it.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
              <span className="flex-1 truncate">{it.name}</span>
              {it.count ? <span className="text-[11px] tabular-nums" style={{ color: t.faint }}>{it.count}</span> : null}
              {it.chev ? <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} /> : null}
            </div>
          ))}
          {/* Partners — expanded */}
          <div className="h-[30px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: t.ink, fontWeight: 600 }}>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
            <span className="flex-1 truncate">Partners</span>
          </div>
          {PARTNER_CHILDREN.map((it) => (
            <div
              key={it.name}
              className="h-[28px] rounded-lg flex items-center gap-2.5 pl-6 pr-2.5 text-[12.5px]"
              style={{
                color: it.active ? t.ink : t.subink,
                backgroundColor: it.active ? t.pillActive : 'transparent',
                fontWeight: it.active ? 600 : 400,
              }}
            >
              <it.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: it.active ? t.ink : t.faint }} />
              <span className="flex-1 truncate">{it.name}</span>
              {it.count ? <span className="text-[11px] tabular-nums" style={{ color: t.faint }}>{it.count}</span> : null}
            </div>
          ))}
          {RAIL_BOTTOM.map((it) => (
            <div key={it.name} className="h-[28px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: t.subink }}>
              <it.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
              <span className="flex-1 truncate">{it.name}</span>
              {it.chev ? <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} /> : null}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <main className="flex-1 overflow-y-auto px-10 pt-6 pb-16">
          {/* Breadcrumb + view-as */}
          <div className="flex items-center justify-between">
            <div className="text-[12.5px] flex items-center gap-1.5" style={{ color: t.subink }}>
              <span>Presses</span>
              <span style={{ color: t.faint }}>›</span>
              <span style={{ color: t.ink }}>Memphis Record Pressing</span>
            </div>
            <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px]" style={{ border: `1px solid ${t.hairline}`, color: t.ink }}>
              <Eye className="w-3.5 h-3.5" style={{ color: t.subink }} /> View as this partner
            </span>
          </div>

          {/* Press identity */}
          <div className="flex items-center gap-4 mt-4">
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0d0d0e', border: `1px solid ${t.hairline}` }}>
              <MemphisMark size={34} />
            </span>
            <div>
              <h1 className="text-[24px] font-semibold" style={{ letterSpacing: '-0.02em' }}>
                Memphis Record Pressing
              </h1>
              <span className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: t.blue }}>
                memphisrecordpressing.com <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Tabs — the Catalog TAB is the pull-down (Specs picked) */}
          <div className="flex items-center mt-5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
            <div className="flex items-center gap-6 flex-1">
              {TABS.map((tab) => {
                const active = tab === 'Catalog';
                if (tab === 'Catalog') {
                  return (
                    <div key={tab} className="relative">
                      <button
                        type="button"
                        onClick={() => setSectionOpen((o) => !o)}
                        className="pb-2.5 text-[13.5px] inline-flex items-center gap-1"
                        style={{
                          color: t.ink,
                          fontWeight: 600,
                          borderBottom: `2px solid ${t.blue}`,
                          marginBottom: -1,
                        }}
                        data-testid="tab-catalog"
                      >
                        Catalog
                        <ChevronDown className="w-3.5 h-3.5" style={{ color: t.faint, transform: sectionOpen ? 'rotate(180deg)' : undefined }} />
                      </button>
                      {sectionOpen && (
                        <div
                          className="absolute left-0 top-9 w-56 rounded-xl py-1.5 z-10"
                          style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.menuShadow }}
                        >
                          {CATALOG_SECTIONS.map((s) => {
                            const on = s === 'Specs';
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSectionOpen(false)}
                                className={cn('w-full flex items-center px-3.5 h-8 text-[12.5px] text-left transition-colors', t.hoverWash)}
                                style={{ color: on ? t.ink : t.subink, fontWeight: on ? 600 : 400 }}
                                data-testid={`option-section-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                              >
                                <span className="flex-1 truncate">{s}</span>
                                {on && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.blue }} />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <span
                    key={tab}
                    className="pb-2.5 text-[13.5px]"
                    style={{
                      color: active ? t.ink : t.subink,
                      fontWeight: active ? 600 : 400,
                      borderBottom: active ? `2px solid ${t.blue}` : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >
                    {tab}
                  </span>
                );
              })}
            </div>
            <span className="flex items-center gap-4 pb-2.5">
              <RefreshCw className="w-4 h-4" style={{ color: t.faint }} />
              <Trash2 className="w-4 h-4" style={{ color: t.faint }} />
            </span>
          </div>

          {/* ── Specs page — same shared header the press sees ── */}
          <div style={{ maxWidth: 860 }}>
            {/* Audio / Art left · Save (idle until changes) right — consistent header on both views */}
            <div className="mt-7 flex items-center justify-between gap-4">
              <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }} role="tablist" aria-label="Spec type">
                <button type="button" role="tab" aria-selected className="h-8 px-5 rounded-full text-[13px] font-semibold" style={{ color: t.ink, backgroundColor: t.pillActive, boxShadow: t.pillShadow }}>
                  Audio
                </button>
                <button type="button" role="tab" className="h-8 px-5 rounded-full text-[13px] font-semibold" style={{ color: t.subink }}>
                  Art
                </button>
              </div>
              <button
                type="button"
                disabled
                className="h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0"
                style={{ backgroundColor: 'transparent', color: t.faint, border: `1px solid ${t.hairline}`, cursor: 'default' }}
                title="Enabled once you change something"
                data-testid="button-save-audio-specs"
              >Save</button>
            </div>

            <h3 className="mt-6 text-[30px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.02em' }}>
              Specs. <span style={{ color: t.subink }}>The numbers artists press against.</span>
            </h3>
            <p className="mt-2 text-[13.5px]" style={{ color: t.subink }}>
              Artists see these at upload. Anything outside this press&apos;s numbers gets flagged before it reaches them.
            </p>

            {/* Format switcher — sits with the content it controls, below the shared header */}
            <div className="mt-8">
              <div className="inline-flex items-center p-0.5 rounded-full" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }} role="tablist" aria-label="Format">
                {(['Vinyl', 'CD', 'Cassette'] as const).map((f) => {
                  const on = f === 'Vinyl';
                  return (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="h-7 px-3.5 rounded-full text-[12.5px] font-medium transition-colors"
                      style={{ color: on ? t.ink : t.subink, backgroundColor: on ? t.pillActive : undefined, boxShadow: on ? t.pillShadow : undefined }}
                      data-testid={`tab-format-${f.toLowerCase()}`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <SpecCard icon={FileAudio} title="Master files" sub="What this press accepts from artists — the digital inputs for a physical run." t={t}>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <Field label="Accepted formats" value={MOCK_VINYL_AUDIO.formats} t={t} />
                  <Field label="Bit depth (minimum)" value={MOCK_VINYL_AUDIO.bitDepth} suffix="bit" t={t} />
                  <Field label="Sample rate" value={MOCK_VINYL_AUDIO.sampleRate} suffix="kHz" t={t} />
                  <Field label="One file per side" value={MOCK_VINYL_AUDIO.onePerSide} t={t} />
                </div>
              </SpecCard>

              <SpecCard icon={Clock} title="Side lengths" sub="Longer sides press quieter. These are the cutting limits per size and speed." t={t}>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <Field label={'12″ · 33⅓ RPM'} value={MOCK_VINYL_AUDIO.side12_33} suffix="min/side" t={t} />
                  <Field label={'12″ · 45 RPM'} value={MOCK_VINYL_AUDIO.side12_45} suffix="min/side" t={t} />
                  <Field label={'10″ · 33⅓ RPM'} value={MOCK_VINYL_AUDIO.side10_33} suffix="min/side" t={t} />
                  <Field label={'10″ · 45 RPM'} value={MOCK_VINYL_AUDIO.side10_45} suffix="min/side" t={t} />
                  <Field label={'7″ · 45 RPM'} value={MOCK_VINYL_AUDIO.side7_45} suffix="min/side" t={t} />
                </div>
                <p className="mt-3 text-[12px] flex items-start gap-1.5" style={{ color: t.faint }}>
                  <Info className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
                  Sides past these lengths get a heads-up at upload — artists can proceed, but we flag the level trade-off.
                </p>
              </SpecCard>

              <SpecCard icon={Waves} title="Cutting guidance" sub="Advisories shown to artists before they submit." t={t}>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  <Field label="Low end mono below" value={MOCK_VINYL_AUDIO.monoBelow} suffix="Hz" t={t} />
                  <Field label="Sibilance / de-ess advisory" value={MOCK_VINYL_AUDIO.deEss} t={t} />
                </div>
              </SpecCard>
            </div>
          </div>
        </main>
      </div>
      </div>

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-30 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </div>
  );
}

export default SuperAdminPressSpecsDark;
