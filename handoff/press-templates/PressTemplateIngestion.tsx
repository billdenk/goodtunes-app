// PressTemplateIngestion — Surface 1 from the template-canon brief: the
// centerpiece. A press has just uploaded a template PDF; the platform
// parsed it and now PROPOSES what it found — identity from the title
// block, geometry measured from the vector layers, rules lifted from
// the printed instructions. Everything reads as "Extracted — not yet
// canon" until the press confirms. Correcting one field never restarts
// the flow (inline edit affordance per row).
//
// Worked example (real files): MRP 12" LP Center Label for 2LP,
// 100mm trim, code 12-LBL100M-2, revision R-091125.
// Shares the apple-canon press shell verbatim — no drift.
//
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock
// page (mock-only chrome). Dark is the canon default and unchanged.

import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, ClipboardList, Cog, Gift,
  Search, Bell, MessageSquarePlus, FileText, Pencil, Cpu, Eye, ChevronRight, Download, Moon, Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';
import PrintedAreasStudy, { STUDY_DARK, STUDY_LIGHT } from './_PrintedAreasStudy';
import { CENTER_LABEL_TEMPLATE_SPEC } from './PressAreasCenterLabelTemplate';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon ──
// The whole page (shell chrome, cards, and modal) reads from THEMES[mode].
// Dark stays the default so the canon rendering is byte-identical.
type Theme = {
  // shell / page surfaces + ink
  canvas: string;
  rail: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  // warning accent (word + shape carry meaning; color is supportive only)
  warn: string;
  // active nav pill fill + shadow
  navActive: string;
  navShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // modal scrim (dark-tinted in both themes) + panel shadow
  modalScrim: string;
  modalShadow: string;
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
    warn: '#c98a00',
    navActive: '#ffffff',
    navShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5',
    logoFilter: undefined,
    modalScrim: 'rgba(0,0,0,0.42)',
    modalShadow: '0 24px 80px rgba(0,0,0,0.24)',
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
    warn: '#e8b34b', // brightened warning accent on dark
    navActive: '#1e1e20',
    navShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    logoFilter: 'invert(1) brightness(1.8)',
    modalScrim: 'rgba(0,0,0,0.72)',
    modalShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const PRESS_NAV: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children?: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; soon?: boolean; route?: string }> }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  {
    // Create (founder, Aug 16 2026): an estimate or a package are two different
    // creations on two pages — one "Create" entry, live links to each.
    label: 'Create', icon: ClipboardList,
    children: [
      { label: 'Estimates', icon: ClipboardList, route: 'PressEstimatesIndex' },
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
                        backgroundColor: groupActive ? t.navActive : undefined,
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
                              backgroundColor: isActive ? t.navActive : undefined,
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
                    backgroundColor: isActive ? t.navActive : undefined,
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

function Row({ label, value, sub, t }: { label: string; value: string; sub?: string; t: Theme }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 group" style={{ borderBottom: `1px solid ${t.hairline}` }}>
      <div className="min-w-0">
        <div className="text-[12px]" style={{ color: t.subink }}>{label}</div>
        <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>{value}</div>
        {sub && <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>{sub}</div>}
      </div>
      <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
        <Pencil className="w-3 h-3" />
        Correct
      </button>
    </div>
  );
}

const RULES: Array<{ text: string; kind: 'auto' | 'eye' | 'both' }> = [
  { text: 'Art minimum 300ppi', kind: 'auto' },
  { text: '1-bit images minimum 800ppi', kind: 'auto' },
  { text: 'CMYK mode; Pantone spot inks stay as spot; no RGB', kind: 'auto' },
  { text: 'Art extends to the bleed line', kind: 'auto' },
  { text: 'Important text and graphics inside the safety line', kind: 'both' },
  { text: 'Final art submitted as high-resolution PDF with bleed included', kind: 'auto' },
  { text: 'Template layer deleted before submission', kind: 'auto' },
];

function RuleKind({ kind, t }: { kind: 'auto' | 'eye' | 'both'; t: Theme }) {
  const items = kind === 'auto' ? [{ Icon: Cpu, label: 'Automated' }] : kind === 'eye' ? [{ Icon: Eye, label: 'Check by eye' }] : [{ Icon: Cpu, label: 'Automated' }, { Icon: Eye, label: 'Plus judgment' }];
  return (
    <span className="flex items-center gap-2.5 flex-shrink-0">
      {items.map(({ Icon, label }) => (
        <span key={label} className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: t.faint }}>
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
      ))}
    </span>
  );
}

export default function PressTemplateIngestion() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [testOpen, setTestOpen] = useState(false);

  // ─── Scan progress (Bill, Aug 13 2026): a thin, ACCURATE progress bar
  // replaces the spinning arrow that "appears stuck". The bar is honest:
  // it advances step by step as each named check completes — upload,
  // then the individual checks — with the current step named under the
  // bar and a numeric "check n of N" readout. Progress never sits still
  // for more than a step's real duration and never rewinds. Colorblind
  // rule: progress = bar + percent + step words, never color alone.
  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [scanStep, setScanStep] = useState(0);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Each step owns a share of the bar proportional to its real cost, so
  // the bar tracks actual work — no fake ease-outs that stall at 90%.
  const SCAN_STEPS: { label: string; upTo: number }[] = [
    { label: 'Uploading file', upTo: 18 },
    { label: 'Reading layers', upTo: 34 },
    { label: 'Check 1 of 5 — Trim and bleed geometry', upTo: 50 },
    { label: 'Check 2 of 5 — Center hole position', upTo: 62 },
    { label: 'Check 3 of 5 — Safety ring clearance', upTo: 74 },
    { label: 'Check 4 of 5 — Ink and color mode', upTo: 86 },
    { label: 'Check 5 of 5 — Side map pages', upTo: 97 },
  ];

  const stopScan = () => {
    if (scanTimer.current) clearInterval(scanTimer.current);
    scanTimer.current = null;
    setScanning(false);
    setScanPct(0);
    setScanStep(0);
  };

  const startScan = () => {
    setScanning(true);
    setScanPct(0);
    setScanStep(0);
    // Mock pacing: ~14s total, ticking smoothly inside each step's share.
    scanTimer.current = setInterval(() => {
      setScanPct((p) => {
        const next = Math.min(p + 0.9, 100);
        setScanStep(SCAN_STEPS.findIndex((s) => next <= s.upTo) === -1 ? SCAN_STEPS.length - 1 : SCAN_STEPS.findIndex((s) => next <= s.upTo));
        if (next >= 100 && scanTimer.current) { clearInterval(scanTimer.current); scanTimer.current = null; }
        return next;
      });
    }, 120);
  };

  useEffect(() => () => { if (scanTimer.current) clearInterval(scanTimer.current); }, []);
  return (
    <PressShell active="Templates" t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Breadcrumb — Templates lands back on the library exactly where you left it
            (format + size preserved: Vinyl · 12″). */}
        {/* Canon breadcrumb — GDS Breadcrumb pattern: FAINT links, ChevronRight
            separators, current page in INK. Templates / Vinyl · 12″ land back on
            the library exactly where you left it. */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb-ingestion">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" className="transition-opacity hover:opacity-70" style={{ color: t.faint }} data-testid="link-back-templates">Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><button type="button" className="transition-opacity hover:opacity-70" style={{ color: t.faint }} data-testid="link-back-vinyl-12">Vinyl · 12″</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>Center labels</span></li>
          </ol>
        </nav>
        <div className="mt-3 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Center labels. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>12″ LP.</span>
            </h1>
        {/* Official file identity lives under the heading — name + provenance,
            download revealed on hover. Replaces the old intro paragraph and the
            source-file strip (the big printed-areas images just below carry the
            visual now). */}
            <div className="mt-1.5 group/file" data-testid="file-identity">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13.5px] font-medium truncate" style={{ color: t.ink }}>12-LBL100M-2 — 12in Center Labels for 2LP.pdf</span>
                <button
                  type="button"
                  title="Download the official template"
                  aria-label="Download the official template"
                  className="flex-shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity hover:opacity-80"
                  style={{ color: t.blue }}
                  data-testid="button-download-template"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          {/* Canon ghost pill — quiet until hover; its baseline sits with the
              provenance line, right above the Printed areas card. */}
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className={cn('h-8 px-4 rounded-full text-[13px] font-medium flex-shrink-0 transition-colors', t.hoverWash)}
            style={{ color: t.subink, border: `1px solid ${t.hairline}`, backgroundColor: 'transparent' }}
            data-testid="button-test-template"
          >
            Test
          </button>
        </div>

        {/* Printed areas first — coming back to this page, you see the template
            itself before the fine print. The SHARED study device (edit once in
            _PrintedAreasStudy), same spec as the study tab — no drift. */}
        <div className="mt-5">
          <PrintedAreasStudy spec={CENTER_LABEL_TEMPLATE_SPEC} embedded theme={mode === 'dark' ? STUDY_DARK : STUDY_LIGHT} />
        </div>

        {/* Used by — where this template is linked. Print prep and Components point
            at templates by name; this card shows every package that leans on it. */}
        <div className="mt-4 rounded-2xl px-5 pt-4 pb-4" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-used-by">
          <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Used by</h3>
          <div className="mt-3 grid gap-6" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>GoodTunes® Packages</div>
              <div className="mt-1.5 text-[13px]" style={{ color: t.subink }}>12″ 1LP — Standard</div>
              <div className="mt-1 text-[13px]" style={{ color: t.subink }}>12″ 2LP — Gatefold</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Memphis Record Pressing Packages</div>
              <div className="mt-1.5 text-[13px]" style={{ color: t.faint }}>None yet — quick-pick packages you build will link here.</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Identity */}
          <div className="rounded-2xl px-5 pt-4 pb-2" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Identity</h3>
              <span className="text-[11.5px]" style={{ color: t.faint }}>Extracted — please verify</span>
            </div>
            <div className="mt-2">
              <Row label="Press" value="Memphis Record Pressing" t={t} />
              <Row label="Component" value={'12" LP center label'} sub="Pre-filled — the template names itself. Change it if we misread." t={t} />
              <div className="flex items-start justify-between gap-4 py-2.5 group" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                <div>
                  <div className="text-[12px]" style={{ color: t.subink }}>Variant</div>
                  <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>2LP · 100mm trim size</div>
                  <div className="text-[12px] mt-0.5" style={{ color: t.warn }}>Read from curved title text — worth a second look.</div>
                </div>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>
              <Row label="Template code" value="12-LBL100M-2" t={t} />
              <div className="flex items-start justify-between gap-4 py-2.5 group">
                <div>
                  <div className="text-[12px]" style={{ color: t.subink }}>Revision</div>
                  <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>R-091125</div>
                  <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>R-072326 is live canon for this code — confirming supersedes it. Jobs in flight get flagged.</div>
                </div>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>
            </div>
          </div>

          {/* Geometry */}
          <div className="rounded-2xl px-5 pt-4 pb-2" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Geometry</h3>
            </div>
            <div className="mt-2">
              <Row label="Cut" value="100 mm diameter" t={t} />
              <Row label="Center hole" value="7 mm" t={t} />
              <Row label="Bleed ring" value="103 mm" sub="Art must reach this line" t={t} />
              <Row label="Safety ring" value="95 mm" sub="Text and important graphics stay inside" t={t} />
              <div className="py-2.5 group flex items-start justify-between gap-4">
                <div>
                  <div className="text-[12px]" style={{ color: t.subink }}>Side map</div>
                  <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>A + B required · C + D for double LP</div>
                  <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>Required page count derives from each project's LP count.</div>
                </div>
                <button type="button" className="mt-1 inline-flex items-center gap-1 text-[12px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: t.blue }}>
                  <Pencil className="w-3 h-3" />
                  Correct
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Printed areas — the visual verification Bill asked for: the machine
            detected the areas (pages) and drew the zones it measured; the press
            verifies by LOOKING, not by proofreading millimeters. Clicking a zone
            chip animates that ring on both thumbs. Same overlays later power the
            artist's drag-and-drop fit check. Zone state = word + ring, never
            color alone (colorblind rule). */}

        {/* The preview thumbnail was cropped from
            the template's GT PREVIEW layer (a circle for center labels; a rect
            sized per component otherwise). Its position + area become THE
            preview window everywhere: here on ingestion, on the artist's upload
            (layer hidden, so only art shows), and on the good-file / blind-file
            certification tests. One crop, one truth. */}

        {/* Rules */}
        <div className="mt-4 rounded-2xl px-5 pt-4 pb-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Rules — each becomes a check</h3>
            <span className="text-[11.5px]" style={{ color: t.faint }}>Lifted from the printed instructions</span>
          </div>
          <div className="mt-2">
            {RULES.map((r, i) => (
              <div key={r.text} className="flex items-center justify-between gap-4 py-2.5" style={{ borderBottom: i < RULES.length - 1 ? `1px solid ${t.hairline}` : undefined }}>
                <span className="text-[13px]" style={{ color: t.ink }}>{r.text}</span>
                <RuleKind kind={r.kind} t={t} />
              </div>
            ))}
          </div>
        </div>

        {/* Test modal — same upload pattern as the Templates library modal:
            drop zone + choose file. First a finished file you know is right,
            then a blind second file. Scrim stays dark-tinted in both themes. */}
        {testOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: t.modalScrim }} onClick={() => { stopScan(); setTestOpen(false); }} data-testid="overlay-test-template">
            <div className="rounded-3xl px-8 pt-7 pb-8" style={{ width: 520, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-[17px] font-semibold" style={{ color: t.ink }}>Test this template.</div>
                  <div className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Upload a finished file you know is right — we&rsquo;ll run every check against it. Then a blind second file.</div>
                </div>
                <button type="button" className="text-[13px] hover:opacity-80 flex-shrink-0" style={{ color: t.subink }} onClick={() => { stopScan(); setTestOpen(false); }} data-testid="button-close-test">Close</button>
              </div>
              {!scanning ? (
                <div className="mt-5 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.soft }}>
                  <FileText className="w-6 h-6 mb-2.5" style={{ color: t.faint }} />
                  <div className="text-[13.5px] font-medium" style={{ color: t.ink }}>Drop the finished file here</div>
                  <div className="mt-1 text-[12px]" style={{ color: t.faint }}>PDF with bleed included · layered vector preferred</div>
                  <button type="button" className={cn('mt-4 h-9 px-4 rounded-full text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }} onClick={startScan} data-testid="button-choose-test-file">
                    Choose file…
                  </button>
                </div>
              ) : (
                /* Scanning — thin, ACCURATE progress. The bar advances as each
                   named check completes; the current step reads under the bar
                   with a numeric percent. No spinner, nothing that can look
                   stuck: if a step is slow, its name is on screen saying
                   exactly what the machine is doing. */
                <div className="mt-5 rounded-2xl px-7 py-9" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.soft }} data-testid="panel-scan-progress">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                      <span className="text-[13px] font-medium truncate" style={{ color: t.ink }} data-testid="text-scan-filename">CALIFORNIALAND_12-LBL100M-2_final.pdf</span>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums flex-shrink-0" style={{ color: t.ink }} data-testid="text-scan-percent">{Math.round(scanPct)}%</span>
                  </div>
                  {/* Thin track — 3px, full width, blue fill, no easing tricks */}
                  <div className="mt-3.5 rounded-full overflow-hidden" style={{ height: 3, backgroundColor: t.hairline }} aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${scanPct}%`, backgroundColor: t.blue, transition: 'width 140ms linear' }} data-testid="bar-scan-progress" />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="text-[12px]" style={{ color: t.subink }} data-testid="text-scan-step">
                      {scanPct >= 100 ? 'Done — preparing results' : SCAN_STEPS[scanStep]?.label}
                    </span>
                    <button type="button" className="text-[12px] hover:opacity-80 flex-shrink-0" style={{ color: t.faint }} onClick={stopScan} data-testid="button-cancel-scan">Cancel</button>
                  </div>
                  <div className="mt-1.5 text-[11.5px]" style={{ color: t.faint }}>Usually 30–60 seconds. Keep this open.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}
