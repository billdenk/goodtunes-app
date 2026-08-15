// PressTemplatesIndex — Surface 3 from the template-canon brief: the
// library of canon, a new page under Specs. Each entry: component,
// variant, template code, revision, certification date, status.
// Statuses are icon + word (never color alone). One certified revision
// is live per component; superseded revisions stay in history.
// MOCK_ data from the worked example (MRP 12-LBL100M-2 R-091125).
// Shares the apple-canon press shell verbatim with the other press mocks.
//
// Theme-aware: light + dark via the THEMES map; toggle floats on the mock
// page (mock-only chrome). Dark is the canon default and unchanged.

import { useEffect, useRef, useState } from 'react';
import { pendingTemplateFile, savedLiveTemplates } from './PressTemplateLiveTest';
import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, ClipboardList, Cog, Gift,
  Search, Bell, MessageSquarePlus, BadgeCheck, Clock3, XCircle, History, Upload, FileQuestion,
  Moon, Sun, MoreHorizontal, Archive, X, RotateCcw, Plus, Info,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';
import gtPreviewTemplate from '../assets/gt-preview-template-circle.png';
// Real MRP center-label template PDF — clicking the certified tile opens it
// live, exactly as it looked before it was saved (Bill, Aug 14 2026).
// eslint-disable-next-line import/no-unresolved
import labelTemplatePdfUrl from '../assets/label-template-r091125.pdf?url';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon ──
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
  pillActive: string;      // raised active pill on the segmented track
  pillShadow: string;      // active nav/pill lift
  segShadow: string;       // raised thumb on the segmented format/size control
  headerBg: string;        // sticky translucent header
  searchPlaceholder: string; // input placeholder class
  avatarRing: string;      // logo/avatar carrier ring
  hoverWash: string;       // rail/nav hover class
  tileHover: string;       // filled-tile hover wash
  dashedBorder: string;    // empty "add" slot dashed border
  ready: string;           // certified accent
  crit: string;            // failed accent
  warn: string;            // pending / couldn't-read accent
  iconFill: string;        // die-line icon "paper" fill (behind dashed context)
  logoFilter?: string;     // CSS invert for the dark-only wordmark asset
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    cardSoft: '#f0f0f2',
    pillActive: '#ffffff',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    segShadow: '0 1px 3px rgba(0,0,0,0.08)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5',
    tileHover: 'hover:bg-black/[0.02]',
    dashedBorder: 'rgba(0,0,0,0.18)',
    ready: '#1c8a5b',
    crit: '#e0245e',
    warn: '#c98a00',
    iconFill: '#ffffff',
    logoFilter: undefined,
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
    segShadow: '0 1px 3px rgba(0,0,0,0.4)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    tileHover: 'hover:bg-white/[0.03]',
    dashedBorder: 'rgba(255,255,255,0.22)',
    ready: '#34c98e', // brightened ready accent on dark
    crit: '#ff5d8f',  // brightened critical accent on dark
    warn: '#e8b34b',  // brightened warning accent on dark
    iconFill: '#1e1e20',
    logoFilter: 'invert(1) brightness(1.8)',
  },
};

const PRESS_NAV: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children?: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; soon?: boolean }> }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
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
                        boxShadow: groupActive ? t.pillShadow : undefined,
                      }}
                    >
                      <NavChevron className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    </button>
                    <div className="space-y-0.5">
                      {item.children.map(({ label, icon: Icon, soon }) => {
                        const isActive = label === active;
                        return (
                          <a
                            key={label}
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !isActive && t.hoverWash)}
                            style={{
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? t.ink : t.subink,
                              backgroundColor: isActive ? t.card : undefined,
                              boxShadow: isActive ? t.pillShadow : undefined,
                            }}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                            <span className="truncate flex-1">{label}</span>
                            {soon && (
                              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>
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
                    boxShadow: isActive ? t.pillShadow : undefined,
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

type Status = 'certified' | 'pending' | 'failed' | 'superseded' | 'unread';

const STATUS_META: Record<Status, { label: string; accent: (t: Theme) => string; Icon: typeof BadgeCheck }> = {
  certified: { label: 'Certified', accent: (t) => t.ready, Icon: BadgeCheck },
  pending: { label: 'Pending', accent: (t) => t.warn, Icon: Clock3 },
  failed: { label: 'Failed', accent: (t) => t.crit, Icon: XCircle },
  superseded: { label: 'Superseded', accent: (t) => t.faint, Icon: History },
  unread: { label: "Couldn't read", accent: (t) => t.warn, Icon: FileQuestion },
};

function StatusChip({ status, t }: { status: Status; t: Theme }) {
  const { label, accent, Icon } = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: accent(t) }}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ─── Component icons — blueprint die-line canon from the package builder ────
// Solid strokes are edges; dashed strokes are folds, holes, and hidden parts.
// (Same drawings as BlueprintIcon in the catalog builder — one icon language.)
type IconKind = 'jacket' | 'sleeve' | 'labels' | 'booklet';

function ComponentIcon({ kind, color, fill, size = 44 }: { kind: IconKind; color: string; fill: string; size?: number }) {
  const s: React.SVGProps<SVGSVGElement> = {
    width: size, height: size, viewBox: '0 0 26 26', fill: 'none',
    stroke: color, strokeWidth: 0.9, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (kind) {
    case 'jacket': // square jacket, record peeking out the right
      return (
        <svg {...s} aria-hidden>
          <circle cx="17.5" cy="13" r="6.5" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="17.5" cy="13" r="1.4" strokeDasharray="1.2 1.6" opacity={0.7} />
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill={fill} />
        </svg>
      );
    case 'labels': // center label — dashed record as context, solid label as the piece
      return (
        <svg {...s} aria-hidden>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill={fill} />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case 'sleeve': // inner sleeve — square sleeve half-hidden behind the dashed jacket
      return (
        <svg {...s} aria-hidden>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill={fill} />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill={fill} />
        </svg>
      );
    case 'booklet': // folded booklet — dashed center fold, text lines
      return (
        <svg {...s} aria-hidden>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill={fill} />
          <path d="M13 4.5v17" strokeDasharray="2 2.2" opacity={0.7} />
          <path d="M7 9.5h3.5M7 12.5h3.5M7 15.5h2.5M15.5 9.5h3.5M15.5 12.5h3.5" opacity={0.7} />
        </svg>
      );
  }
}

// Per-tile ••• overflow — appears on hover in the tile's top-right corner.
// Archive lives here (with a confirm); archived tiles get Restore instead.
function TileOverflow({ tileKey, title, archived, t, menuFor, setMenuFor, onArchive, onRestore }: {
  tileKey: string; title: string; archived: boolean; t: Theme;
  menuFor: string | null; setMenuFor: (k: string | null) => void;
  onArchive: () => void; onRestore: () => void;
}) {
  const open = menuFor === tileKey;
  return (
    <div className="absolute top-2.5 right-2.5 z-10">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuFor(open ? null : tileKey); }}
        className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-opacity', open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100', t.hoverWash)}
        style={{ color: t.subink }}
        aria-label={`More options for ${title}`}
        aria-expanded={open}
        data-testid={`button-tile-overflow-${tileKey}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} aria-hidden />
          <div
            className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden py-1 shadow-xl"
            style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 190 }}
            role="menu"
            data-testid={`menu-tile-overflow-${tileKey}`}
          >
            {archived ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRestore(); }}
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)}
                style={{ color: t.ink }}
                role="menuitem"
                data-testid={`menuitem-restore-${tileKey}`}
              >
                <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                Restore template
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuFor(null); onArchive(); }}
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)}
                style={{ color: t.ink }}
                role="menuitem"
                data-testid={`menuitem-archive-${tileKey}`}
              >
                <Archive className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                Archive template…
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const MOCK_TEMPLATES: Array<{
  icon: IconKind; title: string;
  component: string; variant: string; code: string; rev: string;
  certified?: string; status: Status; note?: string; history?: Array<{ rev: string; note: string }>;
}> = [
  {
    icon: 'labels', title: 'Center labels',
    component: '12" LP center label', variant: '2LP · 100mm trim', code: '12-LBL100M-2', rev: 'R-091125',
    certified: 'Certified Sep 14, 2026', status: 'certified',
    history: [{ rev: 'R-072326', note: 'Superseded Sep 14, 2026 — 2 jobs in flight were flagged for review' }],
  },
];

// Known-needed slots per vinyl size — straight from MRP's template catalog.
const SLOT_SETS: Record<string, Array<{ kind: IconKind; title: string; note: string }>> = {
  '7″': [
    { kind: 'labels', title: 'Center labels', note: 'Small or large hole' },
    { kind: 'jacket', title: 'Single jacket — no spine', note: 'Outer sleeve' },
    { kind: 'jacket', title: 'Single jacket — 3 mm spine', note: 'Outer sleeve' },
    { kind: 'jacket', title: 'Gatefold jacket', note: 'Opens flat' },
    { kind: 'sleeve', title: 'Inner sleeve', note: 'Paper or board' },
    { kind: 'labels', title: 'Flexi disc label', note: '7″ only' },
  ],
  '10″': [
    { kind: 'labels', title: 'Center labels', note: '' },
    { kind: 'jacket', title: 'Single jacket', note: 'Outer sleeve — no spine' },
    { kind: 'jacket', title: 'Widespine jacket', note: 'Outer sleeve — wide spine' },
    { kind: 'jacket', title: 'Gatefold jacket', note: 'Opens flat' },
    { kind: 'sleeve', title: 'Inner sleeve', note: 'Paper or board' },
    { kind: 'booklet', title: 'Insert', note: '10 × 10 in · 2 pages' },
    { kind: 'booklet', title: 'Gatefold insert', note: '20 × 10 in · 4 pages — folds to 10 × 10' },
  ],
  '12″': [
    { kind: 'jacket', title: 'Single jacket', note: 'Outer sleeve — no spine' },
    { kind: 'jacket', title: 'Widespine jacket', note: 'Outer sleeve — wide spine' },
    { kind: 'jacket', title: 'Gatefold jacket', note: 'Outer sleeve — opens flat' },
    { kind: 'sleeve', title: 'Inner sleeve', note: 'Paper' },
    { kind: 'booklet', title: 'Insert', note: '12 × 12 in · 2 pages' },
  ],
};

// Known-needed slots for the coming formats — placeholders from the standard
// packaging parts, so each library reads as "here's what belongs" from day one.
const FORMAT_SLOTS: Record<string, Array<{ kind: IconKind; title: string; note: string }>> = {
  CD: [
    { kind: 'labels', title: 'Disc face', note: 'On-body print' },
    { kind: 'booklet', title: 'Booklet', note: 'Front of the jewel case' },
    { kind: 'sleeve', title: 'Tray card', note: 'Back inlay — spines included' },
    { kind: 'jacket', title: 'Card wallet', note: 'Sleeve alternative to the jewel case' },
  ],
  Cassette: [
    { kind: 'booklet', title: 'J-card', note: 'Folds into the Norelco case' },
    { kind: 'jacket', title: 'O-card', note: 'Wraps around the case' },
    { kind: 'labels', title: 'Shell print', note: 'On-body' },
    { kind: 'labels', title: 'Shell labels', note: 'Stick-on — A & B sides' },
  ],
  // Confirmed against MRP's real sticker catalog (Aug 2026) — sizes are
  // variants within each type, the way trim sizes work for center labels.
  Stickers: [
    { kind: 'labels', title: 'Rectangle sticker', note: '5 sizes · 1.5 × 1 to 2.5 × 1 in' },
    { kind: 'labels', title: 'Square sticker', note: '7 sizes · 1 × 1 to 4 × 4 in' },
    { kind: 'labels', title: 'Circle sticker', note: '7 sizes · 1 to 4 in' },
    { kind: 'labels', title: 'UPC sticker', note: '1.75 × 0.75 in' },
  ],
};

export default function PressTemplatesIndex() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [format, setFormat] = useState<'Vinyl' | 'CD' | 'Cassette' | 'Stickers'>('Vinyl');
  const [size, setSize] = useState<'7″' | '10″' | '12″'>('12″');
  // Upload sheet — the template flow starts here now (Bill, Aug 14 2026):
  // pick the PDF in a sheet over this page, then land on the live test with it.
  const [uploadOpen, setUploadOpen] = useState(false);
  // Header upload = a template with no slot below: ask for a name + component.
  // Slot/tile uploads already know what they are (Bill, Aug 14 2026).
  const [uploadSlot, setUploadSlot] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadComponent, setUploadComponent] = useState<string | null>(null);
  const openUpload = (slot: string | null) => { setUploadSlot(slot); setUploadName(''); setUploadComponent(null); setUploadOpen(true); };
  // Just-saved tile gets a one-time hairline pulse — blue, then back to gray (Bill, Aug 14 2026)
  const [flashFresh, setFlashFresh] = useState(() => savedLiveTemplates.some((s) => s.fresh));
  useEffect(() => {
    if (!flashFresh) return;
    const t1 = setTimeout(() => setFlashFresh(false), 900);
    const t2 = setTimeout(() => { savedLiveTemplates.forEach((s) => { s.fresh = false; }); }, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // No detail popup (Bill, Aug 15 2026): clicking a template opens it live —
  // the same view as before it was saved. Replace and re-test live there.
  // Archive moved to a per-tile ••• with a confirm; a view pill filters
  // All / Current / Archived. Archived is history, never deletion.
  const [view, setView] = useState<'All' | 'Current' | 'Archived'>('Current');
  const [archivedCodes, setArchivedCodes] = useState<Set<string>>(new Set());
  const [archivedSaved, setArchivedSaved] = useState<Set<number>>(new Set());
  // Standard slots a press doesn't offer can be archived too (Bill, Aug 15 2026)
  // — same per-press dismissal we use for GoodTunes standards elsewhere.
  const [archivedSlots, setArchivedSlots] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<{ key: string; title: string } | null>(null);
  const doArchive = (key: string) => {
    if (key.startsWith('saved:')) setArchivedSaved((s) => new Set(s).add(Number(key.slice(6))));
    else if (key.startsWith('slot:')) setArchivedSlots((s) => new Set(s).add(key.slice(5)));
    else setArchivedCodes((s) => new Set(s).add(key));
    setConfirmArchive(null);
  };
  const doRestore = (key: string) => {
    if (key.startsWith('saved:')) setArchivedSaved((s) => { const n = new Set(s); n.delete(Number(key.slice(6))); return n; });
    else if (key.startsWith('slot:')) setArchivedSlots((s) => { const n = new Set(s); n.delete(key.slice(5)); return n; });
    else setArchivedCodes((s) => { const n = new Set(s); n.delete(key); return n; });
    setMenuFor(null);
  };
  // Open the certified mock template live — fetch the real PDF asset, hand it
  // to the live test page the same way a fresh upload would arrive.
  const openMockLive = async (name: string) => {
    const blob = await fetch(labelTemplatePdfUrl).then((r) => r.blob());
    pendingTemplateFile.file = new File([blob], '12-LBL100M-2 — R-091125.pdf', { type: 'application/pdf' });
    pendingTemplateFile.name = name;
    window.location.hash = '#/PressTemplateLiveTest';
  };
  const uploadInput = useRef<HTMLInputElement>(null);
  const onPickTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    pendingTemplateFile.file = f;
    pendingTemplateFile.name = uploadName.trim() || uploadSlot || null;
    window.location.hash = '#/PressTemplateLiveTest';
  };
  return (
    <PressShell active="Templates" t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[12px] font-medium" style={{ color: t.faint }}>Catalog · Templates</div>
            <h1 className="mt-1" style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Templates. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Your standards, set.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 620 }}>
              Every file a client uploads is measured against the live canon below — your numbers, read straight
              from your template PDFs. One certified revision is live per component.
            </p>
          </div>
        </div>

        {/* Controls row — format family on the left; views · sizes · Create New
            on the right. The "Vinyl · Templates" caption is gone (Bill, Aug 15 2026):
            the format chip says it. */}
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="inline-flex items-center rounded-full flex-shrink-0" style={{ padding: 3, backgroundColor: t.cardSoft }} role="tablist" aria-label="Template format" data-testid="tabs-template-format">
            {(['Vinyl', 'CD', 'Cassette', 'Stickers'] as const).map((label) => {
              const on = format === label;
              return (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFormat(label)}
                  className="rounded-full transition-colors"
                  style={{
                    padding: '6px 18px', fontSize: 13.5,
                    fontWeight: on ? 600 : 500,
                    color: on ? t.ink : t.faint,
                    backgroundColor: on ? t.pillActive : 'transparent',
                    boxShadow: on ? t.segShadow : 'none',
                    cursor: 'pointer',
                  }}
                  data-testid={`tab-format-${label.toLowerCase()}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            {/* View pill — All / Current / Archived. Archive is history, not deletion. */}
            {(['All', 'Current', 'Archived'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="h-7 px-3 rounded-full text-[12px] font-semibold transition-colors"
                style={v === view ? { backgroundColor: t.pillActive, color: t.ink, boxShadow: t.segShadow } : { color: t.faint, cursor: 'pointer' }}
                data-testid={`filter-view-${v.toLowerCase()}`}
              >
                {v}
              </button>
            ))}
            <span className="mx-1.5 self-stretch w-px" style={{ backgroundColor: t.hairline }} aria-hidden />
            {format === 'Vinyl' && (['7″', '10″', '12″'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setSize(sz)}
                className="h-7 px-3 rounded-full text-[12px] font-semibold tabular-nums transition-colors"
                style={sz === size ? { backgroundColor: t.pillActive, color: t.ink, boxShadow: t.segShadow } : { color: t.faint, cursor: 'pointer' }}
                data-testid={`filter-size-${sz.replace('″', '')}`}
              >
                {sz}
              </button>
            ))}
            {/* Overflow menu hidden for now — "Duplicate a template" (reuse a file for
                another size) is parked for a future pass per Bill, Aug 12 2026. */}
            <span className="mx-1.5 self-stretch w-px" style={{ backgroundColor: t.hairline }} aria-hidden />
            {/* "Create New" — quiet ghost pill, same weight as the filter pills
                beside it; it's the escape hatch, not the main road (Bill, Aug 15 2026) */}
            <button
              type="button"
              onClick={() => openUpload(null)}
              className={cn('inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-semibold flex-shrink-0 transition-colors', t.hoverWash)}
              style={{ color: t.subink }}
              data-testid="button-upload-template"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New
            </button>
          </div>
        </div>

        {/* Template tiles — Print-prep style containers (per Andrew, Aug 12 2026):
            press picks the component (jacket / inner sleeve / center labels / booklet),
            names it, the icon appears; each template lives in one of these tiles. */}
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {/* Demo shelf — templates saved from the live test this session; tap to reopen live (Bill, Aug 14 2026) */}
          {format === 'Vinyl' && size === '12″' && savedLiveTemplates.map((sv, i) => {
            const key = `saved:${i}`;
            const isArchived = archivedSaved.has(i);
            if ((view === 'Current' && isArchived) || (view === 'Archived' && !isArchived)) return null;
            return (
            <div key={`saved-${i}`} className="relative group" style={{ opacity: isArchived ? 0.7 : 1 }}>
            <button
              type="button"
              onClick={() => { pendingTemplateFile.file = sv.file; window.location.hash = '#/PressTemplateLiveTest'; }}
              className={cn('gt-tile w-full h-full rounded-2xl px-6 pt-7 pb-5 flex flex-col items-center text-center transition-colors cursor-pointer', t.tileHover)}
              style={{
                backgroundColor: t.card,
                border: `1px solid ${sv.fresh && flashFresh ? '#319ED8' : t.hairline}`,
                boxShadow: sv.fresh && flashFresh ? '0 0 0 1px #319ED8' : 'none',
                transition: 'border-color 700ms ease, box-shadow 700ms ease',
              }}
              data-testid={`tile-saved-template-${i}`}
            >
              <span className="rounded-full overflow-hidden block" style={{ width: 104, height: 104, backgroundColor: '#fff', border: `1px solid ${t.hairline}` }}>
                <img src={sv.img} alt={`${sv.name} — saved from the live test`} className="w-full h-full object-cover" />
              </span>
              <div className="mt-4 text-[15px] font-semibold truncate w-full" style={{ color: t.ink, letterSpacing: '-0.01em' }} title={sv.name}>{sv.name}</div>
              <div className="gt-detail mt-1 text-[12.5px] tabular-nums" style={{ color: t.subink }}>{sv.wMm.toFixed(1)} × {sv.hMm.toFixed(1)} mm · {sv.layerCount} GT layers</div>
              <div className="mt-3 flex items-center gap-2 text-[11.5px]" style={{ color: t.faint }}>
                {isArchived ? (
                  <><Archive className="w-3.5 h-3.5 flex-shrink-0" /><span style={{ fontWeight: 600 }}>Archived</span></>
                ) : (
                  <><BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.ready }} /><span style={{ color: t.ready, fontWeight: 600 }}>Saved</span></>
                )}
                <span>{sv.savedAt}</span>
                {sv.tests.length > 0 && <span>· {sv.tests.length} art file{sv.tests.length === 1 ? '' : 's'} tested</span>}
              </div>
            </button>
            <TileOverflow tileKey={key} title={sv.name} archived={isArchived} t={t} menuFor={menuFor} setMenuFor={setMenuFor} onArchive={() => setConfirmArchive({ key, title: sv.name })} onRestore={() => doRestore(key)} />
            </div>
            );
          })}
          {format === 'Vinyl' && size === '12″' && MOCK_TEMPLATES.map((tpl) => {
            const isArchived = archivedCodes.has(tpl.code);
            if ((view === 'Current' && isArchived) || (view === 'Archived' && !isArchived)) return null;
            return (
            <div key={tpl.code + tpl.rev} className="relative group" style={{ opacity: isArchived ? 0.7 : 1 }}>
            <button type="button" onClick={() => { void openMockLive(tpl.title); }} className={cn('gt-tile w-full h-full rounded-2xl px-6 pt-7 pb-5 flex flex-col items-center text-center transition-colors cursor-pointer', t.tileHover)} style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid={`tile-template-${tpl.code}`}>
              {/* GT PREVIEW crop — the template shows itself; the component icon sits as a small badge */}
              <div className="relative">
                <span className="rounded-full overflow-hidden block" style={{ width: 104, height: 104, backgroundColor: '#fff', border: `1px solid ${t.hairline}` }}>
                  <img src={gtPreviewTemplate} alt={`${tpl.title} — preview from the GT PREVIEW layer`} className="w-full h-full object-cover" data-testid={`img-tile-preview-${tpl.code}`} />
                </span>
                <span className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center" style={{ width: 30, height: 30, backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
                  <ComponentIcon kind={tpl.icon} color={t.blue} fill={t.iconFill} size={18} />
                </span>
              </div>
              <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{tpl.title}</div>
              <div className="gt-detail mt-1 text-[12.5px]" style={{ color: t.subink }}>{tpl.component} · {tpl.variant}</div>
              <div className="gt-detail mt-0.5 text-[12.5px] tabular-nums" style={{ color: t.subink }}>{tpl.code} <span style={{ color: t.faint }}>·</span> {tpl.rev}</div>
              <div className="mt-3 flex items-center gap-2">
                {isArchived ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: t.faint }}>
                    <Archive className="w-3.5 h-3.5" />
                    Archived
                  </span>
                ) : (
                  <StatusChip status={tpl.status} t={t} />
                )}
                {tpl.certified && <span className="text-[11.5px]" style={{ color: t.faint }}>{tpl.certified.replace('Certified ', '')}</span>}
              </div>
              {tpl.history?.map((h) => (
                <div key={h.rev} className="gt-detail mt-2 flex items-center justify-center gap-1.5 text-[11.5px]" style={{ color: t.faint }}>
                  <History className="w-3 h-3 flex-shrink-0" />
                  <span className="tabular-nums">{h.rev}</span>
                  <span>superseded · in history</span>
                </div>
              ))}
            </button>
            <TileOverflow tileKey={tpl.code} title={tpl.title} archived={isArchived} t={t} menuFor={menuFor} setMenuFor={setMenuFor} onArchive={() => setConfirmArchive({ key: tpl.code, title: tpl.title })} onRestore={() => doRestore(tpl.code)} />
            </div>
            );
          })}

          {/* Known-needed slots — every vinyl format needs these; empty ones sit
              as dashed placeholders until the press fills them. Hover = solid
              blue border, no button — clicking just opens (Bill, Aug 15 2026).
              Slots a press doesn't offer archive from the •••, like templates. */}
          <style>{`.gt-slot:hover { border-color: #319ED8 !important; border-style: solid !important; }
.gt-tile:hover { border-color: #319ED8 !important; }
/* Fine print rests hidden; hover reveals it. Space stays reserved so the grid never jumps (Bill, Aug 15 2026). */
.gt-tile .gt-detail { opacity: 0; transition: opacity 150ms ease; }
.gt-tile:hover .gt-detail, .gt-tile:focus-visible .gt-detail { opacity: 1; }`}</style>
          {(format === 'Vinyl' ? SLOT_SETS[size] : FORMAT_SLOTS[format]).map(({ kind, title, note }) => {
            const key = `slot:${title}`;
            const isArchived = archivedSlots.has(title);
            if ((view === 'Archived' && !isArchived) || (view !== 'Archived' && isArchived && view === 'Current')) return null;
            return (
            <div key={title} className="relative group" style={{ opacity: isArchived ? 0.7 : 1 }}>
            <button
              type="button"
              onClick={() => { if (!isArchived) openUpload(title); }}
              className={cn('w-full h-full rounded-2xl px-6 py-9 flex flex-col items-center justify-center text-center', !isArchived && 'gt-slot cursor-pointer')}
              style={{ border: `1.5px dashed ${t.dashedBorder}`, transition: 'border-color 150ms ease' }}
              data-testid={`tile-empty-${title.toLowerCase().replace(/ /g, '-')}`}
            >
              <div className="flex flex-col items-center">
                <ComponentIcon kind={kind} color={t.faint} fill={t.iconFill} />
                <div className="mt-4 text-[15px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{title}</div>
                <div className="mt-1 text-[12.5px]" style={{ color: t.faint }}>{note || 'Needed for vinyl packages'}</div>
                {isArchived && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: t.faint }}>
                    <Archive className="w-3.5 h-3.5" />
                    Archived — not offered
                  </div>
                )}
              </div>
            </button>
            <TileOverflow tileKey={key} title={title} archived={isArchived} t={t} menuFor={menuFor} setMenuFor={setMenuFor} onArchive={() => setConfirmArchive({ key, title })} onRestore={() => doRestore(key)} />
            </div>
            );
          })}
        </div>

        {/* Archived view, nothing archived yet — say so plainly. */}
        {view === 'Archived' && archivedCodes.size === 0 && archivedSaved.size === 0 && archivedSlots.size === 0 && (
          <div className="mt-10 flex flex-col items-center text-center" data-testid="text-archived-empty">
            <Archive className="w-5 h-5" style={{ color: t.faint }} />
            <div className="mt-2.5 text-[13.5px] font-medium" style={{ color: t.subink }}>Nothing archived.</div>
            <div className="mt-1 text-[12.5px]" style={{ color: t.faint, maxWidth: 380 }}>
              Templates you retire land here — nothing is ever deleted.
            </div>
          </div>
        )}

      </div>

      {/* Archive confirm — the only dialog left on this page. X closes, per canon. */}
      {confirmArchive && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setConfirmArchive(null)}
          data-testid="sheet-archive-confirm-backdrop"
        >
          <div
            className="relative rounded-2xl overflow-hidden shadow-2xl w-full text-center px-8 py-9"
            style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Archive ${confirmArchive.title}?`}
            data-testid="sheet-archive-confirm"
          >
            <button
              type="button"
              onClick={() => setConfirmArchive(null)}
              className={cn('absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
              style={{ color: t.subink }}
              aria-label="Close"
              data-testid="button-close-archive-confirm"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
              <Archive className="w-5 h-5" style={{ color: t.subink }} />
            </div>
            <div className="mt-4 text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
              Archive &ldquo;{confirmArchive.title}&rdquo;?
            </div>
            <p className="mt-1.5 text-[13px] mx-auto" style={{ color: t.subink, maxWidth: 340 }}>
              It leaves the live shelf and stops measuring client files. It moves to Archived —
              nothing is ever deleted, and you can restore it any time.
            </p>
            {/* Canon (Bill, Aug 15 2026): confirming action is always rightmost; Cancel is quiet text to its left. */}
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmArchive(null)}
                className={cn('h-9 px-4 rounded-full text-[13px] font-medium transition-colors', t.hoverWash)}
                style={{ color: t.subink }}
                data-testid="button-cancel-archive"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => doArchive(confirmArchive.key)}
                className="h-9 px-5 rounded-full text-[13px] font-semibold text-white"
                style={{ backgroundColor: t.blue }}
                data-testid="button-confirm-archive"
              >
                Archive template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload sheet — Apple-style: dimmed page, one decision (Bill, Aug 14 2026) */}
      {uploadOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setUploadOpen(false)}
          data-testid="sheet-upload-backdrop"
        >
          <div
            className="rounded-2xl overflow-hidden shadow-2xl w-full text-center px-8 py-9"
            style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Upload your template"
            data-testid="sheet-upload-template"
          >
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className={cn('absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
              style={{ color: t.subink }}
              aria-label="Close"
              data-testid="button-close-upload"
            >
              <X className="w-4 h-4" />
            </button>
            <div
              className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}
            >
              <Upload className="w-5 h-5" style={{ color: t.subink }} />
            </div>
            <div className="mt-4 text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>Upload your template</div>
            {/* One line, Apple-quiet; the detail lives behind the i (Bill, Aug 15 2026) */}
            <p className="mt-1.5 text-[13px] mx-auto inline-flex items-center gap-1.5" style={{ color: t.subink }}>
              Your Illustrator PDF, GT layers included.
              <span
                className="inline-flex items-center justify-center cursor-help"
                title={'Layers named "GT CUT LINE", "GT BLEED AREA", and so on are read by name, exactly where you drew them.'}
                aria-label="About GT layers"
                data-testid="info-gt-layers"
              >
                <Info className="w-3.5 h-3.5" style={{ color: t.faint }} />
              </span>
            </p>
            {uploadSlot ? (
              <div className="mt-4 text-[12.5px] font-semibold" style={{ color: t.subink }} data-testid="text-upload-for">
                For: <span style={{ color: t.ink }}>{uploadSlot}</span>
              </div>
            ) : (
              <div className="mt-5 text-left mx-auto" style={{ maxWidth: 360 }}>
                <label className="block text-[11px] font-semibold" style={{ color: t.subink }}>
                  Name
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="Single jacket — Special"
                    className="block w-full mt-1.5 h-9 px-3 rounded-lg text-[13px] font-medium outline-none"
                    style={{ backgroundColor: t.cardSoft, color: t.ink, border: `1px solid ${t.hairline}` }}
                    data-testid="input-template-name"
                  />
                </label>
                <div className="mt-3 text-[11px] font-semibold" style={{ color: t.subink }}>Component</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['Jacket', 'Sleeve', 'Labels', 'Booklet', 'Other'].map((c) => {
                    const on = uploadComponent === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setUploadComponent(on ? null : c)}
                        className="h-7 px-3 rounded-full text-[12px] font-semibold transition-colors"
                        style={{
                          border: `1px solid ${on ? t.subink : t.hairline}`,
                          color: on ? t.ink : t.faint,
                          backgroundColor: on ? t.cardSoft : 'transparent',
                        }}
                        data-testid={`pill-component-${c.toLowerCase()}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px]" style={{ color: t.faint }}>
                  Both optional — name it later from the test page, associate the component any time.
                </div>
              </div>
            )}
            {/* Canon (Bill, Aug 15 2026): confirming action is always rightmost; Cancel is quiet text to its left. */}
            <div className="mt-6 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className={cn('h-9 px-4 rounded-full text-[13px] font-medium transition-colors', t.hoverWash)}
                style={{ color: t.subink }}
                data-testid="button-cancel-upload"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => uploadInput.current?.click()}
                className="h-9 px-5 rounded-full text-[13px] font-semibold text-white"
                style={{ backgroundColor: t.blue }}
                data-testid="button-choose-pdf"
              >
                Choose PDF
              </button>
            </div>
          </div>
        </div>
      )}
      <input ref={uploadInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickTemplate} data-testid="input-upload-template" />

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
    </PressShell>
  );
}
