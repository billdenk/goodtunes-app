// ArtistAssetsTaskFirstVariant — R&D skin / IA test of the shared Artist/Admin
// release Assets page.
//
// HYPOTHESIS (task-first nested tabs): users first choose *what kind* of asset
// they are working on — Art or Audio — then *which deliverable* it belongs to.
// This replaces the current product-first hierarchy (Vinyl / GoodTunes Player /
// GoodDeed chips with a far-right Art/Audio segmented control that is easy to
// miss).
//
// ZERO FUNCTIONALITY CHANGES. This file DOES NOT mutate any Canon component. The
// asset panels (Vinyl art / audio, Player art / audio, GoodDeed) are extracted
// verbatim from ArtistDashboardAccountStack.tsx so the content and interactions
// are identical; only the surrounding control hierarchy is re-arranged. Shared
// interactive pieces (Otis tracks, prepress template review, artwork dialog,
// component icons) are imported from their real source modules.
//
// Applicability matrix is exact:
//   Art   → Vinyl, GoodTunes® Player, GoodDeed®
//   Audio → Vinyl, GoodTunes® Player      (GoodDeed® never appears under Audio)
//
// Renders directly into the Assets › CALIFORNIALAND context in dark (charcoal)
// mode so the navigation experiment is immediately visible.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ComponentIcon, type IconKind } from './PressTemplatesIndex';
import { ArtistTemplateTest } from './ArtistTemplateTest';
import { Interactive as OtisTracksInteractive } from './OtisTracksInteractive';
import { RoleHeader, RoleShell } from '@workspace/goodtunes-design-system/components/role-chrome';
import { RoleRail } from '@workspace/goodtunes-design-system/components/role-rail';
import type { CanonRoleNavigation } from '@workspace/goodtunes-design-system/components/role-nav';
import {
  BarChart3,
  AlertTriangle,
  ChevronDown,
  Check,
  CheckCircle2,
  Circle,
  Cog,
  Disc3,
  Download,
  Eye,
  FileAudio,
  FileText,
  Film,
  Image,
  ImagePlus,
  Info,
  GripVertical,
  LayoutDashboard,
  Link2,
  Megaphone,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Undo2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  AppleCard,
  AppleDialogShell,
  AppleHeading,
  AppleQuietAction,
  AppleStatus,
  Dialog,
} from '@workspace/goodtunes-design-system/components/ui/apple';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/goodtunes-design-system/components/ui/dropdown-menu';
import { Input } from '@workspace/goodtunes-design-system/components/ui/input';
import californialandCover from '../assets/californialand-cover.jpg';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import { GoodDeedAssetPanel as CanonGoodDeedAssetPanel } from './ArtistDashboardAccountStack';

// ─── Utility (identical to Canon) ─────────────────────────────────────────
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Theme system (charcoal dark — matches Canon exactly, NEVER navy) ─────
type Theme = {
  blue: string; ink: string; subink: string; faint: string; hairline: string;
  canvas: string; rail: string; card: string; cardSoft: string;
  pillShadow: string; headerBg: string; searchPlaceholder: string;
  avatarRing: string; hoverWash: string; ready: string; critical: string;
  overlay: string; selectWash: string; popShadow: string; logoFilter?: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8', ink: '#1d1d1f', subink: '#6e6e73', faint: '#a1a1a6',
    hairline: '#e6e6ea', canvas: '#f5f5f7', rail: '#fbfbfd', card: '#ffffff',
    cardSoft: '#f0f0f2',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(251,251,253,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10', hoverWash: 'hover:bg-black/5',
    ready: '#1c8a5b', critical: '#e0245e',
    overlay: 'rgba(0,0,0,0.28)', selectWash: '#f0f7fc',
    popShadow: '0 20px 48px rgba(0,0,0,0.18)', logoFilter: undefined,
  },
  dark: {
    blue: '#319ED8', ink: '#f5f5f7', subink: '#98989d', faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)', canvas: '#161617', rail: '#1c1c1e',
    card: '#1e1e20', cardSoft: '#26262a',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15', hoverWash: 'hover:bg-white/5',
    ready: '#34c98e', critical: '#ff5c8a',
    overlay: 'rgba(0,0,0,0.55)', selectWash: 'rgba(49,158,216,0.14)',
    popShadow: '0 20px 48px rgba(0,0,0,0.55)', logoFilter: 'invert(1) brightness(1.8)',
  },
};

function inputStyle(t: Theme): React.CSSProperties {
  return { backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, color: t.ink };
}

// ─── Release model (subset of Canon AdminRelease, same shape) ─────────────
type ReleaseFormatId = 'single_lp' | 'cd' | 'cassette';
type AdminRelease = {
  id: string;
  title: string;
  format: ReleaseFormatId;
  status: 'Prepping' | 'At press' | 'Released';
  cover?: string;
};

const CALIFORNIALAND: AdminRelease = {
  id: 'california-land',
  title: 'CALIFORNIALAND',
  format: 'single_lp',
  status: 'At press',
  cover: californialandCover,
};

type VinylSide = 'A' | 'B';
type VinylTrack = { id: string; title: string; duration: number; digital: number; file: string };
type VinylLayout = Record<VinylSide, string[]>;

const VINYL_TRACKS: VinylTrack[] = [
  { id: 't1', title: 'Welcome to Californialand', duration: 250, digital: 1, file: '01_Welcome_to_Californialand_24-96.wav' },
  { id: 't2', title: 'Palm Trees', duration: 238, digital: 2, file: '02_Palm_Trees_24-96.wav' },
  { id: 't3', title: 'Golden State', duration: 286, digital: 3, file: '03_Golden_State_24-96.wav' },
  { id: 't4', title: 'Pacific Standard Time', duration: 302, digital: 4, file: '04_Pacific_Standard_Time_24-96.wav' },
  { id: 't5', title: 'Malibu', duration: 218, digital: 5, file: '05_Malibu_24-96.wav' },
  { id: 't6', title: 'Californialand', duration: 126, digital: 6, file: '06_Californialand_24-96.wav' },
  { id: 't7', title: 'Heatwave', duration: 245, digital: 7, file: '07_Heatwave_24-96.wav' },
  { id: 't8', title: 'The Valley', duration: 262, digital: 8, file: '08_The_Valley_24-96.wav' },
  { id: 't9', title: 'After the Fire', duration: 276, digital: 9, file: '09_After_the_Fire_24-96.wav' },
  { id: 't10', title: 'Sunset / Western', duration: 292, digital: 10, file: '10_Sunset_Western_24-96.wav' },
  { id: 't11', title: 'Desert Flowers', duration: 230, digital: 11, file: '11_Desert_Flowers_24-96.wav' },
  { id: 't12', title: 'Home Again', duration: 254, digital: 12, file: '12_Home_Again_24-96.wav' },
];
const VINYL_ORIGINAL: VinylLayout = {
  A: ['t1', 't2', 't3', 't4', 't5', 't6'],
  B: ['t7', 't8', 't9', 't10', 't11', 't12'],
};
const PRESS_CUT_OPTIONS = {
  '33⅓': { maxSeconds: 22 * 60, recommendedGap: 2, artistMayAdjustGap: true },
  '45': { maxSeconds: 16 * 60, recommendedGap: 2, artistMayAdjustGap: true },
} as const;

function formatVinylTime(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function cloneVinylLayout(layout: VinylLayout): VinylLayout {
  return { A: [...layout.A], B: [...layout.B] };
}

function equalVinylLayouts(a: VinylLayout, b: VinylLayout) {
  return a.A.join('|') === b.A.join('|') && a.B.join('|') === b.B.join('|');
}

function vinylDownload(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Exact Otis Physical Audio workspace, embedded without its shell or route tabs.
export function VinylAudioPanel() {
  const [sourceView, setSourceView] = useState<'tracks' | 'sides'>('tracks');
  const [rpm, setRpm] = useState<'33⅓' | '45'>('33⅓');
  const [gapSeconds, setGapSeconds] = useState(2);
  const [draftRpm, setDraftRpm] = useState<'33⅓' | '45'>('33⅓');
  const [draftGapSeconds, setDraftGapSeconds] = useState(2);
  const [extractionConfirmed, setExtractionConfirmed] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [history, setHistory] = useState<VinylLayout[]>([cloneVinylLayout(VINYL_ORIGINAL)]);
  const [cursor, setCursor] = useState(0);
  const layout = history[cursor];
  const [readOnly, setReadOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<Record<VinylSide, string>>({ A: 'CALIFORNIALAND-001-A', B: 'CALIFORNIALAND-001-B' });
  const [editing, setEditing] = useState<VinylSide | null>(null);
  const [catalogDraft, setCatalogDraft] = useState('');
  const [dialog, setDialog] = useState<'masters' | 'pq' | 'cut' | 'generate' | 'extract' | null>(null);
  const [preflight, setPreflight] = useState<'idle' | 'passed'>('idle');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [sideMasters, setSideMasters] = useState<Partial<Record<VinylSide, { name: string; duration: number }>>>({
    A: { name: 'CALIFORNIALAND_SIDE_A_MASTER.wav', duration: 1430 },
  });
  const [generatedSideMasters, setGeneratedSideMasters] = useState<Partial<Record<VinylSide, { name: string; duration: number }>>>({});
  const [removeSideMaster, setRemoveSideMaster] = useState<VinylSide | null>(null);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSide = useRef<VinylSide>('B');
  const byId = useMemo(() => new Map(VINYL_TRACKS.map((track) => [track.id, track])), []);
  const cutRule = PRESS_CUT_OPTIONS[rpm];
  const draftCutRule = PRESS_CUT_OPTIONS[draftRpm];
  const cutSettingsChanged = draftRpm !== rpm || draftGapSeconds !== gapSeconds;

  const openCutSettings = () => {
    setDraftRpm(rpm);
    setDraftGapSeconds(gapSeconds);
    setDialog('cut');
  };

  const effectiveSeconds = (side: VinylSide) =>
    layout[side].reduce((sum, id) => sum + (byId.get(id)?.duration ?? 0), 0) +
    gapSeconds * Math.max(0, layout[side].length - 1);

  const commit = (next: VinylLayout) => {
    if (readOnly || equalVinylLayouts(next, layout)) return;
    setHistory((current) => [...current.slice(0, cursor + 1), cloneVinylLayout(next)]);
    setCursor((current) => current + 1);
    setNotice('Saved to this local R&D session.');
  };

  const move = (id: string, toSide: VinylSide, beforeId?: string) => {
    const next = cloneVinylLayout(layout);
    for (const side of ['A', 'B'] as VinylSide[]) {
      const index = next[side].indexOf(id);
      if (index >= 0) next[side].splice(index, 1);
    }
    const target = beforeId ? next[toSide].indexOf(beforeId) : -1;
    next[toSide].splice(target >= 0 ? target : next[toSide].length, 0, id);
    commit(next);
  };

  const undo = () => {
    if (!readOnly && cursor > 0) {
      setCursor(cursor - 1);
      setNotice('Undid the last local change.');
    }
  };
  const redo = () => {
    if (!readOnly && cursor < history.length - 1) {
      setCursor(cursor + 1);
      setNotice('Redid the local change.');
    }
  };
  const reset = () => {
    setHistory([cloneVinylLayout(VINYL_ORIGINAL)]);
    setCursor(0);
    setResetConfirm(false);
    setNotice('Restored the source-backed fixture order.');
  };

  const overSide = (['A', 'B'] as VinylSide[]).find((side) => effectiveSeconds(side) > cutRule.maxSeconds);
  const suggestedTrack = overSide
    ? layout[overSide]
        .map((id) => byId.get(id)!)
        .filter(Boolean)
        .sort((a, b) => a.duration - b.duration)
        .find((track) => {
          const destination: VinylSide = overSide === 'A' ? 'B' : 'A';
          return effectiveSeconds(overSide) - track.duration - gapSeconds <= cutRule.maxSeconds &&
            effectiveSeconds(destination) + track.duration + gapSeconds <= cutRule.maxSeconds;
        })
    : undefined;

  const openCatalog = (side: VinylSide) => {
    if (readOnly) return;
    setCatalogDraft(catalogs[side]);
    setEditing(side);
  };
  const saveCatalog = (side: VinylSide) => {
    if (catalogDraft.trim()) setCatalogs((current) => ({ ...current, [side]: catalogDraft.trim() }));
    setEditing(null);
    setNotice('Catalog number saved to this local R&D session.');
  };
  const chooseSideMaster = (side: VinylSide) => {
    pendingSide.current = side;
    fileRef.current?.click();
  };

  const preflightChecks = [
    { label: 'Source audio', detail: sourceView === 'tracks' ? '12 individual WAV masters · 24-bit / 96 kHz' : 'Side files are local R&D fixtures; analysis is simulated', state: 'Passed', passed: true },
    { label: 'Extracted duration & gaps', detail: sourceView === 'sides' ? 'Side B contains an excessive 20-second inter-track gap' : `${gapSeconds}s press-recommended inter-track gap applied`, state: sourceView === 'sides' ? 'Duration/gap issue' : 'Passed', passed: sourceView !== 'sides' },
    { label: 'Confirmed boundaries & order', detail: extractionConfirmed ? 'Artist confirmed detected regions and sequence' : sourceView === 'sides' ? 'One unnamed region requires naming before confirmation' : 'Canonical Side A/B sequence confirmed', state: extractionConfirmed || sourceView === 'tracks' ? 'Passed' : 'Needs confirmation', passed: extractionConfirmed || sourceView === 'tracks' },
    { label: 'Center-label tracklist', detail: 'Side B omits “Home Again” in the supplied fixture', state: 'Missing', passed: false },
    { label: 'Jacket / inner-sleeve tracklist', detail: 'Printed jacket reverses tracks 9 and 10', state: 'Order mismatch', passed: false },
    { label: 'LyricFlow / printed lyrics', detail: 'LyricFlow is consistent; printed lyric insert has not been supplied', state: 'Missing', passed: false },
  ];
  const preflightPassed = preflightChecks.every((check) => check.passed);

  return <div className="mt-5" data-testid="vinyl-audio-panel">
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <div className="inline-flex h-10 rounded-full bg-muted p-1" role="tablist" aria-label="Audio source tools">
        {([['tracks', 'Individual tracks'], ['sides', 'Side masters']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={sourceView === id} onClick={() => setSourceView(id)} className={cn('h-8 min-w-32 rounded-full px-4 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', sourceView === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>{label}</button>)}
      </div>
    </div>

    <section data-testid="section-side-breaks">
      {(sourceView === 'tracks' || extractionConfirmed) && <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <AppleHeading variant="section">{sourceView === 'tracks' ? 'Side breaks' : 'Confirmed extracted sequence'}</AppleHeading>
          <button type="button" onClick={openCutSettings} className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open Cut settings. Current speed ${rpm} RPM.`}>{rpm} RPM</button>
          <button type="button" className="group relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="About side breaks">
            <Info className="size-4" />
            <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-80 rounded-2xl border border-border bg-popover p-4 text-left text-popover-foreground shadow-xl group-hover:block group-focus-visible:block">
              <span className="block text-[13px] font-semibold">Vinyl side rules</span>
              <span className="mt-3 grid gap-3">
                <span className="block"><strong className="block text-xs font-semibold">Sequence</strong><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">The confirmed Side A/B order is authoritative for vinyl production.</span></span>
                <span className="block"><strong className="block text-xs font-semibold">Playback</strong><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Digital playback keeps the release&apos;s original track order.</span></span>
                <span className="block"><strong className="block text-xs font-semibold">Capacity</strong><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{formatVinylTime(cutRule.maxSeconds)} maximum per side at {rpm} RPM.</span></span>
                <span className="block"><strong className="block text-xs font-semibold">Gaps</strong><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Runtimes include Music Record Pressing&apos;s {gapSeconds}-second inter-track recommendation.</span></span>
              </span>
            </span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {preflight === 'passed' && (
            <AppleStatus tone={preflightPassed ? 'ready' : 'warning'}><CheckCircle2 className="size-3.5" /> {preflightPassed ? 'Preflight passed' : `${preflightChecks.filter((check) => !check.passed).length} checks need attention`}</AppleStatus>
          )}
          <Button variant="outline" size="sm" className="h-9 rounded-full border-border bg-transparent px-3 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={openCutSettings}><SlidersHorizontal className="size-3.5" />Cut settings</Button>
          <Button variant="outline" size="sm" className="h-9 rounded-full border-border bg-transparent px-3 text-foreground hover:bg-muted" onClick={() => { setPreflight('passed'); setNotice('Local R&D preflight completed. Results are shown below and were not saved.'); }}><CheckCircle2 className="size-3.5 text-primary" />{preflight === 'passed' ? 'Run again' : 'Run preflight'}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-full border border-border/80 bg-muted/60 text-muted-foreground shadow-sm hover:bg-muted" aria-label="More side break actions"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="dark gt-admin-dark w-56 rounded-xl border-border bg-popover p-1.5 shadow-xl">
              <DropdownMenuItem className="rounded-lg px-2.5 py-2 text-[13px]" onSelect={() => setDialog('pq')}><FileText />PQ sheet</DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg px-2.5 py-2 text-[13px]" onSelect={() => vinylDownload('CALIFORNIALAND_masters_manifest.txt', VINYL_TRACKS.map((track) => track.file).join('\n'))}><Download />Download all masters</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                className="rounded-lg py-2 pl-8 pr-2.5 text-[13px]"
                checked={readOnly}
                onCheckedChange={(checked) => {
                  setReadOnly(checked === true);
                  setNotice(checked === true ? 'Local R&D read-only permissions preview activated.' : 'Local R&D read-only permissions preview deactivated.');
                }}
              >
                Preview read-only permissions
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {readOnly && <div className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        Local R&amp;D permission preview: You don&apos;t have edit access for this album&apos;s vinyl order — the sequence below is read-only.
      </div>}
      {preflight === 'passed' && <AppleCard className="mb-4 overflow-hidden" data-testid="section-preflight-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div><AppleHeading variant="section">Preflight results</AppleHeading><p className="mt-1 text-xs text-muted-foreground">Local R&amp;D evaluation only — it does not save or submit anything to the press.</p></div>
          <AppleStatus tone={preflightPassed ? 'ready' : 'warning'} wash>{preflightPassed ? 'Ready for review' : `${preflightChecks.filter((check) => !check.passed).length} items need attention`}</AppleStatus>
        </div>
        <ul>
          {preflightChecks.map((check) => <li key={check.label} className="flex items-start gap-3 border-t border-border px-4 py-3 first:border-t-0"><CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${check.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`} /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{check.label}</div><p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p></div><AppleStatus tone={check.passed ? 'ready' : 'warning'}>{check.state}</AppleStatus></li>)}
        </ul>
      </AppleCard>}

      <div className="space-y-4">
        {(['A', 'B'] as VinylSide[]).map((side) => {
          const total = effectiveSeconds(side);
          const over = total > cutRule.maxSeconds;
          return <AppleCard
            key={side}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-none"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dragId && move(dragId, side)}
            data-testid={`vinyl-side-${side}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
              <div>
                <div className="text-base font-semibold text-foreground">Side {side}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Disc 1</span>
                  <span aria-hidden="true" className="h-3 border-l border-border" />
                  {editing === side ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Catalog No.:</span>
                      <Input
                        autoFocus
                        value={catalogDraft}
                        onChange={(event) => setCatalogDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveCatalog(side);
                          if (event.key === 'Escape') setEditing(null);
                        }}
                        onBlur={() => saveCatalog(side)}
                        className="h-7 w-52 font-mono text-xs"
                      />
                    </div>
                  ) : (
                    readOnly
                      ? <div className="text-xs text-muted-foreground">Catalog No.: {catalogs[side]}</div>
                      : <button type="button" onClick={() => openCatalog(side)} className="inline-flex min-h-7 items-center rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Edit Side ${side} catalog number`}>
                          <span>Catalog No.: {catalogs[side]}</span>
                        </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right tabular-nums">
                <span className="text-[18px] font-semibold tracking-tight text-foreground">{formatVinylTime(total)}</span>
                <span className="text-xs text-muted-foreground">/ {formatVinylTime(cutRule.maxSeconds)} max · {rpm} RPM · {gapSeconds}s gaps</span>
                {over && <button type="button" onClick={openCutSettings} className="group relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-amber-400 transition-colors hover:bg-amber-500/10 focus-visible:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60" aria-label={`Side ${side} is ${formatVinylTime(total - cutRule.maxSeconds)} over the safe length. Open Cut settings.`}>
                  <AlertTriangle className="size-3.5" />
                  <span>{formatVinylTime(total - cutRule.maxSeconds)} over</span>
                  <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-72 rounded-xl border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-xl group-hover:block group-focus-visible:block">
                    {suggestedTrack
                      ? `Move “${suggestedTrack.title}” (${formatVinylTime(suggestedTrack.duration)}) to Side ${side === 'A' ? 'B' : 'A'}, or click to adjust Cut settings.`
                      : 'Click to adjust Cut settings, or move tracks in the sequence below until both sides fit.'}
                  </span>
                </button>}
              </div>
            </div>
            <ol>
              {layout[side].map((id, index) => {
                const track = byId.get(id)!;
                return <li
                  key={id}
                  draggable={!readOnly}
                  onDragStart={() => setDragId(id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.stopPropagation(); if (dragId && dragId !== id) move(dragId, side, id); }}
                  className={`flex select-none items-center gap-3 border-t border-border/70 px-5 py-3 first:border-t-0 ${readOnly ? 'cursor-default' : 'cursor-grab'} ${dragId === id ? 'opacity-40' : ''}`}
                >
                  <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
                  <span className="w-6 text-center text-[13px] tabular-nums text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1 truncate text-sm">
                    <span className="mr-1.5 text-[13px] font-medium tabular-nums text-muted-foreground" title="Digital album track number">#{track.digital}</span>
                    {track.title}
                  </div>
                  <span className="text-[13px] tabular-nums text-muted-foreground">{formatVinylTime(track.duration)}</span>
                  <AppleQuietAction className="size-8 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" icon={Download} aria-label={`Download ${track.title} master`} onClick={(event) => { event.stopPropagation(); vinylDownload(track.file, `R&D download manifest for ${track.file}`); }} />
                </li>;
              })}
            </ol>
          </AppleCard>;
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {resetConfirm ? (
          <div className="flex items-center gap-1 text-xs">
            <span>Revert to the saved vinyl order?</span>
            <AppleQuietAction tone="secondary" onClick={() => setResetConfirm(false)}>Cancel</AppleQuietAction>
            <Button size="sm" className="rounded-full" onClick={reset}>Reset</Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <AppleQuietAction icon={Undo2} tone="secondary" disabled={readOnly || cursor === 0} onClick={undo}>Undo</AppleQuietAction>
            <AppleQuietAction icon={Redo2} tone="secondary" disabled={readOnly || cursor === history.length - 1} onClick={redo}>Redo</AppleQuietAction>
            <AppleQuietAction icon={RotateCcw} tone="secondary" disabled={readOnly || equalVinylLayouts(layout, VINYL_ORIGINAL)} onClick={() => setResetConfirm(true)}>Reset to original</AppleQuietAction>
          </div>
        )}
      </div>
      </>}

      {(sourceView === 'sides' || generatedSideMasters.A || generatedSideMasters.B) && <AppleCard className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{sourceView === 'sides' ? 'Side masters' : 'Generated side masters'}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{sourceView === 'sides' ? 'One complete file per side.' : 'Press-ready outputs generated from the confirmed individual-track sequence.'}</p>
          </div>
          {sourceView === 'sides' && <div className="flex items-center gap-2">
            {sideMasters.A && sideMasters.B
              ? <Button variant="outline" size="sm" className="h-9 rounded-full px-3" disabled={readOnly} onClick={() => setDialog('extract')}>Review extraction</Button>
              : <Button variant="outline" size="sm" className="h-9 rounded-full px-3" disabled={readOnly} onClick={() => setDialog('generate')}>Generate sides</Button>}
          </div>}
        </div>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="audio/*,.wav,.aif,.aiff,.flac"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              setSideMasters((current) => ({ ...current, [pendingSide.current]: { name: file.name, duration: effectiveSeconds(pendingSide.current) } }));
              setNotice(`Attached ${file.name} locally to Side ${pendingSide.current}.`);
            }
            event.target.value = '';
          }}
        />
        <ul>
          {(['A', 'B'] as VinylSide[]).map((side) => {
            const row = sourceView === 'sides' ? sideMasters[side] : generatedSideMasters[side];
            return <li key={side} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
              <strong className="w-14 text-sm">Side {side}</strong>
              {row ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{row.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatVinylTime(row.duration)}</span>
                  <AppleQuietAction className="size-8 p-0" icon={Download} aria-label={`Download Side ${side} master`} onClick={() => vinylDownload(row.name, `R&D download manifest for ${row.name}`)} />
                   {!readOnly && sourceView === 'sides' && <AppleQuietAction className="size-8 p-0 text-destructive" icon={X} aria-label={`Remove Side ${side} master`} onClick={() => setRemoveSideMaster(side)} />}
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-muted-foreground">No side file attached</span>
               {sourceView === 'sides' && <Button variant="outline" size="sm" className="h-9 rounded-full px-3" disabled={readOnly} onClick={() => chooseSideMaster(side)}><Upload />Upload master</Button>}
                </>
              )}
            </li>;
          })}
        </ul>
      </AppleCard>}
      {notice && <p className="mt-3 text-right text-xs text-muted-foreground" role="status">{notice}</p>}
    </section>

    <Dialog open={dialog === 'masters'} onOpenChange={(open) => !open && setDialog(null)}>
      <AppleDialogShell
        className="dark gt-admin-dark"
        title="Track masters"
        subtitle="CALIFORNIALAND · 12 downloadable source masters"
        footer={<Button variant="outline" className="rounded-full" onClick={() => vinylDownload('CALIFORNIALAND_masters_manifest.txt', VINYL_TRACKS.map((track) => track.file).join('\n'))}><Download /> Download all</Button>}
      >
        <div>
          <p className="mb-3 text-sm text-muted-foreground">Track masters are the uploaded source audio; side masters are the assembled files sent for cutting and pressing.</p>
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border">
            {VINYL_TRACKS.map((track) => <div key={track.id} className="flex items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
              <FileAudio className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{track.digital}. {track.title}</div>
                <div className="truncate text-xs text-muted-foreground">{track.file} · WAV · 96 kHz · 24-bit</div>
              </div>
              <AppleStatus tone="ready">Usable</AppleStatus>
              <AppleQuietAction className="size-8 p-0" icon={Download} aria-label={`Download ${track.title}`} onClick={() => vinylDownload(track.file, `R&D download manifest for ${track.title}`)} />
            </div>)}
          </div>
        </div>
      </AppleDialogShell>
    </Dialog>

    <Dialog open={dialog === 'pq'} onOpenChange={(open) => !open && setDialog(null)}>
      <AppleDialogShell
        className="dark gt-admin-dark"
        title="PQ sheet"
        subtitle="CALIFORNIALAND · sequence and timing preview"
        footer={<Button className="rounded-full" onClick={() => vinylDownload('CALIFORNIALAND_PQ_sheet.txt', 'CALIFORNIALAND PQ sheet — R&D fixture')}><Download /> Download PQ sheet</Button>}
      >
        <div className="space-y-4">
          {(['A', 'B'] as VinylSide[]).map((side) => <div key={side} className="rounded-xl border border-border">
            <div className="flex justify-between border-b border-border bg-muted/50 px-4 py-3 text-sm font-semibold">
              <span>Side {side} · {catalogs[side]}</span><span className="tabular-nums">{formatVinylTime(effectiveSeconds(side))}</span>
            </div>
            {layout[side].map((id, index) => {
              const track = byId.get(id)!;
               const elapsed = layout[side].slice(0, index).reduce((sum, prior) => sum + byId.get(prior)!.duration + gapSeconds, 0);
              return <div key={id} className="grid grid-cols-[32px_1fr_64px_64px] gap-2 border-t border-border px-4 py-2 text-xs first:border-t-0"><span>{index + 1}</span><span>{track.title}</span><span className="tabular-nums text-muted-foreground">{formatVinylTime(elapsed)}</span><span className="text-right tabular-nums text-muted-foreground">{formatVinylTime(track.duration)}</span></div>;
            })}
          </div>)}
        </div>
      </AppleDialogShell>
    </Dialog>

    <Dialog open={dialog === 'cut'} onOpenChange={(open) => !open && setDialog(null)}>
      <AppleDialogShell className="dark gt-admin-dark" title="Cut settings" subtitle="Music Record Pressing recommendations for this 12-inch release" footer={<><AppleQuietAction tone="secondary" onClick={() => setDialog(null)}>Cancel</AppleQuietAction><Button variant={cutSettingsChanged ? 'default' : 'outline'} className="rounded-full" disabled={!cutSettingsChanged} onClick={() => { setRpm(draftRpm); setGapSeconds(draftGapSeconds); setDialog(null); setNotice(`Applied ${draftRpm} RPM with a ${draftGapSeconds}s inter-track gap locally.`); }}>Apply settings</Button></>}>
        <div className="space-y-5">
          <div><div className="mb-2 text-sm font-medium">RPM</div><div className="inline-flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Cut speed">{(['33⅓', '45'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={draftRpm === value} onClick={() => setDraftRpm(value)} className={cn('rounded-full px-5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', draftRpm === value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}>{value} RPM</button>)}</div><p className="mt-2 text-xs text-muted-foreground">Press recommendation: 33⅓ RPM. 45 RPM improves fidelity but reduces available time to 16:00 per side.</p></div>
          <div><label htmlFor="cut-gap" className="text-sm font-medium">Inter-track gap</label><div className="mt-2 flex items-center gap-3"><Input id="cut-gap" type="number" min="0" max="8" step="0.5" value={draftGapSeconds} disabled={!draftCutRule.artistMayAdjustGap} onChange={(event) => setDraftGapSeconds(Number(event.target.value))} className="w-24" /><span className="text-sm text-muted-foreground">seconds</span></div><p className="mt-2 text-xs text-muted-foreground">Also called banding or land. This press permits artist adjustment from its 2-second default.</p></div>
          {draftRpm === '45' && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"><AlertTriangle className="mr-2 inline size-4" />Both current sides exceed the 45 RPM capacity fixture.</div>}
        </div>
      </AppleDialogShell>
    </Dialog>

    <Dialog open={dialog === 'generate'} onOpenChange={(open) => !open && setDialog(null)}>
      <AppleDialogShell className="dark gt-admin-dark" title="Generate side masters" subtitle="Build local press-ready files from the confirmed sequence" footer={<><AppleQuietAction tone="secondary" onClick={() => setDialog(null)}>Cancel</AppleQuietAction><Button variant={overSide ? 'outline' : 'default'} className="rounded-full" disabled={!!overSide} onClick={() => { setGeneratedSideMasters({ A: { name: 'CALIFORNIALAND_SIDE_A_GENERATED.wav', duration: effectiveSeconds('A') }, B: { name: 'CALIFORNIALAND_SIDE_B_GENERATED.wav', duration: effectiveSeconds('B') } }); setDialog(null); setNotice('Generated local fixture Side A/B masters. No backend files were created.'); }}>Generate side masters</Button></>}>
        <div className="space-y-4"><p className="text-sm text-muted-foreground">Music Record Pressing recommends {rpm} RPM and a {gapSeconds}s inter-track gap. The sequence itself will not change.</p>{(['A', 'B'] as VinylSide[]).map((side) => { const projected = effectiveSeconds(side); const invalid = projected > cutRule.maxSeconds; return <div key={side} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm"><strong>Side {side}</strong><span className={cn('tabular-nums', invalid ? 'font-medium text-amber-400' : 'text-muted-foreground')}>{formatVinylTime(projected)} projected{invalid ? ` · ${formatVinylTime(projected - cutRule.maxSeconds)} over` : ''}</span></div>; })}{overSide && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"><AlertTriangle className="mr-2 inline size-4" />Adjust the sequence or Cut settings before generating press-ready files.</div>}</div>
      </AppleDialogShell>
    </Dialog>

    <Dialog open={dialog === 'extract'} onOpenChange={(open) => !open && setDialog(null)}>
      <AppleDialogShell className="dark gt-admin-dark" title="Review extracted regions" subtitle="Local R&D proposal — confirm before the authoritative sequence changes" footer={<><AppleQuietAction tone="secondary" onClick={() => setDialog(null)}>Cancel</AppleQuietAction><Button className="rounded-full" disabled={!candidateName.trim()} onClick={() => { setExtractionConfirmed(true); setDialog(null); setNotice('Confirmed the extraction proposal locally. The canonical sequence was updated only after confirmation.'); }}>Confirm sequence</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_64px_64px_64px_90px] gap-2 px-3 text-xs text-muted-foreground"><span>Detected title</span><span>Start</span><span>End</span><span>Gap</span><span>Confidence</span></div>
          {[['Welcome to Californialand', '0:00', '4:10', '2s', 'High'], ['Palm Trees', '4:12', '8:10', '2s', 'High'], ['Instrumental / unnamed', '8:12', '9:03', '20s', 'Low']].map((row) => <div key={row[1]} className="grid grid-cols-[1fr_64px_64px_64px_90px] items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs"><span className="font-medium">{row[0]}</span><span className="tabular-nums">{row[1]}</span><span className="tabular-nums">{row[2]}</span><span className={row[3] === '20s' ? 'text-amber-400' : ''}>{row[3]}</span><AppleStatus tone={row[4] === 'High' ? 'ready' : 'warning'}>{row[4]}</AppleStatus></div>)}
          <div><label htmlFor="candidate-name" className="text-sm font-medium">Required name for unnamed region</label><Input id="candidate-name" className="mt-2" value={candidateName} onChange={(event) => setCandidateName(event.target.value)} placeholder="Enter title or confirm as untitled" /><p className="mt-2 text-xs text-muted-foreground">Likely titles above come from the existing release tracklist. The low-confidence extra region is never named automatically.</p></div>
        </div>
      </AppleDialogShell>
    </Dialog>

    <Dialog open={removeSideMaster !== null} onOpenChange={(open) => !open && setRemoveSideMaster(null)}>
      <AppleDialogShell
        className="dark gt-admin-dark"
        title={`Remove Side ${removeSideMaster ?? ''} master?`}
        subtitle={removeSideMaster ? sideMasters[removeSideMaster]?.name : undefined}
        footer={<>
          <AppleQuietAction tone="secondary" onClick={() => setRemoveSideMaster(null)}>Cancel</AppleQuietAction>
          <Button variant="destructive" className="rounded-full" onClick={() => {
            if (!removeSideMaster) return;
            const side = removeSideMaster;
            setSideMasters((current) => ({ ...current, [side]: undefined }));
            setRemoveSideMaster(null);
            setNotice(`Detached the Side ${side} master locally. The original upload was not deleted.`);
          }}>Remove master</Button>
        </>}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">This detaches the file from this release and removes it from extraction and preflight. The original uploaded file is not deleted.</p>
      </AppleDialogShell>
    </Dialog>
  </div>;
}

// ─── Player art panel (verbatim from Canon) ───────────────────────────────
function PlayerArtPanel({ t, release }: { t: Theme; release: AdminRelease }) {
  const [art, setArt] = useState(release.cover);
  const [sourceName, setSourceName] = useState('Release artwork');
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const replaceArtwork = (file?: File) => {
    if (!file) return;
    setArt(URL.createObjectURL(file));
    setSourceName(file.name);
    setMenuOpen(false);
  };
  const downloadArtwork = () => {
    if (!art) return;
    const anchor = document.createElement('a');
    anchor.href = art;
    anchor.download = `${release.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'release'}-player-artwork`;
    anchor.click();
    setMenuOpen(false);
  };
  return <div className="mt-5" data-testid="player-art-panel">
    <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="group relative aspect-square overflow-hidden" style={{ backgroundColor: t.cardSoft }}>
          {art ? <img src={art} alt={`${release.title} player artwork`} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Image className="h-9 w-9" style={{ color: t.faint }} /></div>}
          <div className="absolute right-3 top-3 z-20">
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex size-9 items-center justify-center rounded-full shadow-sm backdrop-blur-md" style={{ backgroundColor: 'rgba(30,30,32,.88)', border: `1px solid ${t.hairline}`, color: t.ink }} aria-label="Player artwork options" aria-expanded={menuOpen}><MoreHorizontal className="size-4" /></button>
            {menuOpen && <>
              <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close player artwork menu" />
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} role="menu">
                <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setMenuOpen(false); setImportOpen(true); }} role="menuitem"><Upload className="size-3.5" style={{ color: t.subink }} />Replace artwork</button>
                {art && <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={downloadArtwork} role="menuitem"><Download className="size-3.5" style={{ color: t.subink }} />Download artwork</button>}
                {art !== release.cover && <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setArt(release.cover); setSourceName('Release artwork'); setMenuOpen(false); }} role="menuitem"><RotateCcw className="size-3.5" style={{ color: t.subink }} />Use release artwork</button>}
              </div>
            </>}
          </div>
        </div>
        <div className="flex flex-col justify-center px-7 py-8 md:px-10">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: t.faint }}>GoodTunes® Player</span>
          <h3 className="mt-3 text-[24px] font-semibold tracking-tight" style={{ color: t.ink }}>Album artwork</h3>
          <p className="mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: t.subink }}>The square image fans see while browsing and playing {release.title}.</p>
          <dl className="mt-6 grid gap-3 text-[12.5px]">
            <div className="flex items-center justify-between gap-4 border-b pb-3" style={{ borderColor: t.hairline }}><dt style={{ color: t.subink }}>Source</dt><dd className="max-w-[65%] truncate text-right font-medium" style={{ color: t.ink }}>{sourceName}</dd></div>
            <div className="flex items-center justify-between gap-4 border-b pb-3" style={{ borderColor: t.hairline }}><dt style={{ color: t.subink }}>Target</dt><dd className="font-medium tabular-nums" style={{ color: t.ink }}>1080 × 1080 px</dd></div>
            <div className="flex items-center justify-between gap-4"><dt style={{ color: t.subink }}>Status</dt><dd className="flex items-center gap-1.5 font-medium" style={{ color: t.ready }}><CheckCircle2 className="size-3.5" />Artwork added</dd></div>
          </dl>
        </div>
      </div>
    </div>
    {importOpen && <MediaImportDialog t={t} kind="photo" titleOverride="Replace artwork" onClose={() => setImportOpen(false)} onFiles={(files) => replaceArtwork(files?.[0])} onUrl={(value) => { setArt(value); setSourceName(value); }} />}
  </div>;
}

function AdvancedMediaMenu({ t, label, onPick }: { t: Theme; label: string; onPick: () => void }) {
  return <button type="button" onClick={onPick} className={cn('inline-flex h-9 items-center rounded-full px-3 text-[12px] font-medium', t.hoverWash)} style={{ color: t.subink }}>{label}</button>;
}

function MediaImportDialog({
  t,
  kind,
  onClose,
  onFiles,
  onUrl,
  titleOverride,
}: {
  t: Theme;
  kind: 'video' | 'photo' | 'artwork';
  onClose: () => void;
  onFiles: (files: FileList | null | undefined) => void;
  onUrl: (url: string) => void;
  titleOverride?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'upload' | 'url'>('upload');
  const [url, setUrl] = useState('');
  const isVideo = kind === 'video';
  const isArtwork = kind === 'artwork';
  const title = titleOverride ?? (isVideo ? 'Add video' : isArtwork ? 'Add artwork' : 'Add photo');
  const detail = isVideo ? 'MP4 / MOV / WebM · up to 500 MB' : isArtwork ? 'PDF / JPG / PNG / TIFF · use the press template dimensions' : 'JPG / PNG / WebP · up to 8 MB';
  const accept = isVideo ? 'video/mp4,video/quicktime,video/webm' : isArtwork ? 'application/pdf,.pdf,image/jpeg,image/png,image/tiff' : 'image/jpeg,image/png,image/webp';
  const finishFiles = (files: FileList | null | undefined) => {
    if (!files?.length) return;
    onFiles(files);
    onClose();
  };
  const finishUrl = () => {
    const value = url.trim();
    if (!value) return;
    onUrl(value);
    onClose();
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ backgroundColor: 'rgba(0,0,0,.58)', backdropFilter: 'blur(7px)' }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[640px] overflow-hidden rounded-2xl shadow-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid={`dialog-bonus-${kind}`}>
      <div className="flex items-start justify-between gap-5 px-6 py-5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
        <div><h3 className="text-[18px] font-semibold" style={{ color: t.ink }}>{title}</h3><p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Drag and drop, choose a file, or paste a direct link.</p></div>
        <button type="button" onClick={onClose} className={cn('flex size-8 items-center justify-center rounded-full', t.hoverWash)} style={{ backgroundColor: t.cardSoft, color: t.subink }} aria-label="Close import tool"><X className="size-4" /></button>
      </div>
      <div className="px-6 py-5">
        <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Import source">
          {([['upload', 'Upload file'], ['url', 'Paste a URL']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)} className="h-8 rounded-full px-3 text-[12px] font-medium" style={{ backgroundColor: source === value ? t.card : 'transparent', boxShadow: source === value ? t.pillShadow : undefined, color: source === value ? t.ink : t.subink }}>{label}</button>)}
        </div>
        {source === 'upload' ? <div className="mt-4 flex min-h-[220px] flex-col items-center justify-center rounded-2xl px-8 text-center" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.cardSoft }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); finishFiles(event.dataTransfer.files); }}>
          <Upload className="size-6" style={{ color: t.subink }} />
          <p className="mt-3 text-[14px] font-semibold" style={{ color: t.ink }}>Drag &amp; drop {kind} files here</p>
          <p className="mt-1 text-[12px]" style={{ color: t.faint }}>{detail}</p>
          <button type="button" onClick={() => inputRef.current?.click()} className={cn('mt-5 h-9 rounded-full px-4 text-[12.5px] font-semibold', t.hoverWash)} style={{ color: t.ink, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>Choose files</button>
        </div> : <div className="mt-4 flex min-h-[220px] flex-col justify-center rounded-2xl px-8" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.cardSoft }}>
          <label className="text-[12px] font-medium" style={{ color: t.subink }} htmlFor={`bonus-url-${kind}`}>Direct link</label>
          <div className="mt-2 flex gap-2"><input id={`bonus-url-${kind}`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="h-10 min-w-0 flex-1 rounded-full px-4 text-[13px] outline-none" style={inputStyle(t)} /><button type="button" disabled={!url.trim()} onClick={finishUrl} className="h-10 rounded-full px-4 text-[12.5px] font-semibold disabled:opacity-40" style={{ color: t.ink, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>Use link</button></div>
          <p className="mt-2 text-[11.5px]" style={{ color: t.faint }}>Paste a direct link from Dropbox, Drive, or another supported host.</p>
        </div>}
      </div>
      <input ref={inputRef} type="file" accept={accept} multiple className="sr-only" onChange={(event) => { finishFiles(event.target.files); event.currentTarget.value = ''; }} />
    </section>
  </div>;
}

function PlayerMediaCards({ t }: { t: Theme }) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoPreviewsRef = useRef<string[]>([]);
  const [videoNames, setVideoNames] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<Array<{ name: string; preview: string }>>([]);
  const [url, setUrl] = useState('');
  const [videoDragActive, setVideoDragActive] = useState(false);
  const [photoDragActive, setPhotoDragActive] = useState(false);

  useEffect(() => () => {
    photoPreviewsRef.current.forEach((preview) => URL.revokeObjectURL(preview));
  }, []);

  const useVideos = (files: FileList | null | undefined) => {
    const names = Array.from(files ?? []).map((file) => file.name);
    if (names.length) setVideoNames((current) => [...current, ...names]);
  };
  const usePhotos = (files: FileList | null | undefined) => {
    const next = Array.from(files ?? []).map((file) => ({ name: file.name, preview: URL.createObjectURL(file) }));
    if (next.length) {
      photoPreviewsRef.current.push(...next.map((photo) => photo.preview));
      setPhotoFiles((current) => [...current, ...next]);
    }
  };
  const importUrl = () => {
    const value = url.trim();
    if (!value) return;
    setVideoNames((current) => [...current, value]);
    setUrl('');
  };

  return <div className="space-y-4" data-testid="player-media-cards">
    <section className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="panel-bonus-videos">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
        <div>
          <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: t.ink }}><Film className="h-4 w-4" style={{ color: t.faint }} />Videos</h3>
          <p className="mt-0.5 text-[11.5px]" style={{ color: t.faint }}>{videoNames.length} {videoNames.length === 1 ? 'video' : 'videos'} · MP4 / MOV / WebM · up to 500 MB</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => videoInputRef.current?.click()} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium', t.hoverWash)} style={{ color: t.blue }}><Plus className="h-3.5 w-3.5" />Add Video</button>
          <AdvancedMediaMenu t={t} label="Upload multiple videos" onPick={() => videoInputRef.current?.click()} />
        </div>
      </div>
      <div className="p-5">
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setVideoDragActive(true); }}
          onDragLeave={() => setVideoDragActive(false)}
          onDrop={(event) => { event.preventDefault(); setVideoDragActive(false); useVideos(event.dataTransfer.files); }}
          className="flex min-h-28 w-full items-center gap-4 rounded-xl border border-dashed px-5 py-5 text-left transition-colors"
          style={{ borderColor: videoDragActive ? t.blue : t.hairline, backgroundColor: videoDragActive ? t.selectWash : t.cardSoft }}
          data-testid="dropzone-bonus-video"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: t.card, color: videoDragActive ? t.blue : t.subink }}><Film className="h-5 w-5" strokeWidth={1.5} /></span>
          <span><span className="block text-[13.5px] font-semibold" style={{ color: t.ink }}>Drop a video here, or click to browse</span><span className="mt-1 block text-[11.5px]" style={{ color: t.subink }}>MP4 / MOV / WebM · up to 500 MB</span></span>
        </button>
        <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple className="sr-only" onChange={(event) => { useVideos(event.target.files); event.currentTarget.value = ''; }} />
        <div className="mt-3 flex items-center gap-2"><span className="h-px flex-1" style={{ backgroundColor: t.hairline }} /><span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>or paste a link</span><span className="h-px flex-1" style={{ backgroundColor: t.hairline }} /></div>
        <form className="mt-3 flex items-stretch gap-2" onSubmit={(event) => { event.preventDefault(); importUrl(); }}>
          <div className="relative flex-1"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: t.faint }} /><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.dropbox.com/scl/… or https://…/video.mp4" className="h-9 w-full rounded-lg pl-9 pr-3 text-[13px] outline-none" style={inputStyle(t)} data-testid="input-bonus-video-url" /></div>
          <button type="submit" disabled={!url.trim()} className="h-9 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-50" style={{ backgroundColor: url.trim() ? t.blue : 'transparent', border: url.trim() ? '1px solid transparent' : `1px solid ${t.hairline}`, color: url.trim() ? '#fff' : t.subink }} data-testid="button-bonus-video-import">Import</button>
        </form>
        {videoNames.length > 0 && <div className="mt-3 flex items-center gap-2 text-[11.5px]" style={{ color: t.ready }}><CheckCircle2 className="h-3.5 w-3.5" /><span className="truncate">{videoNames.length === 1 ? 'Imported' : `${videoNames.length} imported`} · {videoNames[videoNames.length - 1]}</span></div>}
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="panel-bonus-photos">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
        <div>
          <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: t.ink }}><Image className="h-4 w-4" style={{ color: t.faint }} />Photos</h3>
          <p className="mt-0.5 text-[11.5px]" style={{ color: t.faint }}>{photoFiles.length} {photoFiles.length === 1 ? 'photo' : 'photos'} · JPG / PNG / WebP · up to 8 MB</p>
        </div>
        <AdvancedMediaMenu t={t} label="Upload multiple photos" onPick={() => photoInputRef.current?.click()} />
      </div>
      <div className="p-5">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setPhotoDragActive(true); }}
          onDragLeave={() => setPhotoDragActive(false)}
          onDrop={(event) => { event.preventDefault(); setPhotoDragActive(false); usePhotos(event.dataTransfer.files); }}
          className="flex min-h-28 w-full items-center gap-4 rounded-xl border border-dashed px-5 py-5 text-left transition-colors"
          style={{ borderColor: photoDragActive ? t.blue : t.hairline, backgroundColor: photoDragActive ? t.selectWash : t.cardSoft }}
          data-testid="dropzone-bonus-photo"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: t.card, color: photoDragActive ? t.blue : t.subink }}><ImagePlus className="h-5 w-5" strokeWidth={1.5} /></span>
          <span><span className="block text-[13.5px] font-semibold" style={{ color: t.ink }}>Drop a photo here, or click to browse</span><span className="mt-1 block text-[11.5px]" style={{ color: t.subink }}>JPG / PNG / WebP · up to 8 MB</span></span>
        </button>
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { usePhotos(event.target.files); event.currentTarget.value = ''; }} />
        {photoFiles.length > 0 && <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">{photoFiles.map((photo, index) => <div key={`${photo.name}-${index}`} className="overflow-hidden rounded-xl" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}><img src={photo.preview} alt={photo.name} className="aspect-square w-full object-cover" /><p className="truncate px-2 py-1.5 text-[10.5px]" style={{ color: t.subink }}>{photo.name}</p></div>)}</div>}
      </div>
    </section>
  </div>;
}

function PlayerMediaTileCards({ t }: { t: Theme }) {
  const previewsRef = useRef<string[]>([]);
  const [videos, setVideos] = useState<Array<{ title: string; description: string; preview: string }>>([]);
  const [photos, setPhotos] = useState<Array<{ title: string; caption: string; preview: string }>>([]);
  const [importKind, setImportKind] = useState<'video' | 'photo' | null>(null);

  useEffect(() => () => previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview)), []);

  const addVideos = (files: FileList | null | undefined) => {
    const next = Array.from(files ?? []).map((file) => {
      const preview = URL.createObjectURL(file);
      previewsRef.current.push(preview);
      return { title: file.name.replace(/\.[^.]+$/, ''), description: '', preview };
    });
    if (next.length) setVideos((current) => [...current, ...next]);
  };
  const addPhotos = (files: FileList | null | undefined) => {
    const next = Array.from(files ?? []).map((file) => {
      const preview = URL.createObjectURL(file);
      previewsRef.current.push(preview);
      return { title: file.name.replace(/\.[^.]+$/, ''), caption: '', preview };
    });
    if (next.length) setPhotos((current) => [...current, ...next]);
  };
  const addUrl = (kind: 'video' | 'photo', value: string) => {
    const fallbackTitle = value.split('/').filter(Boolean).pop()?.split('?')[0]?.replace(/\.[^.]+$/, '') || (kind === 'video' ? 'Imported video' : 'Imported photo');
    if (kind === 'video') setVideos((current) => [...current, { title: fallbackTitle, description: '', preview: value }]);
    else setPhotos((current) => [...current, { title: fallbackTitle, caption: '', preview: value }]);
  };

  return <div className="space-y-9" data-testid="player-media-cards">
    <section data-testid="panel-bonus-videos">
      <div>
        <h3 className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: t.ink }}><Film className="size-4" style={{ color: t.faint }} />Videos</h3>
        <p className="mt-1 text-[11.5px]" style={{ color: t.faint }}>{videos.length} {videos.length === 1 ? 'video' : 'videos'} · MP4 / MOV / WebM · up to 500 MB</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {videos.map((video, index) => <article key={video.preview} className="group relative overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
          <video src={video.preview} className="aspect-video w-full object-cover" muted playsInline />
          <div className="px-4 py-3.5">
            <p className="truncate text-[13.5px] font-semibold" style={{ color: t.ink }}>{video.title}</p>
            <button type="button" className="mt-1 block max-w-full truncate text-left text-[11.5px]" style={{ color: t.faint }} onClick={() => { const description = window.prompt('Optional video description', video.description); if (description !== null) setVideos((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, description: description.trim() } : item)); }}>{video.description || 'Add description'}</button>
          </div>
          <button type="button" onClick={() => setVideos((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ backgroundColor: 'rgba(24,24,26,.84)', color: '#fff' }} aria-label={`Remove ${video.title}`}><X className="size-4" /></button>
        </article>)}
        <button type="button" onClick={() => setImportKind('video')} className="group overflow-hidden rounded-2xl text-left" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="dropzone-bonus-video">
          <span className="flex aspect-video items-center justify-center border-b border-dashed transition-colors group-hover:bg-muted/70" style={{ borderColor: t.hairline, backgroundColor: t.cardSoft }}><span className="flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: t.card, color: t.subink }}><Plus className="size-5" /></span></span>
          <span className="block px-4 py-3.5"><strong className="block text-[13.5px] font-semibold" style={{ color: t.ink }}>Add video</strong><span className="mt-1 block text-[11.5px]" style={{ color: t.faint }}>Open import options · 16:9</span></span>
        </button>
      </div>
    </section>

    <section data-testid="panel-bonus-photos">
      <div>
        <h3 className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: t.ink }}><Image className="size-4" style={{ color: t.faint }} />Photos</h3>
        <p className="mt-1 text-[11.5px]" style={{ color: t.faint }}>{photos.length} {photos.length === 1 ? 'photo' : 'photos'} · JPG / PNG / WebP · up to 8 MB</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {photos.map((photo, index) => <article key={photo.preview} className="group relative overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
          <img src={photo.preview} alt={photo.title} className="aspect-square w-full object-cover" />
          <div className="px-4 py-3.5">
            <p className="truncate text-[13.5px] font-semibold" style={{ color: t.ink }}>{photo.title}</p>
            <button type="button" className="mt-1 block max-w-full truncate text-left text-[11.5px]" style={{ color: t.faint }} onClick={() => { const caption = window.prompt('Optional photo caption', photo.caption); if (caption !== null) setPhotos((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, caption: caption.trim() } : item)); }}>{photo.caption || 'Add caption'}</button>
          </div>
          <button type="button" onClick={() => setPhotos((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-2.5 top-2.5 flex size-8 items-center justify-center rounded-full opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ backgroundColor: 'rgba(24,24,26,.84)', color: '#fff' }} aria-label={`Remove ${photo.title}`}><X className="size-4" /></button>
        </article>)}
        <button type="button" onClick={() => setImportKind('photo')} className="group overflow-hidden rounded-2xl text-left" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="dropzone-bonus-photo">
          <span className="flex aspect-square items-center justify-center border-b border-dashed transition-colors group-hover:bg-muted/70" style={{ borderColor: t.hairline, backgroundColor: t.cardSoft }}><span className="flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: t.card, color: t.subink }}><Plus className="size-5" /></span></span>
          <span className="block px-4 py-3.5"><strong className="block text-[13.5px] font-semibold" style={{ color: t.ink }}>Add photo</strong><span className="mt-1 block text-[11.5px]" style={{ color: t.faint }}>Open import options · square</span></span>
        </button>
      </div>
    </section>
    {importKind && <MediaImportDialog t={t} kind={importKind} onClose={() => setImportKind(null)} onFiles={importKind === 'video' ? addVideos : addPhotos} onUrl={(value) => addUrl(importKind, value)} />}
  </div>;
}

// ─── Player bonus row (verbatim from Canon) ───────────────────────────────
function PlayerBonusRow({
  t,
  label,
  detail,
  action,
  accept,
  multiple,
  Icon,
  divided,
}: {
  t: Theme;
  label: string;
  detail: string;
  action: string;
  accept: string;
  multiple?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  divided?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<'upload' | 'url'>('upload');
  const [url, setUrl] = useState('');
  const useFiles = (list: FileList | null | undefined) => {
    const names = Array.from(list ?? []).map((file) => file.name);
    if (!names.length) return;
    setFiles(names);
    setOpen(false);
  };
  const useUrl = () => {
    const value = url.trim();
    if (!value) return;
    setFiles([value]);
    setOpen(false);
  };
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5" style={{ borderBottom: divided ? `1px solid ${t.hairline}` : undefined }}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: t.cardSoft, color: t.subink }}><Icon className="h-4 w-4" /></div>
        <div><p className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{label}</p><p className="mt-0.5 text-[11.5px]" style={{ color: t.subink }}>{files.length ? `${files.length} added · ${files.join(', ')}` : `None added · ${detail}`}</p></div>
      </div>
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium', t.hoverWash)} style={{ color: t.blue }}><Plus className="h-3.5 w-3.5" />{action}</button>
    </div>
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ backgroundColor: 'rgba(0,0,0,.58)', backdropFilter: 'blur(7px)' }} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label={action} className="w-full max-w-[640px] overflow-hidden rounded-2xl shadow-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid={`dialog-bonus-${label.toLowerCase()}`}>
        <div className="flex items-start justify-between gap-5 px-6 py-5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div><h3 className="text-[18px] font-semibold" style={{ color: t.ink }}>{action}</h3><p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Drag and drop, choose a file, or paste a direct link.</p></div>
          <button type="button" onClick={() => setOpen(false)} className={cn('flex h-8 w-8 items-center justify-center rounded-full', t.hoverWash)} style={{ backgroundColor: t.cardSoft, color: t.subink }} aria-label="Close upload"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">
          <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Upload source">
            {([
              ['upload', 'Upload file'],
              ['url', 'Paste a URL'],
            ] as const).map(([value, text]) => <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)} className="h-8 rounded-full px-3 text-[12px] font-medium" style={{ backgroundColor: source === value ? t.card : 'transparent', boxShadow: source === value ? t.pillShadow : undefined, color: source === value ? t.ink : t.subink }}>{text}</button>)}
          </div>
          {source === 'upload' ? <div
            className="mt-4 flex min-h-[220px] flex-col items-center justify-center rounded-2xl px-8 text-center"
            style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.cardSoft }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); useFiles(event.dataTransfer.files); }}
          >
            <Upload className="h-6 w-6" style={{ color: t.subink }} />
            <p className="mt-3 text-[14px] font-semibold" style={{ color: t.ink }}>Drag &amp; drop {label.toLowerCase()} here</p>
            <p className="mt-1 text-[12px]" style={{ color: t.faint }}>{detail}</p>
            <button type="button" onClick={() => inputRef.current?.click()} className={cn('mt-5 h-9 rounded-full px-4 text-[12.5px] font-semibold', t.hoverWash)} style={{ color: t.ink, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>Choose file{multiple ? 's' : ''}</button>
          </div> : <div className="mt-4 flex min-h-[220px] flex-col justify-center rounded-2xl px-8" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.cardSoft }}>
            <label className="text-[12px] font-medium" style={{ color: t.subink }} htmlFor={`bonus-url-${label}`}>Direct link</label>
            <div className="mt-2 flex gap-2"><input id={`bonus-url-${label}`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="h-10 min-w-0 flex-1 rounded-full px-4 text-[13px] outline-none" style={inputStyle(t)} /><button type="button" disabled={!url.trim()} onClick={useUrl} className="h-10 rounded-full px-4 text-[12.5px] font-semibold disabled:opacity-40" style={{ color: t.ink, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>Use link</button></div>
            <p className="mt-2 text-[11.5px]" style={{ color: t.faint }}>Paste a direct link from Dropbox, Drive, or another supported host.</p>
          </div>}
        </div>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(event) => { useFiles(event.target.files); event.currentTarget.value = ''; }} />
      </section>
    </div>}
  </>;
}

// ─── Player audio panel (verbatim from Canon) ─────────────────────────────
function PlayerAudioPanel({ t }: { t: Theme }) {
  const isDark = t.card.toLowerCase() === THEMES.dark.card;
  return <div className="mt-5" data-testid="player-audio-panel">
    <OtisTracksInteractive embedded dark={isDark} alignModeWithHeading />
  </div>;
}

// ─── GoodDeed asset panel (verbatim from Canon) ───────────────────────────
function GoodDeedAssetPanel({ t, release }: { t: Theme; release: AdminRelease }) {
  return <>
    {/* The approved print geometry is owned by the shared Canon panel. This
        scoped presentation shim only fixes the tiny preview viewport: the
        Letter/A4 band gets enough breathing room for the long provenance copy,
        and the white GoodTunes mark remains legible on the navy band. No
        production or artwork geometry is changed. */}
    <style>{`
      [data-testid="gooddeed-assets"] img[alt="GoodTunes"] {
        filter: brightness(0) invert(1) !important;
      }
      [data-testid="gooddeed-assets"] .relative.max-w-full > .relative.shrink-0.bg-white > .absolute.text-white {
        box-sizing: border-box;
        padding: 9px !important;
      }
      [data-testid="gooddeed-assets"] .relative.max-w-full > .relative.shrink-0.bg-white > .absolute.text-white p.font-bold {
        font-size: 8px !important;
        line-height: 1.16 !important;
        max-width: 100%;
      }
      [data-testid="gooddeed-assets"] .relative.max-w-full > .relative.shrink-0.bg-white > .absolute.text-white p.absolute {
        font-size: 5.5px !important;
        line-height: 1.24 !important;
        max-width: calc(100% - 12px);
      }
    `}</style>
    <CanonGoodDeedAssetPanel t={t} release={release} />
  </>;
}

// ─── Vinyl art piece card (verbatim from Canon) ───────────────────────────
type VinylArtPiece = {
  label: string;
  kind: IconKind;
  image: string | null;
};

function VinylArtPieceCard({
  piece,
  t,
  onReview,
  onUpload,
  onNotice,
}: {
  piece: VinylArtPiece;
  t: Theme;
  onReview: () => void;
  onUpload: (url: string) => void;
  onNotice: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const acceptFile = (file?: File) => {
    if (!file) return;
    onUpload(URL.createObjectURL(file));
    onNotice(`${piece.label} artwork added`);
    setMenuOpen(false);
  };
  const downloadArtwork = () => {
    if (!piece.image) return;
    const anchor = document.createElement('a');
    anchor.href = piece.image;
    anchor.download = `${piece.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-artwork`;
    anchor.click();
    setMenuOpen(false);
  };
  return <><div className={cn('group relative overflow-visible rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus-within:ring-2', t.hoverWash)} style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
    <button
      type="button"
      onClick={piece.image ? onReview : () => setImportOpen(true)}
      className="block w-full overflow-hidden rounded-t-2xl text-left focus:outline-none"
      aria-label={piece.image ? `Open prepress review for ${piece.label}` : `Upload artwork for ${piece.label}`}
      data-testid={`vinyl-art-piece-${piece.kind}`}
    >
      <div className="relative aspect-[1.45/1] overflow-hidden" style={{ backgroundColor: t.cardSoft }}>
        {piece.image ? <img src={piece.image} alt={`${piece.label} artwork`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3" style={{ color: t.subink }}><ComponentIcon kind={piece.kind} color={t.faint} fill={t.cardSoft} size={48} /><span className="text-[12px]">Open artwork importer</span></div>}
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[14px] font-semibold" style={{ color: t.ink }}>{piece.label}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: t.subink }}><Image className="h-3 w-3" />{piece.image ? 'Custom art uploaded' : 'No custom art yet'}</p>
      </div>
    </button>
    <div className="absolute right-3 top-3 z-20">
      <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex h-8 w-8 items-center justify-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100" style={{ backgroundColor: t.card, color: t.subink }} aria-label={`More options for ${piece.label}`} aria-expanded={menuOpen}><MoreHorizontal className="h-4 w-4" /></button>
      {menuOpen && <>
        <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close artwork menu" />
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} role="menu">
          <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setMenuOpen(false); setImportOpen(true); }} role="menuitem"><Upload className="h-3.5 w-3.5" style={{ color: t.subink }} />{piece.image ? 'Replace file…' : 'Upload artwork…'}</button>
          {piece.image && <>
            <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setMenuOpen(false); onNotice('Artwork preview refreshed'); }} role="menuitem"><RotateCw className="h-3.5 w-3.5" style={{ color: t.subink }} />Refresh preview</button>
            <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={downloadArtwork} role="menuitem"><Download className="h-3.5 w-3.5" style={{ color: t.subink }} />Download artwork</button>
            <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setMenuOpen(false); onNotice('Prepress report prepared'); }} role="menuitem"><FileText className="h-3.5 w-3.5" style={{ color: t.subink }} />Download report</button>
          </>}
        </div>
      </>}
    </div>
  </div>
  {importOpen && <MediaImportDialog t={t} kind="artwork" titleOverride={piece.image ? `Replace ${piece.label}` : `Add ${piece.label}`} onClose={() => setImportOpen(false)} onFiles={(files) => acceptFile(files?.[0])} onUrl={(value) => { onUpload(value); onNotice(`${piece.label} artwork added`); }} />}
  </>;
}

// ─── Task-first Assets surface (the R&D variation) ────────────────────────
type Task = 'Art' | 'Audio' | 'Bonus';
type Product = 'Vinyl' | 'GoodTunes® Player' | 'GoodDeed®';

// Exact applicability matrix. Bonus is its own lane and has no product step.
const PRODUCTS_BY_TASK: Record<Task, Product[]> = {
  Art: ['Vinyl', 'GoodTunes® Player', 'GoodDeed®'],
  Audio: ['Vinyl', 'GoodTunes® Player'],
  Bonus: [],
};

// Quiet contextual line explaining the selected requirement.
function requirementLine(task: Task, product: Product): string {
  if (task === 'Bonus') return 'Optional videos and photos for this release.';
  if (task === 'Art') {
    if (product === 'Vinyl') return 'Vinyl art must meet press-ready production dimensions.';
    if (product === 'GoodTunes® Player') return 'Player art supports the digital player.';
    return 'GoodDeed art is the certificate artwork.';
  }
  if (product === 'Vinyl') return 'Vinyl music follows plant audio standards.';
  return 'Player music controls streaming tracks.';
}

function AssetsTaskFirst({ t, release }: { t: Theme; release: AdminRelease }) {
  const [task, setTask] = useState<Task>('Art');
  const [product, setProduct] = useState<Product>('Vinyl');
  const [vinylArtUploads, setVinylArtUploads] = useState<Record<string, string>>({});
  const [templateOpen, setTemplateOpen] = useState(false);
  const [assetNotice, setAssetNotice] = useState<string | null>(null);
  const artworkKey = (label: string) => `${release.id}:${label}`;

  useEffect(() => {
    if (!assetNotice) return;
    const timer = window.setTimeout(() => setAssetNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [assetNotice]);

  // Behavioral disclosure: switching Art/Audio updates the product choices,
  // retaining the current product only if valid; otherwise fall back to Vinyl.
  const chooseTask = (next: Task) => {
    setTask(next);
    if (next !== 'Bonus') {
      setProduct((current) => (PRODUCTS_BY_TASK[next].includes(current) ? current : 'Vinyl'));
    }
  };

  const products = PRODUCTS_BY_TASK[task];
  const headingProduct = product === 'GoodDeed®' ? 'GoodDeed®' : product;
  const heading = task === 'Bonus'
    ? 'Bonus'
    : product === 'GoodDeed®'
    ? 'GoodDeed®'
    : `${headingProduct} ${task === 'Art' ? 'art' : 'music'}`;

  if (templateOpen) {
    return <section data-testid="release-template-admin-view">
      <ArtistTemplateTest embedded onBack={() => setTemplateOpen(false)} />
    </section>;
  }

  return <div data-testid="assets-task-first">
    {/* One confident primary segment, followed by a deliberately quieter
        product row. Both remain visible so applicability is immediately clear. */}
    <div data-testid="assets-control-stack">
      <p className="mb-2 text-[13px] font-medium" style={{ color: t.subink }}>What are you working on?</p>
      <div className="inline-flex h-10 rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Asset type">
        {(['Art', 'Audio', 'Bonus'] as const).map((lane) => {
          const active = task === lane;
          return <button key={lane} type="button" role="tab" aria-selected={active} onClick={() => chooseTask(lane)} className="h-8 min-w-20 rounded-full px-4 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ backgroundColor: active ? t.card : 'transparent', boxShadow: active ? t.pillShadow : undefined, color: active ? t.ink : t.subink, '--tw-ring-color': t.blue, '--tw-ring-offset-color': t.canvas } as CSSProperties} data-testid={`tab-assets-task-${lane.toLowerCase()}`}>{lane}</button>;
        })}
      </div>

      {task !== 'Bonus' && <div className="mt-4">
        <div>
          <p className="mb-1 text-[12px]" style={{ color: t.faint }}>Choose a product</p>
          <div className="flex flex-wrap items-center gap-5 border-b" style={{ borderColor: t.hairline }} role="tablist" aria-label="Applicable product">
            {products.map((item) => {
              const active = product === item;
              return <button key={item} type="button" role="tab" aria-selected={active} onClick={() => setProduct(item)} className="relative min-h-11 border-b-2 px-0.5 text-[13px] font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ borderColor: active ? t.blue : 'transparent', color: active ? t.ink : t.subink, '--tw-ring-color': t.blue, '--tw-ring-offset-color': t.canvas } as CSSProperties} data-testid={`chip-assets-product-${item.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`}>{item}</button>;
            })}
          </div>
        </div>
      </div>}
    </div>

    {/* Content header + quiet requirement line. */}
    <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>{heading}</h2>
          {product !== 'GoodDeed®' && task === 'Art' && <button type="button" onClick={() => setTemplateOpen(true)} className={cn('inline-flex items-center gap-1 text-[12px] font-medium', t.hoverWash)} style={{ color: t.subink }}><Image className="h-3.5 w-3.5" />Templates</button>}
        </div>
        <p className="mt-1 max-w-2xl text-[12.5px]" style={{ color: t.faint }} data-testid="assets-requirement-line">{requirementLine(task, product)}</p>
      </div>
    </div>

    {/* Full-width content panel — identical panels to Canon. */}
    {task === 'Bonus' ? <div className="mt-5"><PlayerMediaTileCards t={t} /></div>
      : product === 'GoodDeed®' ? <div className="mt-5"><GoodDeedAssetPanel t={t} release={release} /></div>
      : task === 'Audio' && product === 'Vinyl' ? <VinylAudioPanel />
      : task === 'Audio' ? <PlayerAudioPanel t={t} />
      : product === 'Vinyl' ? <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="vinyl-template-grid">
          {[
            { label: 'Cover · jacket', kind: 'jacket' as IconKind, image: release.cover ?? null },
            { label: 'Center labels', kind: 'labels' as IconKind, image: null },
            { label: 'Printed inner sleeve', kind: 'sleeve' as IconKind, image: null },
          ].map((piece) => <VinylArtPieceCard
            key={piece.label}
            piece={{ ...piece, image: vinylArtUploads[artworkKey(piece.label)] ?? piece.image }}
            t={t}
            onReview={() => setTemplateOpen(true)}
            onUpload={(url) => setVinylArtUploads((current) => ({ ...current, [artworkKey(piece.label)]: url }))}
            onNotice={setAssetNotice}
          />)}
        </div>
      : <PlayerArtPanel t={t} release={release} />}

    {assetNotice && <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-full px-4 py-2 text-[12.5px] font-medium shadow-lg" style={{ backgroundColor: t.ink, color: t.canvas }} role="status" data-testid="assets-notice">{assetNotice}</div>}

  </div>;
}

// ─── Current Otis artist shell + release header (Assets active, dark) ─────
const ARTIST_NAV: CanonRoleNavigation = {
  items: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'releases', label: 'Releases', icon: Disc3 },
    { id: 'audience', label: 'Audience', icon: Users },
    { id: 'acquisition', label: 'Acquisition', icon: Megaphone },
    { id: 'orders', label: 'Orders', icon: ShoppingBag },
    { id: 'buyers', label: 'Buyers', icon: UserCheck },
    { id: 'referrals', label: 'Referrals', icon: UserPlus },
    { id: 'shopify', label: 'Shopify', icon: Store },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ],
};

const RELEASE_DETAIL_TABS = ['Dashboard', 'Package', 'Assets', 'Details', 'Store', 'Payments'] as const;

export default function ArtistAssetsTaskFirstVariant() {
  const t = THEMES.dark;
  const release = CALIFORNIALAND;

  const chromeStyle = {
    '--apple-header': t.headerBg,
    '--apple-canvas': t.canvas,
    '--apple-rail': t.rail,
    '--apple-card': t.card,
    '--apple-track': t.cardSoft,
    '--apple-chip': t.cardSoft,
    '--apple-ink': t.ink,
    '--apple-subink': t.subink,
    '--apple-faint': t.faint,
    '--apple-hairline': t.hairline,
    '--brand-blue': t.blue,
    '--background': '240 2% 9%',
    '--foreground': '240 11% 96%',
    '--card': '240 3% 12%',
    '--card-foreground': '240 11% 96%',
    '--muted': '240 4% 16%',
    '--muted-foreground': '240 3% 61%',
    '--border': '240 3% 23%',
    '--popover': '240 3% 12%',
    '--popover-foreground': '240 11% 96%',
  } as CSSProperties;

  const header = <RoleHeader
    className="backdrop-blur-xl"
    identity={<div className="flex min-w-0 items-center gap-2.5">
      <img src={niinaPhoto} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover ring-1" style={{ '--tw-ring-color': t.hairline } as CSSProperties} />
      <span className="truncate text-[15px] font-semibold" data-testid="text-operator-topbar-name">Niina Soleil</span>
    </div>}
  />;

  const railFooter = <>
    <div className="flex-shrink-0 border-t px-2.5 py-2" style={{ borderColor: t.hairline }}>
      <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium', t.hoverWash)} style={{ color: t.subink }} data-testid="role-nav-settings">
        <Cog className="h-4 w-4" style={{ color: t.faint }} />
        <span>Settings</span>
      </button>
    </div>
    <div className="flex flex-shrink-0 items-center gap-2 border-t px-4 py-3" style={{ borderColor: t.hairline }}>
      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>Powered by</span>
      <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
    </div>
  </>;

  return <div className="dark gt-admin-dark"><RoleShell
    header={header}
    rail={<RoleRail navigation={ARTIST_NAV} activeId="releases" footer={railFooter} style={{ width: 256 }} />}
    style={chromeStyle}
  >
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="artist-assets-task-first-variant">
        <div className="mx-auto w-full max-w-[1240px] px-10 pb-24 pt-8">
          {/* Current ReleaseHeader: breadcrumb and plain tabs only. No release artwork/title block. */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }} data-testid="breadcrumbs">
            <button type="button" className="transition-colors hover:opacity-80" data-testid="crumb-releases">Releases</button>
            <span>›</span>
            <span style={{ color: t.subink }}>{release.title}</span>
          </div>

          <div className="flex flex-wrap items-center gap-8" style={{ marginTop: 56 }} role="tablist" aria-label="Release section" data-testid="release-tabbar">
            {RELEASE_DETAIL_TABS.map((item) => {
              const active = item === 'Assets';
              return <button key={item} type="button" role="tab" aria-selected={active} className="whitespace-nowrap text-[15px] transition-colors hover:opacity-90" style={{ color: active ? t.ink : t.subink, fontWeight: active ? 600 : 500, letterSpacing: '0.01em', opacity: active ? 1 : 0.8 }} data-testid={`tab-${item.toLowerCase()}`}>{item}</button>;
            })}
          </div>
          <div style={{ marginTop: 10, marginBottom: 18, borderTop: `1px solid ${t.hairline}` }} />

          <AssetsTaskFirst t={t} release={release} />
        </div>
      </div>
  </RoleShell></div>;
}
