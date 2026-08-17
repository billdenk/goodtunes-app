// PressTemplateCertification — Surface 2 from the template-canon brief.
// Certification proves the canon works before any customer file touches
// it: a correct control file (the finished CALIFORNIALAND center labels,
// artist Niina Soleil) must pass clean, and a known-bad file with seeded
// errors must be rejected with every planted error called out by name.
// The results view is a side-by-side that reads as PROOF, not a log.
// Statuses are icon + word — never color alone.
// Shares the apple-canon press shell verbatim — no drift.
//
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock
// page (mock-only chrome). Dark is the canon default and unchanged.

import { useState } from 'react';
import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, Cog, Gift,
  Search, Bell, MessageSquarePlus, CheckCircle2, XCircle, ShieldCheck, FileText, ChevronRight, Moon, Sun,
} from 'lucide-react';
import PrintedAreasStudy, { STUDY_DARK, STUDY_LIGHT } from './_PrintedAreasStudy';
import { CENTER_LABEL_TEMPLATE_SPEC } from './PressAreasCenterLabelTemplate';
import { CENTER_LABEL_NIINA_SPEC } from './PressAreasCenterLabelNiina';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate, ClipboardList as NavEstimatesIcon } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon ──
// The whole page (shell chrome + result cards) reads from THEMES[mode].
// Dark stays the default so the canon rendering is byte-identical.
type Theme = {
  canvas: string;
  rail: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  // status accents (word + shape carry meaning; color is supportive only)
  ready: string;
  crit: string;
  readyWash: string;   // soft fill behind the ready verdict/pill
  critWash: string;    // soft fill behind the fail verdict
  neutralWash: string; // fill behind the neutral (control) header icon
  // active nav pill shadow
  navShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // breadcrumb / link hover ink class
  hoverInk: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // pop-out overlay backdrop (stays dark-tinted in both themes)
  overlayScrim: string;
  overlayShadow: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    soft: '#f0f0f2',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    blue: '#319ED8',
    ready: '#1c8a5b',
    crit: '#e0245e',
    readyWash: 'rgba(28,138,91,0.10)',
    critWash: 'rgba(224,36,94,0.10)',
    neutralWash: 'rgba(0,0,0,0.05)',
    navShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5',
    hoverInk: 'hover:text-black',
    logoFilter: undefined,
    overlayScrim: 'rgba(0,0,0,0.55)',
    overlayShadow: '0 24px 80px rgba(0,0,0,0.28)',
  },
  dark: {
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    soft: '#26262a',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    blue: '#319ED8',
    ready: '#34c98e',
    crit: '#ff5d8f',
    readyWash: 'rgba(52,201,142,0.12)',
    critWash: 'rgba(255,93,143,0.12)',
    neutralWash: 'rgba(255,255,255,0.06)',
    navShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    hoverInk: 'hover:text-white',
    logoFilter: 'invert(1) brightness(1.8)',
    overlayScrim: 'rgba(0,0,0,0.72)',
    overlayShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Apple-canon press shell (duplicated verbatim across all press mocks — no drift) ───
const PRESS_NAV: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children?: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; soon?: boolean; route?: string }> }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  {
    // Create (founder, Aug 16 2026): an estimate or a package are two different
    // creations on two pages — one "Create" entry, live links to each.
    label: 'Create', icon: NavEstimatesIcon,
    children: [
      { label: 'Estimates', icon: NavEstimatesIcon, route: 'PressEstimatesIndex' },
      { label: 'Packages', icon: NavPackage, route: 'PressPackagesIndex' },
    ],
  },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    label: 'Catalog',
    icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: NavPackage },
      { label: 'White Label', icon: NavLayers, soon: true },
      { label: 'GoodDeed Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave, soon: true },
      { label: 'Templates', icon: NavTemplate, soon: true },
    ],
  },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function PressShell({ active, t, children }: { active: string; t: Theme; children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
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
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={mrpLogo} alt="Memphis Record Pressing" className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            Memphis Record Pressing
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <span className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 flex-shrink-0', t.avatarRing)}>
            <img src={brandonPhoto} alt="BS" className="w-full h-full object-cover" />
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={cn('w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.soft }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) => {
              if (item.children) {
                const groupActive = item.label === active;
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !groupActive && t.hoverWash)}
                      style={{
                        fontWeight: groupActive ? 600 : 500,
                        color: groupActive ? t.ink : t.subink,
                        backgroundColor: groupActive ? t.card : undefined,
                        boxShadow: groupActive ? t.navShadow : undefined,
                      }}
                    >
                      <NavChevron className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    </button>
                    <div className="space-y-0.5">
                      {item.children.map(({ label, icon: Icon, soon, route }) => {
                        const isActive = label === active;
                        return (
                          <a
                            key={label}
                            href={route ? `#/${route}` : '#'}
                            onClick={(e) => { if (!route) e.preventDefault(); }}
                            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !isActive && t.hoverWash)}
                            style={{
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? t.ink : t.subink,
                              backgroundColor: isActive ? t.card : undefined,
                              boxShadow: isActive ? t.navShadow : undefined,
                            }}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                            <span className="truncate flex-1">{label}</span>
                            {soon && (
                              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.soft, color: t.subink }}>
                                Request
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              const { label, icon: Icon } = item;
              const isActive = label === active;
              return (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !isActive && t.hoverWash)}
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? t.ink : t.subink,
                    backgroundColor: isActive ? t.card : undefined,
                    boxShadow: isActive ? t.navShadow : undefined,
                  }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                  <span className="truncate flex-1">{label}</span>
                </a>
              );
            })}
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

// One shared parameter list — the same row in all three columns.
// Control = the canon value; good = the known-good file's result;
// blind = the blind file's result (four seeded errors land on their rows).
type CellResult = { tone: 'pass' | 'fail'; detail: string };
const PARAM_ROWS: Array<{ param: string; control: string; good: CellResult; blind: CellResult }> = [
  {
    param: 'Trim',
    control: '100 mm cut',
    good: { tone: 'pass', detail: '100 mm — matches canon' },
    blind: { tone: 'pass', detail: '100 mm — matches canon' },
  },
  {
    param: 'Center hole',
    control: '7 mm',
    good: { tone: 'pass', detail: '7 mm — matches canon' },
    blind: { tone: 'pass', detail: '7 mm — matches canon' },
  },
  {
    param: 'Sides',
    control: 'A + B required · single LP',
    good: { tone: 'pass', detail: 'A + B present' },
    blind: { tone: 'pass', detail: 'A + B present' },
  },
  {
    param: 'Bleed',
    control: '103 mm · template layer, not PDF bleed box',
    good: { tone: 'pass', detail: 'Art reaches the template\u2019s line' },
    blind: { tone: 'pass', detail: 'Art reaches the template\u2019s line' },
  },
  {
    param: 'Safety',
    control: 'All text inside 95 mm ring',
    good: { tone: 'pass', detail: 'All text inside the ring' },
    blind: { tone: 'fail', detail: 'Track list crosses the 95 mm line on Side A' },
  },
  {
    param: 'Color',
    control: 'CMYK · PMS 877 C stays spot',
    good: { tone: 'pass', detail: 'CMYK · spot preserved' },
    blind: { tone: 'fail', detail: 'RGB objects planted on Side B' },
  },
  {
    param: 'Resolution',
    control: '300 ppi floor · 800 ppi 1-bit',
    good: { tone: 'pass', detail: '350 ppi' },
    blind: { tone: 'fail', detail: '1-bit logo at 600 ppi — floor is 800' },
  },
  {
    param: 'File hygiene',
    control: 'Template layer removed',
    good: { tone: 'pass', detail: 'Layer removed' },
    blind: { tone: 'fail', detail: 'Layer \u201CTEMPLATE — DELETE\u201D still present' },
  },
];

const ROW_H = 64; // exact height in all three columns so every row sits on the same line
const HEADER_H = 96;

// The GT PREVIEW window from the control template — same circle, same
// position, rendered for each file so the three columns compare like
// with like. Control shows the guides; the test files show only art.

function ResultCell({ result, t }: { result: CellResult; t: Theme }) {
  const color = result.tone === 'pass' ? t.ready : t.crit;
  const Icon = result.tone === 'pass' ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start gap-2.5 py-3" style={{ height: ROW_H, overflow: 'hidden', borderBottom: `1px solid ${t.hairline}` }}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 1 }} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold" style={{ color }}>{result.tone === 'pass' ? 'Pass' : 'Fail'}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{result.detail}</div>
      </div>
    </div>
  );
}

function Verdict({ tone, title, sub, t }: { tone: 'pass' | 'fail'; title: string; sub: string; t: Theme }) {
  const color = tone === 'pass' ? t.ready : t.crit;
  const Icon = tone === 'pass' ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center gap-3.5 px-6 py-5">
      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: tone === 'pass' ? t.readyWash : t.critWash }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </span>
      <div className="min-w-0">
        <div className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{title}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{sub}</div>
      </div>
    </div>
  );
}

export default function PressTemplateCertification() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const studyTheme = mode === 'dark' ? STUDY_DARK : STUDY_LIGHT;
  // Pop-out review — one card at a time, never both.
  const [popout, setPopout] = useState<'template' | 'test' | null>(null);
  return (
    <PressShell active="Templates" t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Canon breadcrumb — GDS Breadcrumb pattern: FAINT links, ChevronRight
            separators, current page in INK. */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb-certification">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Vinyl · 12″</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Center labels</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>Test</span></li>
          </ol>
        </nav>
        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Test. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Center labels 12″ LP.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 720 }}>
              Upload a finished file you know is right. Every check runs against the template — the verdict
              proves the canon works before any customer file touches it.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0" style={{ color: t.ready, border: `1px solid ${t.ready}59`, backgroundColor: t.readyWash }}>
            <ShieldCheck className="w-4 h-4" />
            Certified · Sep 14, 2026
          </span>
        </div>

        {/* Side-by-side review — the shared study device, template left, the
            uploaded test file right. Click the pop-out to review ONE at a
            time, full width; never both at once. */}
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {([
            { key: 'template' as const, spec: CENTER_LABEL_TEMPLATE_SPEC, label: 'template' },
            // Press side: this is the TEST, not the customer's proof. Caption
            // trimmed so it holds one line at half width.
            { key: 'test' as const, spec: { ...CENTER_LABEL_NIINA_SPEC, title: 'Test.', caption: 'Niina Soleil, Californialand · 2 pages → 2 areas' }, label: 'test file' },
          ]).map(({ key, spec, label }) => (
            <div key={key} className="relative group/pop">
              <PrintedAreasStudy
                spec={spec}
                embedded
                panelSize={190}
                theme={studyTheme}
                headerAction={key === 'test' ? (
                  <button
                    type="button"
                    className={cn('mr-8 inline-flex items-center gap-1.5 text-[12.5px] font-medium flex-shrink-0 transition-colors', t.hoverInk)}
                    style={{ color: t.subink }}
                    data-testid="button-upload-again"
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M7 9.5V2.5M7 2.5 4.5 5M7 2.5 9.5 5M2 9.5v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
                    </svg>
                    Upload again
                  </button>
                ) : undefined}
              />
              <button
                type="button"
                onClick={() => setPopout(key)}
                title={`Review the ${label} full width`}
                aria-label={`Review the ${label} full width`}
                className="absolute z-10 flex items-center justify-center opacity-0 group-hover/pop:opacity-60 hover:!opacity-100 transition-opacity"
                style={{ top: 18, right: 16, width: 22, height: 22, color: t.subink }}
                data-testid={`button-popout-${key}`}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                  <path d="M7.5 1.5h3v3M10.5 1.5 7 5M4.5 10.5h-3v-3M1.5 10.5 5 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        {popout && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-12 px-10" style={{ backgroundColor: t.overlayScrim }} onClick={() => setPopout(null)} data-testid="overlay-cert-popout">
            <div className="w-full" style={{ maxWidth: 1080, boxShadow: t.overlayShadow }} onClick={(e) => e.stopPropagation()}>
              <PrintedAreasStudy spec={popout === 'template' ? CENTER_LABEL_TEMPLATE_SPEC : { ...CENTER_LABEL_NIINA_SPEC, title: 'Test.' }} embedded theme={studyTheme} />
            </div>
          </div>
        )}

        {/* Two columns — each reads as the fine print of the card above it:
            control values under the template, check results under the test file. */}
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* 1 · The known control template — what both files are measured against */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center gap-3.5 px-6 py-5" style={{ height: HEADER_H, overflow: 'hidden' }}>
              <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.neutralWash }}>
                <FileText className="w-5 h-5" style={{ color: t.subink }} />
              </span>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>The control template</div>
                <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>12-LBL100M-2 · the canon both files are measured against</div>
              </div>
            </div>
            <div className="px-6" style={{ borderTop: `1px solid ${t.hairline}` }}>
              {PARAM_ROWS.map((row) => (
                <div key={row.param} className="py-3" style={{ height: ROW_H, overflow: 'hidden', borderBottom: `1px solid ${t.hairline}` }}>
                  <div className="text-[12.5px] font-semibold" style={{ color: t.ink }}>{row.param}</div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{row.control}</div>
                </div>
              ))}
              <div className="flex items-center py-3.5 text-[12.5px]">
                <span style={{ color: t.faint }}>Confirmed as canon · Sep 14, 2026</span>
              </div>
            </div>
          </div>

          {/* 2 · A file done the right way — passes */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div style={{ height: HEADER_H, overflow: 'hidden' }}>
              <Verdict tone="pass" title="The test file" sub="CALIFORNIALAND center labels · Niina Soleil · passed clean" t={t} />
            </div>
            <div className="px-6" style={{ borderTop: `1px solid ${t.hairline}` }}>
              {PARAM_ROWS.map((row) => (
                <ResultCell key={row.param} result={row.good} t={t} />
              ))}
              <div className="flex items-center justify-between py-3.5 text-[12.5px]">
                <span style={{ color: t.subink }}>8 of 8 checks passed</span>
                <span style={{ color: t.faint }}>Preview rendered</span>
              </div>
            </div>
          </div>

        </div>

        <p className="mt-4 text-[12px]" style={{ color: t.faint }}>
          If this template is superseded by a new revision, the test file stays attached and re-runs
          automatically against the new canon.
        </p>
      </div>

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-[60] h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}
