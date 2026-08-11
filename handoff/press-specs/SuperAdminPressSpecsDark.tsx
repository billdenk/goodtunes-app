// SuperAdminPressSpecsDark — the SUPER ADMIN view of one press
// (Memphis Record Pressing), Catalog tab → Specs section, 1440×1100.
//
// Shell duplicated IDENTICALLY from SuperAdminPressCatalogPulldownDark
// (rail, breadcrumb, identity, tabs). HARD RULE per Bill — no drift.
// Below the Catalog heading, a quiet section pull-down picks between
// GoodTunes Packages / White Label / GoodDeed Certificates / Specs —
// here it shows Specs, rendering the same Specs page the press sees
// (shared header: Audio | Art left, idle Save right; Audio · Vinyl shown).
//
// Canon: super-admin charcoal (never fan navy), one blue pill max,
// dot+label for status, h1 two-tone -0.02em.

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
  Package,
  RefreshCw,
  Search,
  Send,
  Settings,
  Tags,
  Trash2,
  Users,
  Waves,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';

const BLUE = '#319ED8';
const INK = '#f5f5f7';
const SUBINK = '#98989d';
const FAINT = '#6e6e73';
const HAIRLINE = 'rgba(255,255,255,0.10)';
const CANVAS = '#161617';
const CARD = '#1e1e20';
const CARD_SOFT = '#26262a';
const RAIL = '#1b1b1d';
const PILL_ACTIVE = '#3a3a3e';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)';

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

function MemphisMark({ size = 34 }: { size?: number }) {
  return (
    <span className="relative rounded-full inline-block flex-shrink-0" style={{ width: size, height: size, backgroundColor: '#e8e6df' }}>
      <span className="absolute rounded-full" style={{ inset: size * 0.15, border: '2px solid #0d0d0e' }} />
      <span className="absolute rounded-full" style={{ inset: size * 0.38, backgroundColor: '#0d0d0e' }} />
    </span>
  );
}

// ─── Small form atoms (duplicated from PressSpecsAudioDark) ──────────
function Field({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: SUBINK }}>
        {label}
      </span>
      <span className="flex items-center h-9 rounded-lg px-3" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
        <input className="flex-1 bg-transparent text-[13.5px] focus:outline-none" style={{ color: INK, minWidth: 0, width: '100%' }} defaultValue={value} readOnly />
        {suffix && (
          <span className="text-[12px] flex-shrink-0 pl-2" style={{ color: FAINT }}>
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function SpecCard({ icon: Icon, title, sub, children }: { icon: typeof FileAudio; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
          <Icon className="w-4 h-4" style={{ color: SUBINK }} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>
            {title}
          </h2>
          <p className="text-[12px]" style={{ color: FAINT }}>
            {sub}
          </p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SuperAdminPressSpecsDark() {
  const [sectionOpen, setSectionOpen] = useState(false);

  return (
    <div className="h-screen w-full flex font-sans overflow-hidden" style={{ backgroundColor: CANVAS, color: INK }}>
      {/* Left rail */}
      <aside className="w-52 flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}>
        <div className="h-12 flex items-center px-4 flex-shrink-0">
          <img src={goodtunesLogo} alt="GoodTunes" className="h-6 w-auto object-contain" style={{ filter: 'invert(1) brightness(2)' }} />
        </div>
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="h-8 rounded-lg flex items-center gap-2 px-3" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAINT }} />
            <span className="text-[12px] flex-1" style={{ color: FAINT }}>
              Search admin...
            </span>
            <span className="text-[9.5px] px-1 rounded" style={{ color: FAINT, border: `1px solid ${HAIRLINE}` }}>
              ⌘K
            </span>
          </div>
        </div>
        <nav className="flex-1 px-3 pb-2 overflow-hidden">
          {RAIL_TOP.map((it) => (
            <div key={it.name} className="h-[30px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: SUBINK }}>
              <it.icon className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
              <span className="flex-1 truncate">{it.name}</span>
              {it.count ? <span className="text-[11px] tabular-nums" style={{ color: FAINT }}>{it.count}</span> : null}
              {it.chev ? <ChevronRight className="w-3.5 h-3.5" style={{ color: FAINT }} /> : null}
            </div>
          ))}
          {/* Partners — expanded */}
          <div className="h-[30px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: INK, fontWeight: 600 }}>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAINT }} />
            <span className="flex-1 truncate">Partners</span>
          </div>
          {PARTNER_CHILDREN.map((it) => (
            <div
              key={it.name}
              className="h-[28px] rounded-lg flex items-center gap-2.5 pl-6 pr-2.5 text-[12.5px]"
              style={{
                color: it.active ? INK : SUBINK,
                backgroundColor: it.active ? PILL_ACTIVE : 'transparent',
                fontWeight: it.active ? 600 : 400,
              }}
            >
              <it.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: it.active ? INK : FAINT }} />
              <span className="flex-1 truncate">{it.name}</span>
              {it.count ? <span className="text-[11px] tabular-nums" style={{ color: FAINT }}>{it.count}</span> : null}
            </div>
          ))}
          {RAIL_BOTTOM.map((it) => (
            <div key={it.name} className="h-[28px] rounded-lg flex items-center gap-2.5 px-2.5 text-[12.5px]" style={{ color: SUBINK }}>
              <it.icon className="w-4 h-4 flex-shrink-0" style={{ color: FAINT }} />
              <span className="flex-1 truncate">{it.name}</span>
              {it.chev ? <ChevronRight className="w-3.5 h-3.5" style={{ color: FAINT }} /> : null}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <main className="flex-1 overflow-y-auto px-10 pt-6 pb-16">
          {/* Breadcrumb + view-as */}
          <div className="flex items-center justify-between">
            <div className="text-[12.5px] flex items-center gap-1.5" style={{ color: SUBINK }}>
              <span>Presses</span>
              <span style={{ color: FAINT }}>›</span>
              <span style={{ color: INK }}>Memphis Record Pressing</span>
            </div>
            <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px]" style={{ border: `1px solid ${HAIRLINE}`, color: INK }}>
              <Eye className="w-3.5 h-3.5" style={{ color: SUBINK }} /> View as this partner
            </span>
          </div>

          {/* Press identity */}
          <div className="flex items-center gap-4 mt-4">
            <span className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0d0d0e', border: `1px solid ${HAIRLINE}` }}>
              <MemphisMark size={34} />
            </span>
            <div>
              <h1 className="text-[24px] font-semibold" style={{ letterSpacing: '-0.02em' }}>
                Memphis Record Pressing
              </h1>
              <span className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: BLUE }}>
                memphisrecordpressing.com <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Tabs — Catalog active, plain (no pull-down) */}
          <div className="flex items-center mt-5" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
            <div className="flex items-center gap-6 flex-1">
              {TABS.map((t) => {
                const active = t === 'Catalog';
                return (
                  <span
                    key={t}
                    className="pb-2.5 text-[13.5px]"
                    style={{
                      color: active ? INK : SUBINK,
                      fontWeight: active ? 600 : 400,
                      borderBottom: active ? `2px solid ${BLUE}` : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >
                    {t}
                  </span>
                );
              })}
            </div>
            <span className="flex items-center gap-4 pb-2.5">
              <RefreshCw className="w-4 h-4" style={{ color: FAINT }} />
              <Trash2 className="w-4 h-4" style={{ color: FAINT }} />
            </span>
          </div>

          {/* Catalog heading + section pull-down (open, Specs chosen) */}
          <div className="flex items-center gap-4 mt-6">
            <h2 className="text-[26px] font-semibold" style={{ letterSpacing: '-0.02em' }}>
              Catalog
            </h2>
            <div className="relative">
              <button
                type="button"
                onClick={() => setSectionOpen((o) => !o)}
                className="h-8 pl-3.5 pr-2.5 rounded-full inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
                style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, color: INK }}
                data-testid="button-catalog-section"
              >
                Specs
                <ChevronDown className="w-3.5 h-3.5" style={{ color: FAINT, transform: sectionOpen ? 'rotate(180deg)' : undefined }} />
              </button>
              {sectionOpen && (
                <div
                  className="absolute left-0 top-9 w-56 rounded-xl py-1.5 z-10"
                  style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.55)' }}
                >
                  {CATALOG_SECTIONS.map((s) => {
                    const on = s === 'Specs';
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSectionOpen(false)}
                        className="w-full flex items-center px-3.5 h-8 text-[12.5px] text-left transition-colors hover:bg-white/5"
                        style={{ color: on ? INK : SUBINK, fontWeight: on ? 600 : 400 }}
                        data-testid={`option-section-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      >
                        <span className="flex-1 truncate">{s}</span>
                        {on && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: BLUE }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Specs page — same shared header the press sees ── */}
          <div style={{ maxWidth: 860 }}>
            {/* Audio / Art left · Save (idle until changes) right — consistent header on both views */}
            <div className="mt-7 flex items-center justify-between gap-4">
              <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }} role="tablist" aria-label="Spec type">
                <button type="button" role="tab" aria-selected className="h-8 px-5 rounded-full text-[13px] font-semibold" style={{ color: INK, backgroundColor: PILL_ACTIVE, boxShadow: PILL_SHADOW }}>
                  Audio
                </button>
                <button type="button" role="tab" className="h-8 px-5 rounded-full text-[13px] font-semibold" style={{ color: SUBINK }}>
                  Art
                </button>
              </div>
              <button
                type="button"
                disabled
                className="h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0"
                style={{ backgroundColor: 'transparent', color: FAINT, border: `1px solid ${HAIRLINE}`, cursor: 'default' }}
                title="Enabled once you change something"
                data-testid="button-save-audio-specs"
              >Save</button>
            </div>

            <h3 className="mt-6 text-[30px] font-semibold" style={{ color: INK, letterSpacing: '-0.02em' }}>
              Specs. <span style={{ color: SUBINK }}>The numbers artists press against.</span>
            </h3>
            <p className="mt-2 text-[13.5px]" style={{ color: SUBINK }}>
              Artists see these at upload. Anything outside this press&apos;s numbers gets flagged before it reaches them.
            </p>

            {/* Format switcher — sits with the content it controls, below the shared header */}
            <div className="mt-8">
              <div className="inline-flex items-center p-0.5 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }} role="tablist" aria-label="Format">
                {(['Vinyl', 'CD', 'Cassette'] as const).map((f) => {
                  const on = f === 'Vinyl';
                  return (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="h-7 px-3.5 rounded-full text-[12.5px] font-medium transition-colors"
                      style={{ color: on ? INK : SUBINK, backgroundColor: on ? PILL_ACTIVE : undefined, boxShadow: on ? PILL_SHADOW : undefined }}
                      data-testid={`tab-format-${f.toLowerCase()}`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <SpecCard icon={FileAudio} title="Master files" sub="What this press accepts from artists — the digital inputs for a physical run.">
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
                  <Field label="Accepted formats" value={MOCK_VINYL_AUDIO.formats} />
                  <Field label="Bit depth (minimum)" value={MOCK_VINYL_AUDIO.bitDepth} suffix="bit" />
                  <Field label="Sample rate" value={MOCK_VINYL_AUDIO.sampleRate} suffix="kHz" />
                  <Field label="One file per side" value={MOCK_VINYL_AUDIO.onePerSide} />
                </div>
              </SpecCard>

              <SpecCard icon={Clock} title="Side lengths" sub="Longer sides press quieter. These are the cutting limits per size and speed.">
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)' }}>
                  <Field label={'12″ · 33⅓ RPM'} value={MOCK_VINYL_AUDIO.side12_33} suffix="min/side" />
                  <Field label={'12″ · 45 RPM'} value={MOCK_VINYL_AUDIO.side12_45} suffix="min/side" />
                  <Field label={'10″ · 33⅓ RPM'} value={MOCK_VINYL_AUDIO.side10_33} suffix="min/side" />
                  <Field label={'10″ · 45 RPM'} value={MOCK_VINYL_AUDIO.side10_45} suffix="min/side" />
                  <Field label={'7″ · 45 RPM'} value={MOCK_VINYL_AUDIO.side7_45} suffix="min/side" />
                </div>
                <p className="mt-3 text-[12px] flex items-start gap-1.5" style={{ color: FAINT }}>
                  <Info className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
                  Sides past these lengths get a heads-up at upload — artists can proceed, but we flag the level trade-off.
                </p>
              </SpecCard>

              <SpecCard icon={Waves} title="Cutting guidance" sub="Advisories shown to artists before they submit.">
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
                  <Field label="Low end mono below" value={MOCK_VINYL_AUDIO.monoBelow} suffix="Hz" />
                  <Field label="Sibilance / de-ess advisory" value={MOCK_VINYL_AUDIO.deEss} />
                </div>
              </SpecCard>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SuperAdminPressSpecsDark;
