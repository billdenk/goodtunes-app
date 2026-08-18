// ArtistTemplateTest — the ARTIST-side template TEST page. Every art block in
// the Artist portal points here ("Tap any piece to open its test view").
//
// Built VERBATIM from handoff/artist-template-test/ArtistTemplateTest.tsx
// (Ruby, Aug 16 2026) — presentational code copied character-for-character per
// the handoff contract; ONLY the MOCK_ consts were swapped for real data
// (completed print-file scan: GET /api/admin/albums/:id/completed-template,
// which requireOperatorOrAlbumPress already opens to the album's own
// artist/label partners). Route: /artist/albums/:id/art-test/:componentId.
//
// Wiring notes (per Ruby's answers, Aug 16 2026):
// - Data source = the album's completed print-file scan (artist's own art
//   checked against the template), NOT the press's internal test-run history.
// - Entry point (Assets tab art blocks) is a separate upcoming handoff; until
//   then this is reachable by direct URL + a clearly-marked temporary link
//   from the current completed-art surface.
// - The mock-only Sun/Moon appearance toggle was removed per the handoff
//   README ("Otis uses its own theming") — mode reads the operator
//   Light/Dark/System preference via useAdminDark().
// - Overlay chips / layers button / Download test proof / Try another file
//   remain decorative this round (flagged, next wiring pass drives them off
//   the press live-test overlay engine per the README).
//
// Canon: statuses are word + icon (Bill is colorblind), never color alone; real
// GoodTunes(R) with the literal (R); "estimate" never "quote"; sentence case.

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  MinusCircle,
  BadgeCheck,
  Layers,
  Download,
  PenLine,
  ZoomIn,
  Upload,
  Lock,
  Circle,
  ArrowLeftRight,
  History,
  type LucideIcon,
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { uploadAdminDoc } from '@/lib/adminUpload';
import { useToast } from '@/hooks/use-toast';
import { useAdminDark } from '@/lib/adminAppearance';
import { VENDOR_SPECS, type VendorId, type CompletedTemplateConfig, type FinishedComponentSpec } from '@shared/vendorSpecs';
import type { CompletedTemplateComponent, CompletedTemplateVerdict } from '@shared/uploadValidation';

// ─── Theme — dark artist charcoal is the canon default; light for parity. ──
type Theme = {
  canvas: string;
  card: string;
  soft: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  ready: string;
  readyWash: string;
  chipBorder: string;
  hoverCard: string;
  headerBg: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    card: '#ffffff',
    soft: '#f0f0f2',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    ready: '#1c8a5b',
    readyWash: '#eaf5ef',
    chipBorder: '#d9d9de',
    hoverCard: 'hover:bg-slate-100',
    headerBg: 'rgba(255,255,255,0.72)',
  },
  dark: {
    canvas: '#161618',
    card: '#1c1c1f',
    soft: '#2a2a2f',
    ink: '#f5f5f7',
    subink: '#a1a1a6',
    faint: '#6e6e73',
    hairline: '#2e2e33',
    ready: '#3fbf82',
    readyWash: 'rgba(63,191,130,0.12)',
    chipBorder: '#3a3a40',
    hoverCard: 'hover:bg-white/10',
    headerBg: 'rgba(22,22,24,0.72)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// REAL DATA — the handoff's MOCK_ consts, computed from the album's
// completed print-file scan (swap-the-consts rule: everything below maps
// payload → the exact const shapes the JSX reads; JSX itself untouched).
// ═══════════════════════════════════════════════════════════════════

type FileEventRow = {
  id: string;
  componentId: string;
  event: 'uploaded' | 'downloaded' | 'unlocked' | string;
  fileName: string | null;
  dims: string | null;
  result: string | null;
  actorLabel: string | null;
  at: string;
};

type LockState = { locked: boolean; pressName: string | null; downloadedAt: string | null };

type ScanResponse = {
  configured: boolean;
  reason?: string | null;
  vendorId: VendorId | null;
  config: CompletedTemplateConfig;
  requiredComponents: FinishedComponentSpec[];
  components: CompletedTemplateComponent[];
  status: CompletedTemplateVerdict;
  updatedAt: string | null;
  fileEvents?: FileEventRow[];
  locks?: Record<string, LockState>;
};

type CheckTone = 'pass' | 'na';
type CheckRow = { param: string; tone: CheckTone; word: string; detail: string };

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

// ─── Viewer toolbar tabs + overlay chips — mirror the live page verbatim. ────
const VIEW_TABS = ['Full Template', 'Back', 'Front', 'Spine'] as const;
type ViewTab = (typeof VIEW_TABS)[number];
const OVERLAY_CHIPS: Array<{ id: string; label: string; hasCaret?: boolean }> = [
  { id: 'template', label: 'Template off' },
  { id: 'bleed', label: 'Bleed off' },
  { id: 'cut', label: 'Cut off' },
  { id: 'spine', label: 'Spine off' },
  { id: 'front', label: 'Front off', hasCaret: true },
  { id: 'back', label: 'Back off', hasCaret: true },
];

// `embedded` — rendered inside the artist portal's OperatorShell (rails stay
// put; gogoods, Aug 18 2026): the page drops its own full-viewport canvas +
// outer gutters and lets the shell own the chrome. Standalone (no prop) keeps
// the original focused-sheet treatment.
export function ArtistTemplateTest({ embedded = false }: { embedded?: boolean } = {}) {
  const [, params] = useRoute('/artist/albums/:id/art-test/:componentId');
  // Embedded in the portal shell: the shell owns the canvas + gutters.
  const wrapClass = embedded ? '' : 'min-h-[100dvh]';
  const wrapStyle = embedded ? { color: undefined } : undefined;
  const innerPad = embedded ? '8px 0 96px' : '32px 40px 96px';
  const albumId = params?.id ?? '';
  const componentId = params?.componentId ? decodeURIComponent(params.componentId) : '';

  const dark = useAdminDark();
  const mode: 'light' | 'dark' = dark ? 'dark' : 'light';
  const t = THEMES[mode];

  const [view, setView] = useState<ViewTab>('Full Template');
  const [lineArea, setLineArea] = useState<'Line' | 'Area'>('Line');
  const [zoom, setZoom] = useState(100);

  const scan = useQuery<ScanResponse>({
    queryKey: ['/api/admin/albums', albumId, 'completed-template'],
    enabled: !!albumId,
  });
  const { toast } = useToast();

  // Item 1 — "Upload another file": real replace flow. Direct upload to our
  // object storage, then the same measured-check run the press panel uses;
  // a fresh checks card + a new "File history" row come back in the payload.
  const [uploading, setUploading] = useState(false);
  const check = useMutation({
    mutationFn: async (vars: { url: string; fileName: string }) => {
      const r = await apiRequest('POST', `/api/admin/albums/${albumId}/completed-template/check`, {
        componentId,
        url: vars.url,
        fileName: vars.fileName,
      });
      return r.json() as Promise<ScanResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(['/api/admin/albums', albumId, 'completed-template'], resp);
      toast({ title: 'Checked', description: 'Your file was checked against the press template.' });
    },
    onError: (e: any) => toast({ title: "Couldn't replace the file", description: e?.message, variant: 'destructive' }),
  });
  const handleReplaceFile = async (file: File | undefined) => {
    if (!file || uploading || check.isPending) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      check.mutate({ url, fileName: file.name });
    } catch (e: any) {
      toast({ title: e?.message || 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  // Item 3 — production lock, derived server-side from the press-download
  // audit trail (never client-claimed).
  const lock: LockState = scan.data?.locks?.[componentId] ?? { locked: false, pressName: null, downloadedAt: null };
  // Item 2 — file history rows for THIS slot, newest first (server order).
  const history = (scan.data?.fileEvents ?? []).filter((e) => e.componentId === componentId);

  const component = scan.data?.components.find((c) => c.componentId === componentId) ?? null;
  const spec = scan.data?.requiredComponents.find((s) => s.id === componentId) ?? null;
  const vendorLabel = scan.data?.vendorId ? (VENDOR_SPECS[scan.data.vendorId]?.label ?? scan.data.vendorId.toUpperCase()) : '';

  // MOCK_ART equivalent — breadcrumb label, art image, alt.
  const ART = {
    title: component?.label ?? spec?.label ?? 'Art file',
    image: component?.previewUrl ?? null,
    alt: `${component?.label ?? 'Art'} seated in the press template`,
  };

  // MOCK_TEMPLATE equivalent — read-only template facts an artist cares about.
  const TEMPLATE = {
    name: spec?.label ? `${vendorLabel ? `${vendorLabel} \u00b7 ` : ''}${spec.label}` : vendorLabel || 'Press template',
    certifiedDate: fmtDate(scan.data?.updatedAt),
    size: null as string | null, // template artboard size not in the scan payload — omitted, never faked
    uploaded: scan.data?.updatedAt ? `checked ${fmtDate(scan.data.updatedAt)}` : '',
    artFilename: component?.fileName ?? '',
  };

  // MOCK_TEST_FILE equivalent.
  const TEST_FILE = component?.fileName ?? '';

  // MOCK_CHECKS equivalent — word + icon per row, never color alone. Real
  // statuses beyond the handoff's pass|na keep the na visual grammar with an
  // honest word (Flagged / Unverified) — flagged to Ruby for the next round.
  const CHECKS: CheckRow[] = (component?.checks ?? []).map((c) => ({
    param: c.label,
    tone: c.status === 'pass' && c.tier !== 'advisory' ? 'pass' : 'na',
    word:
      c.tier === 'advisory' ? 'Advisory'
        : c.status === 'pass' ? 'Pass'
        : c.status === 'unverified' ? 'Unverified'
        : 'Flagged',
    detail: c.message,
  }));
  const allPass = CHECKS.length > 0 && CHECKS.every((r) => r.tone === 'pass' || r.word === 'Advisory');

  // Loading / error / not-found are explicit — the full page only renders on
  // a successful response that actually contains the requested component.
  // "No test found" is reserved for a SUCCESSFUL read missing the component;
  // an access or server failure says so honestly instead.
  if (!component) {
    const message = scan.isLoading
      ? 'Loading\u2026'
      : scan.isError
        ? "This test couldn't be loaded. You may not have access to this release, or something went wrong \u2014 try again."
        : 'No test found for this art file yet.';
    return (
      <div className={wrapClass} style={{ background: embedded ? undefined : t.canvas, color: t.ink, ...wrapStyle }} data-testid="artist-template-test">
        <div className="mx-auto w-full" style={{ maxWidth: 1080, padding: innerPad }}>
          <nav aria-label="breadcrumb" data-testid="breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
              <li className="inline-flex items-center">
                <a href={`/artist/albums/${albumId}`} className="transition-opacity hover:opacity-80" data-testid="link-back-assets">Assets</a>
              </li>
            </ol>
          </nav>
          <p className="text-[13.5px]" style={{ marginTop: 16, color: t.subink }} data-testid={scan.isLoading ? 'state-loading' : scan.isError ? 'state-error' : 'state-not-found'}>
            {message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClass} style={{ background: embedded ? undefined : t.canvas, color: t.ink, ...wrapStyle }} data-testid="artist-template-test">
      <div className="mx-auto w-full" style={{ maxWidth: 1080, padding: innerPad }}>
        {/* 1 · Breadcrumb — back into the release Assets (artist grammar). */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center">
              <a href={`/artist/albums/${albumId}`} className="transition-opacity hover:opacity-80" data-testid="link-back-assets">Assets</a>
            </li>
            <li aria-hidden><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>{ART.title}</span></li>
          </ol>
        </nav>

        {/* 2 · Headline — two-tone, same typographic treatment as the live page.
            Artist copy: they upload ART only, never press templates or GT layers. */}
        <h1 style={{ marginTop: 12, fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
          <span style={{ color: t.ink }}>Test. </span>
          <span style={{ color: t.subink, fontWeight: 500 }}>Certify.</span>
        </h1>
        <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
          Your art, seated in the press template. The overlays below are read straight from the
          template so you can see exactly how the art will trim, fold, and print &mdash; before it goes to press.
        </p>

        {/* 3 · Upload / check card — resting PASSED state (collapsed), per
            screenshot 3. Check-circle + "Pass! All measured checks passed" +
            "5 of 5 passed" + filename; chevron to expand the rows; "Try another
            file" quiet action bottom-right when open. */}
        <UploadCard
          t={t}
          rows={CHECKS}
          fileName={TEST_FILE}
          allPass={allPass}
          lock={lock}
          busy={uploading || check.isPending}
          onReplaceFile={handleReplaceFile}
        />

        {/* 4b · File history — upload/download audit trail (Item 2). */}
        <HistoryCard t={t} rows={history} />

        {/* 4 · Template header card — read-only facts an artist cares about.
            Press-internal lines + Cancel/Save removed. */}
        <div className="rounded-2xl" style={{ marginTop: 16, padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="template-header">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{TEMPLATE.name}</h2>
            {allPass && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: t.ready }} data-testid="badge-certified">
                <BadgeCheck className="w-4 h-4" /> Certified
              </span>
            )}
            <span className="text-[13px]" style={{ color: t.faint }}>{TEMPLATE.certifiedDate}</span>
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.faint }}>
            {TEMPLATE.size ? <>{TEMPLATE.size} &middot; </> : null}{TEMPLATE.uploaded}{TEMPLATE.artFilename ? <> &middot; art: {TEMPLATE.artFilename}</> : null}
          </p>
        </div>

        {/* 5 · Viewer toolbar — segmented view tabs left; artist-quiet actions
            right (layers view + Download test proof; press •••/Save removed). */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
          <div className="inline-flex items-center rounded-full p-0.5" style={{ background: t.soft, border: `1px solid ${t.hairline}` }} data-testid="view-tabs" role="tablist">
            {VIEW_TABS.map((tab) => {
              const active = tab === view;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(tab)}
                  className="h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap"
                  style={{ color: active ? t.ink : t.subink, background: active ? t.card : 'transparent', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.18)' : undefined }}
                  data-testid={`view-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)} style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.subink }} data-testid="button-layers" aria-label="Layers view">
              <Layers className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
              style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
              data-testid="button-download-proof"
            >
              <Download className="w-4 h-4 flex-shrink-0" /> Download test proof
            </button>
          </div>
        </div>

        {/* 6 · Overlay-chip row — toggle chips left; Line|Area seg + zoom right.
            Matches the live page (this replaces the invented slider UI). */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 14 }}>
          <div className="flex items-center gap-2 flex-wrap" data-testid="overlay-chips">
            {OVERLAY_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn('inline-flex items-center gap-1.5 h-7 rounded-full text-[12px] font-medium transition-colors', t.hoverCard)}
                style={{ padding: c.hasCaret ? '0 8px 0 10px' : '0 12px', color: t.subink, border: `1px solid ${t.chipBorder}` }}
                data-testid={`overlay-${c.id}`}
              >
                <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, border: `1.5px solid ${t.faint}` }} />
                {c.label}
                {c.hasCaret && <ChevronDown className="w-3.5 h-3.5" style={{ color: t.faint }} />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* Line | Area segmented */}
            <div className="inline-flex items-center rounded-full p-0.5" style={{ background: t.soft, border: `1px solid ${t.hairline}` }} data-testid="line-area">
              {(['Line', 'Area'] as const).map((opt) => {
                const active = opt === lineArea;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setLineArea(opt)}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-medium transition-colors"
                    style={{ color: active ? t.ink : t.subink, background: active ? t.card : 'transparent', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.18)' : undefined }}
                    data-testid={`la-${opt.toLowerCase()}`}
                  >
                    {opt === 'Line' && <PenLine className="w-3.5 h-3.5" />}
                    {opt === 'Area' && <Layers className="w-3.5 h-3.5" />}
                    {opt}
                  </button>
                );
              })}
            </div>
            {/* Zoom − 100% + */}
            <div className="inline-flex items-center gap-1 rounded-full" style={{ padding: '0 4px', border: `1px solid ${t.hairline}` }} data-testid="zoom">
              <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 10))} className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)} style={{ width: 28, height: 28, color: t.subink }} data-testid="button-zoom-out" aria-label="Zoom out">
                <span className="text-[16px] leading-none" style={{ marginTop: -1 }}>&minus;</span>
              </button>
              <span className="inline-flex items-center gap-1 text-[12.5px] font-medium tabular-nums" style={{ color: t.subink, minWidth: 52, justifyContent: 'center' }}>
                <ZoomIn className="w-3.5 h-3.5" style={{ color: t.faint }} /> {zoom}%
              </span>
              <button type="button" onClick={() => setZoom((z) => Math.min(200, z + 10))} className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)} style={{ width: 28, height: 28, color: t.subink }} data-testid="button-zoom-in" aria-label="Zoom in">
                <span className="text-[15px] leading-none">+</span>
              </button>
            </div>
          </div>
        </div>

        {/* 7 · Big white canvas — the art seated in it (wide, not square),
            zoom-scaled. Server first-page raster when one exists — honest
            empty canvas otherwise, never a fake. */}
        <div
          className="w-full overflow-hidden rounded-2xl flex items-center justify-center"
          style={{ marginTop: 14, background: '#ffffff', border: `1px solid ${t.hairline}`, padding: '56px 40px' }}
          data-testid="template-canvas"
        >
          {ART.image ? (
            <img
              src={ART.image}
              alt={ART.alt}
              className="w-full h-auto"
              style={{ maxWidth: `${zoom}%`, transition: 'max-width 0.1s linear' }}
              data-testid="canvas-art"
            />
          ) : (
            <p className="text-[13px]" style={{ color: '#6e6e73', padding: '48px 0' }} data-testid="canvas-no-preview">
              No preview could be generated for this file.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// The upload / check card. Resting state = collapsed PASS summary (screenshot 3);
// expanding shows the check rows + the "Upload another file" replace affordance
// (mirrors the press upload treatment). When the press has downloaded the file
// for production, the footer flips to a locked banner and the upload pill
// disables (word + icon, never color alone).
function UploadCard({
  t,
  rows,
  fileName,
  allPass,
  lock,
  busy,
  onReplaceFile,
}: {
  t: Theme;
  rows: CheckRow[];
  fileName: string;
  allPass: boolean;
  lock: LockState;
  busy: boolean;
  onReplaceFile: (file: File | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const passed = rows.filter((r) => r.tone === 'pass').length;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ marginTop: 22, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="upload-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn('w-full flex items-center gap-3 text-left transition-colors', t.hoverCard)}
        style={{ padding: '16px 20px' }}
        data-testid="upload-summary"
      >
        {allPass
          ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: t.ready }} aria-hidden />
          : <MinusCircle className="w-5 h-5 flex-shrink-0" style={{ color: t.faint }} aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="text-[14px] font-semibold" style={{ color: t.ink }}>
            {allPass ? 'Pass! All measured checks passed ' : 'Checks need attention '}
          </span>
          <span className="text-[13px]" style={{ color: t.subink }}>{passed} of {rows.length} passed</span>
          <span className="block text-[12.5px] truncate" style={{ marginTop: 2, color: t.faint }}>
            {fileName}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: t.faint, transform: open ? 'rotate(180deg)' : undefined }} aria-hidden />
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${t.hairline}` }} data-testid="upload-rows">
          {rows.map((r, i) => {
            const color = r.tone === 'pass' ? t.ready : t.faint;
            const Icon = r.tone === 'pass' ? CheckCircle2 : MinusCircle;
            const word = r.word;
            return (
              <div key={r.param} className="flex items-start gap-3" style={{ padding: '14px 20px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }} data-testid={`row-${r.param.toLowerCase().replace(/[\s&]+/g, '-')}`}>
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 1 }} aria-hidden />
                <div className="min-w-0">
                  <div className="text-[13px]">
                    <span className="font-semibold" style={{ color: t.ink }}>{r.param} </span>
                    <span className="font-semibold" style={{ color }}>{word}</span>
                  </div>
                  <div className="text-[12.5px]" style={{ marginTop: 2, color: t.subink }}>{r.detail}</div>
                </div>
              </div>
            );
          })}
          {/* Footer — replace affordance, or the locked-for-production banner
              once the press has downloaded the file (Items 1 + 3). */}
          {lock.locked ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ padding: '14px 20px', borderTop: `1px solid ${t.hairline}` }} data-testid="locked-banner">
              <div className="flex items-start gap-2.5 min-w-0">
                <Lock className="w-4 h-4 flex-shrink-0" style={{ color: t.subink, marginTop: 1 }} aria-hidden />
                <p className="text-[12.5px]" style={{ color: t.subink, lineHeight: 1.5 }}>
                  <span className="font-semibold" style={{ color: t.ink }}>Locked for production</span>
                  {' \u2014 '}{lock.pressName ?? 'The press'} downloaded this file {fmtWhen(lock.downloadedAt)}. Ask them to unlock it if you need to replace it.
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium flex-shrink-0"
                style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.faint, cursor: 'not-allowed', opacity: 0.6 }}
                aria-disabled="true"
                data-testid="button-upload-another-disabled"
              >
                <Lock className="w-4 h-4 flex-shrink-0" /> Upload locked
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3" style={{ padding: '12px 20px', borderTop: `1px solid ${t.hairline}` }}>
              <span className="text-[12px]" style={{ color: t.faint }}>Replaces the current file and re-runs the checks.</span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => onReplaceFile(e.target.files?.[0])}
                data-testid="input-replace-file"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors flex-shrink-0', !busy && t.hoverCard)}
                style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.ink, opacity: busy ? 0.6 : undefined }}
                data-testid="button-upload-another"
              >
                <Upload className="w-4 h-4 flex-shrink-0" /> {busy ? 'Checking\u2026' : 'Upload another file'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// "Aug 17 at 9:12 AM" — the handoff's history/lock timestamp grammar.
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

// File history card (Item 2) — the upload/download audit trail. Canon list rows,
// faint text, word + icon result on every row; newest first. The newest upload
// is "Current"; prior uploads show their check result; press downloads are
// their own event rows. Nothing is ever deleted.
function HistoryCard({ t, rows }: { t: Theme; rows: FileEventRow[] }) {
  if (rows.length === 0) return null;
  const firstUploadIdx = rows.findIndex((r) => r.event === 'uploaded');
  const meta = (row: FileEventRow, i: number): { word: string; icon: LucideIcon; color: string; fillDot?: boolean } => {
    if (row.event === 'downloaded') return { word: 'Downloaded by press', icon: Download, color: t.subink };
    if (row.event === 'unlocked') return { word: 'Unlocked by press', icon: Lock, color: t.subink };
    if (i === firstUploadIdx) return { word: 'Current', icon: Circle, color: t.ready, fillDot: true };
    if (row.result === 'pass') return { word: 'Passed', icon: CheckCircle2, color: t.subink };
    return { word: 'Replaced', icon: ArrowLeftRight, color: t.faint };
  };
  return (
    <div className="rounded-2xl overflow-hidden" style={{ marginTop: 16, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="file-history">
      <div className="flex items-center gap-2" style={{ padding: '14px 20px', borderBottom: `1px solid ${t.hairline}` }}>
        <History className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} aria-hidden />
        <h2 className="text-[14px] font-semibold" style={{ color: t.ink }}>File history</h2>
        <span className="text-[12.5px]" style={{ color: t.faint }}>every upload and download, newest first</span>
      </div>
      {rows.map((h, i) => {
        const m = meta(h, i);
        const Icon = m.icon;
        return (
          <div key={h.id} className="flex items-center justify-between gap-4" style={{ padding: '12px 20px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }} data-testid={`history-row-${h.id}`}>
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate" style={{ color: t.ink }}>{h.fileName ?? 'File'}</div>
              <div className="text-[12px]" style={{ marginTop: 2, color: t.faint }}>{h.dims ? <>{h.dims} &middot; </> : null}{fmtWhen(h.at)}</div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold flex-shrink-0" style={{ color: m.color }} data-testid={`history-status-${h.event}`}>
              <Icon className="w-3.5 h-3.5 flex-shrink-0" style={m.fillDot ? { fill: m.color } : undefined} aria-hidden />
              {m.word}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default ArtistTemplateTest;
