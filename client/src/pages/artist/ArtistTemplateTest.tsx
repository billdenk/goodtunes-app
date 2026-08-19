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
// - Task #3184: the viewer is now REAL — the matched press template PDF is
//   fetched (artist-scoped route), rendered client-side via the shared
//   gtOverlayEngine + TemplateArtViewer (the same pdf.js + GT-layer engine the
//   press live-test page uses), and the artist's checked art is seated at its
//   measured placement with working view tabs, zone chips, Line/Area, zoom,
//   layers popover, and a functional Download test proof. Uploads report real
//   XHR progress (thin determinate bar → "Measuring…"), matching press canon.
//
// Canon: statuses are word + icon (Bill is colorblind), never color alone; real
// GoodTunes(R) with the literal (R); "estimate" never "quote"; sentence case.

import { useEffect, useRef, useState } from 'react';
import type * as pdfjsTypes from 'pdfjs-dist';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  MinusCircle,
  BadgeCheck,
  Download,
  Upload,
  UploadCloud,
  Lock,
  Circle,
  ArrowLeftRight,
  History,
  X,
  Clock,
  ImagePlus,
  LayoutTemplate,
  CircleDashed,
  ArrowRight,
  MoreHorizontal,
  Check,
  FileImage,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { uploadAdminDocWithProgress } from '@/lib/adminUpload';
import { loadPdfjs, renderPage, extractGtLayers } from '@/pages/press-templates/gtOverlayEngine';
import { TemplateArtViewer, type ViewerTemplate, type ViewerArt } from '@/pages/press-templates/TemplateArtViewer';
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
  blue: string;
  dashed: string;
  dot: string;
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
    blue: '#0071e3',
    dashed: '#c9c9cf',
    dot: '#d0d0d5',
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
    blue: '#319ed8',
    dashed: '#46464d',
    dot: '#46464d',
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

// (The decorative VIEW_TABS/OVERLAY_CHIPS consts are gone — the viewer's
// controls are now driven by the template's real measured layers, Task #3184.)

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

  const scan = useQuery<ScanResponse>({
    queryKey: ['/api/admin/albums', albumId, 'completed-template'],
    enabled: !!albumId,
  });
  const { toast } = useToast();

  // Item 1 — "Upload another file": real replace flow. Direct upload to our
  // object storage, then the same measured-check run the press panel uses;
  // a fresh checks card + a new "File history" row come back in the payload.
  const [uploading, setUploading] = useState(false);
  // File history is revealed from the toolbar History icon (same as the press
  // side), not a standing card (Ruby's Aug 18 handoff).
  const [showHistory, setShowHistory] = useState(false);
  // The upload/check card's expanded state is lifted so the toolbar "Replace"
  // pill can open it (the replace affordance is otherwise invisible while the
  // check card is collapsed — Bill, Aug 18 2026).
  const [uploadOpen, setUploadOpen] = useState(false);
  // Whether the actual drag-drop upload box is showing in the card footer. The
  // toolbar Replace takes the artist straight to it — one click, no intermediate
  // buttons (Bill, Aug 18 2026 late: "This should just show me the upload box.").
  const [showDrop, setShowDrop] = useState(false);
  // Real upload progress (0..1) for the thin determinate bar — null when no
  // upload is in flight (Task #3184; press live-test canon).
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  // Ruby's Aug 19 restructure handoff: the toolbar Replace pill opens a small
  // CHOOSER (Full template vs A single panel) instead of jumping straight to
  // the drop box (supersedes the Aug 18 one-click ruling). Real uploads are
  // always full-template today, so 'template' is the default; the single-panel
  // path is a deliberate quiet dead-end until Ruby designs its ending
  // (gogoods, Aug 19 2026: "visual-only").
  const [showReplace, setShowReplace] = useState(false);
  const [replaceMethod, setReplaceMethod] = useState<'template' | 'images'>('template');
  const [replacePanel, setReplacePanel] = useState<RawPanelId>('front');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
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
      setShowDrop(false);
      setUploadOpen(true);
      toast({ title: 'Checked', description: 'Your file was checked against the press template.' });
    },
    onError: (e: any) => toast({ title: "Couldn't replace the file", description: e?.message, variant: 'destructive' }),
  });
  const handleReplaceFile = async (file: File | undefined) => {
    if (!file || uploading || check.isPending) return;
    setUploading(true);
    setUploadPct(0);
    try {
      const url = await uploadAdminDocWithProgress(file, (f) => setUploadPct(f));
      check.mutate({ url, fileName: file.name });
    } catch (e: any) {
      toast({ title: e?.message || 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadPct(null);
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

  // ── Task #3184: load the matched press template PDF (artist-scoped server
  // route — the componentId only resolves within THIS album's own specs) and
  // measure its GT layers client-side, exactly like the press live-test page.
  const [tpl, setTpl] = useState<{ template: ViewerTemplate; doc: pdfjsTypes.PDFDocumentProxy; blob: Blob } | null>(null);
  const [tplState, setTplState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [tplError, setTplError] = useState<string | null>(null);
  const hasTemplateFile = !!spec?.templateFileUrl;
  useEffect(() => {
    if (!albumId || !componentId || !hasTemplateFile) { setTpl(null); setTplState('idle'); return; }
    let cancelled = false;
    setTplState('loading'); setTplError(null);
    void (async () => {
      try {
        const r = await apiRequest('GET', `/api/admin/albums/${albumId}/completed-template/template-file/${encodeURIComponent(componentId)}`);
        const blob = await r.blob();
        const doc = await (await loadPdfjs()).getDocument({ data: await blob.arrayBuffer() }).promise;
        const [{ img, wMm, hMm }, { layers }] = [await renderPage(doc, 1), await extractGtLayers(doc, 1)];
        if (cancelled) return;
        setTpl({ template: { img, wMm, hMm, layers }, doc, blob });
        setTplState('ready');
      } catch (e: any) {
        if (cancelled) return;
        setTpl(null);
        setTplState('error');
        // apiRequest throws "422: {json}" — surface the honest message.
        const raw = typeof e?.message === 'string' ? e.message : '';
        const m = raw.match(/"message"\s*:\s*"([^"]+)"/);
        setTplError(m?.[1] ?? "The press template couldn't be loaded right now.");
      }
    })();
    return () => { cancelled = true; };
  }, [albumId, componentId, hasTemplateFile]);

  // Download the template the artist is designing into (task: "view AND
  // download"). Served from the already-fetched blob so auth headers never
  // matter for the anchor.
  const downloadTemplate = () => {
    if (!tpl) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(tpl.blob);
    a.download = `${(spec?.label ?? 'press-template').replace(/[^\w\- ]+/g, '')}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  };

  // ── The artist's checked art, at real measured size where possible: own
  // stored PDF → pdf.js render with mm; otherwise the server preview raster
  // (contain-fit by pixel aspect); otherwise an honest "no preview".
  const [art, setArt] = useState<ViewerArt>(null);
  const assetUrl = component?.assetUrl ?? null;
  const previewUrl = component?.previewUrl ?? null;
  const artFileName = component?.fileName ?? null;
  useEffect(() => {
    let cancelled = false;
    setArt(null);
    void (async () => {
      if (assetUrl && /^\/objects\//.test(assetUrl) && /\.pdf(\?|$)/i.test(assetUrl)) {
        try {
          const r = await fetch(assetUrl, { credentials: 'include' });
          if (r.ok) {
            const doc = await (await loadPdfjs()).getDocument({ data: await r.arrayBuffer() }).promise;
            const { img, wMm, hMm } = await renderPage(doc, 1);
            if (!cancelled) setArt({ name: artFileName ?? 'Art', img, wMm, hMm });
            return;
          }
        } catch {
          // fall through to the server preview raster
        }
      }
      if (previewUrl) {
        const image = new Image();
        image.onload = () => {
          if (!cancelled) setArt({ name: artFileName ?? 'Art', img: previewUrl, wMm: null, hMm: null, pxAspect: image.naturalWidth / Math.max(1, image.naturalHeight) });
        };
        image.onerror = () => {
          if (!cancelled) setArt({ name: artFileName ?? 'Art', img: previewUrl, wMm: null, hMm: null });
        };
        image.src = previewUrl;
      }
    })();
    return () => { cancelled = true; };
  }, [assetUrl, previewUrl, artFileName]);

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
    size: tpl ? `${tpl.template.wMm.toFixed(1)} × ${tpl.template.hMm.toFixed(1)} mm` : null, // measured live off the template PDF — never faked
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

  // Loading / error / unknown-slot states are explicit. A KNOWN slot with no
  // upload yet renders the full page in its "Pending — not tested yet" state
  // (PendingCard + raw template; Ruby's Aug 18 handoff) instead of a dead end.
  if (!component && (scan.isLoading || scan.isError || !spec)) {
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

  const hasArt = !!component;

  // ── Toolbar actions (Ruby's Aug 18 handoff) — permanent architecture: the
  // same buttons in every state, disabled-faint until applicable. Rendered
  // inside TemplateArtViewer's right cluster when the viewer is live, or in a
  // standalone toolbar row when it isn't.
  const toolbarActions = (
    <>
      {/* History icon — reveals the File-history popover (same as the press
          Test/Certify surface). Only meaningful once there's art. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { if (hasArt) setShowHistory((v) => !v); }}
          aria-disabled={!hasArt}
          aria-expanded={hasArt ? showHistory : undefined}
          aria-haspopup="dialog"
          className={cn('inline-flex items-center justify-center rounded-full transition-colors', hasArt && t.hoverCard)}
          style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: hasArt ? t.subink : t.faint, opacity: hasArt ? 1 : 0.55, cursor: hasArt ? 'pointer' : 'not-allowed' }}
          data-testid="button-history"
          aria-label="File history"
          title="File history"
        >
          <History className="w-4 h-4" />
        </button>
        {hasArt && showHistory && <HistoryPanel t={t} rows={history} onClose={() => setShowHistory(false)} />}
      </div>
      {/* Replace — opens the Replace CHOOSER (Full template vs A single panel;
          Ruby's Aug 19 restructure handoff, supersedes the Aug 18 one-click
          ruling). 'Full template' continues into the real drop box; 'A single
          panel' is a deliberate quiet dead-end until Ruby designs its ending.
          When locked for production, becomes a disabled Lock pill. */}
      {hasArt && (lock.locked ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium"
          style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.faint, opacity: 0.6, cursor: 'not-allowed' }}
          aria-disabled="true"
          data-testid="button-replace-locked"
        >
          <Lock className="w-4 h-4 flex-shrink-0" /> Upload locked
        </span>
      ) : (
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => { setReplaceMethod('template'); setReplacePanel('front'); setShowReplace(true); }}
            aria-haspopup="dialog"
            aria-expanded={showReplace}
            className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
            style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
            data-testid="button-replace"
            aria-label="Replace file"
            title="Replace file"
          >
            <Upload className="w-4 h-4 flex-shrink-0" /> Replace
          </button>
          {showReplace && (
            <ReplaceChooser
              t={t}
              method={replaceMethod}
              panel={replacePanel}
              onMethod={setReplaceMethod}
              onPanel={setReplacePanel}
              onCancel={() => setShowReplace(false)}
              onConfirm={() => {
                setShowReplace(false);
                if (replaceMethod === 'template') { setUploadOpen(true); setShowDrop(true); }
                /* 'images' — quiet dead-end (gogoods, Aug 19 2026). */
              }}
            />
          )}
        </div>
      ))}

      {/* ••• overflow — canon white rounded-xl menu: File history / Download
          raw template (Ruby's Aug 19 handoff FILE_MENU). */}
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setFileMenuOpen((v) => !v)}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={fileMenuOpen}
          className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)}
          style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.subink }}
          data-testid="button-file-overflow"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {fileMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setFileMenuOpen(false)} data-testid="file-menu-backdrop" />
            <div
              className="absolute z-20 rounded-xl overflow-hidden"
              style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 216, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}
              role="menu"
              data-testid="file-menu-list"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setFileMenuOpen(false); if (hasArt) setShowHistory(true); }}
                aria-disabled={!hasArt}
                className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', hasArt && t.hoverCard)}
                style={{ padding: '10px 14px', color: hasArt ? t.ink : t.faint, cursor: hasArt ? 'pointer' : 'not-allowed' }}
                data-testid="file-menu-history"
              >
                <History className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> File history
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setFileMenuOpen(false); if (tpl) downloadTemplate(); }}
                aria-disabled={!tpl}
                className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', !!tpl && t.hoverCard)}
                style={{ padding: '10px 14px', color: tpl ? t.ink : t.faint, borderTop: `1px solid ${t.hairline}`, cursor: tpl ? 'pointer' : 'not-allowed' }}
                data-testid="file-menu-download"
              >
                <Download className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> Download raw template
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  // ── No art yet: the GOLDENROD raw-template flow (Ruby's Aug 19 restructure
  // handoff). Full-template drops are REAL (same upload + measured check as a
  // replace); per-panel uploads seat art locally and end honestly — "Art
  // seated · not yet measured", never a green Passed (Ruby's Aug 19 ending).
  if (!hasArt) {
    return (
      <div className={wrapClass} style={{ background: embedded ? undefined : t.canvas, color: t.ink, ...wrapStyle }} data-testid="artist-template-test">
        <div className="mx-auto w-full" style={{ maxWidth: 1080, padding: innerPad }}>
          <nav aria-label="breadcrumb" data-testid="breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
              <li className="inline-flex items-center">
                <a href={`/artist/albums/${albumId}`} className="transition-opacity hover:opacity-80" data-testid="link-back-assets">Assets</a>
              </li>
              <li aria-hidden><ChevronRight className="w-3.5 h-3.5" /></li>
              <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>{ART.title}</span></li>
            </ol>
          </nav>
          <RawFlow
            t={t}
            pieceLabel={spec?.label ?? 'This piece'}
            templateName={TEMPLATE.name}
            specLine={TEMPLATE.size ? `${TEMPLATE.size} bleed \u00b7 CMYK \u00b7 300 PPI+` : 'Checked against the press spec the moment it lands.'}
            tplImg={tpl?.template.img ?? null}
            tplAspect={tpl ? tpl.template.wMm / tpl.template.hMm : null}
            tplState={tplState}
            tplError={tplError}
            hasTemplateFile={hasTemplateFile}
            busy={uploading || check.isPending}
            uploadPct={uploadPct}
            measuring={check.isPending}
            onUploadFile={handleReplaceFile}
            onCheckUrl={(url) => check.mutate({ url, fileName: url.split('/').pop() || 'art.pdf' })}
            onDownloadTemplate={downloadTemplate}
            canDownload={!!tpl}
            historyRows={history}
          />
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
            uploadPct={uploadPct}
            measuring={check.isPending}
            onReplaceFile={handleReplaceFile}
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            showDrop={showDrop}
            onShowDropChange={setShowDrop}
          />

        {/* File history is no longer a standing card — it's revealed from the
            toolbar History icon in the viewer toolbar (Ruby's Aug 18 handoff). */}

        {/* 4 · Template header card — read-only facts an artist cares about.
            Press-internal lines + Cancel/Save removed. */}
        <div className="rounded-2xl" style={{ marginTop: 16, padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="template-header">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{TEMPLATE.name}</h2>
            {tpl && (
              <button
                type="button"
                onClick={downloadTemplate}
                className={cn('inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium transition-colors', t.hoverCard)}
                style={{ padding: '4px 12px', border: `1px solid ${t.hairline}`, color: t.subink }}
                data-testid="button-download-template"
              >
                <Download className="w-3.5 h-3.5 flex-shrink-0" /> Download template
              </button>
            )}
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

        {/* 5–7 · The REAL viewer (Task #3184) — press template + art + GT
            overlays via the shared TemplateArtViewer (same engine as the press
            live-test page). Honest states when the template can't load. */}
        {tplState === 'loading' && (
          <p className="text-[13px]" style={{ marginTop: 20, color: t.faint }} data-testid="template-loading">
            Loading the press template&hellip;
          </p>
        )}
        {tplState === 'error' && (
          <p className="text-[13px]" style={{ marginTop: 20, color: t.subink }} data-testid="template-error">
            {tplError}
          </p>
        )}
        {tplState === 'idle' && !hasTemplateFile && (
          <p className="text-[13px]" style={{ marginTop: 20, color: t.subink }} data-testid="template-missing">
            The press hasn&rsquo;t attached a template file for this piece yet &mdash; the checks above still ran against its measured specs.
          </p>
        )}
        {tpl ? (
          <TemplateArtViewer
            template={tpl.template}
            pdfDoc={tpl.doc}
            art={art}
            dark={mode === 'dark'}
            t={{ card: t.card, soft: t.soft, hairline: t.hairline, ink: t.ink, subink: t.subink, faint: t.faint, blue: t.blue }}
            proofName={hasArt ? (component?.fileName ?? spec?.label ?? 'art-test') : undefined}
            actions={toolbarActions}
          />
        ) : (
          /* No template PDF to seat the art in — permanent toolbar row, then
             the art raster alone (previous behavior), the raw-template
             upload panels (no art yet), or the honest no-preview message. */
          <>
            <div className="flex items-center justify-end gap-2 flex-wrap" style={{ marginTop: 16 }}>
              {toolbarActions}
            </div>
            <div
              className="w-full overflow-hidden rounded-2xl flex items-center justify-center"
              style={{ marginTop: 14, background: '#ffffff', border: `1px solid ${t.hairline}`, padding: '56px 40px' }}
              data-testid="template-canvas"
            >
              {ART.image ? (
                <img src={ART.image} alt={ART.alt} className="w-full h-auto" data-testid="canvas-art" />
              ) : (
                <p className="text-[13px]" style={{ color: '#6e6e73', padding: '48px 0' }} data-testid="canvas-no-preview">
                  No preview could be generated for this file.
                </p>
              )}
            </div>
          </>
        )}
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
  uploadPct,
  measuring,
  onReplaceFile,
  open,
  onOpenChange,
  showDrop,
  onShowDropChange,
}: {
  t: Theme;
  rows: CheckRow[];
  fileName: string;
  allPass: boolean;
  lock: LockState;
  busy: boolean;
  /** 0..1 while the file's bytes stream up; null otherwise (Task #3184). */
  uploadPct: number | null;
  /** True while the server measures the uploaded file. */
  measuring: boolean;
  onReplaceFile: (file: File | undefined) => void;
  /** Lifted so the toolbar Replace pill can open the card (Aug 18 handoff). */
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Whether the drag-drop upload box is showing in the footer. */
  showDrop: boolean;
  onShowDropChange: (v: boolean) => void;
}) {
  const setOpen = (fn: (v: boolean) => boolean) => onOpenChange(fn(open));
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
          ) : showDrop && !busy ? (
            /* The actual drag-drop upload box — shown in one click from the
               toolbar Replace pill (or the footer button). No intermediate step:
               the drop target is visible and ready. */
            <div style={{ padding: '16px 20px', borderTop: `1px solid ${t.hairline}` }} data-testid="replace-dropbox">
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
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onReplaceFile(e.dataTransfer.files?.[0]); }}
                className="w-full flex flex-col items-center justify-center text-center gap-2 rounded-xl transition-colors"
                style={{ padding: '28px 20px', border: `2px dashed ${t.hairline}`, background: t.soft, color: t.subink }}
                data-testid="upload-dropzone"
              >
                <UploadCloud className="w-7 h-7" style={{ color: t.subink, strokeWidth: 1.5 }} aria-hidden />
                <span className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Drag &amp; drop your new art here</span>
                <span className="text-[12px]" style={{ color: t.faint }}>or click to upload &mdash; replaces the current file and re-runs the checks</span>
              </button>
              <div className="flex justify-end" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => onShowDropChange(false)}
                  className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
                  style={{ padding: '6px 14px', border: `1px solid ${t.hairline}`, color: t.subink }}
                  data-testid="button-cancel-replace"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3" style={{ padding: '12px 20px', borderTop: `1px solid ${t.hairline}` }}>
              {busy ? (
                /* Apple-canon thin progress (press live-test treatment):
                   determinate while the bytes stream up, gentle pulse while
                   the server measures — never a bare "Checking…" button. */
                <span className="min-w-0 flex-1" data-testid="upload-progress">
                  <style>{`@keyframes gt-ink-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
                  <span className="block text-[12px] font-medium" style={{ color: t.subink, animation: measuring && uploadPct === null ? 'gt-ink-pulse 1.4s ease-in-out infinite' : undefined }}>
                    {uploadPct !== null ? `Uploading\u2026 ${Math.round(uploadPct * 100)}%` : 'Measuring\u2026'}
                  </span>
                  <span className="block rounded-full overflow-hidden" style={{ marginTop: 6, height: 3, backgroundColor: t.soft }}>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        backgroundColor: t.blue,
                        width: uploadPct !== null ? `${Math.round(uploadPct * 100)}%` : '100%',
                        transition: 'width 160ms ease-out',
                        animation: uploadPct === null ? 'gt-ink-pulse 1.4s ease-in-out infinite' : undefined,
                      }}
                    />
                  </span>
                </span>
              ) : (
                <span className="text-[12px]" style={{ color: t.faint }}>Replaces the current file and re-runs the checks.</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onShowDropChange(true)}
                className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors flex-shrink-0', !busy && t.hoverCard)}
                style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.ink, opacity: busy ? 0.6 : undefined }}
                data-testid="button-upload-another"
              >
                <Upload className="w-4 h-4 flex-shrink-0" /> {busy ? (uploadPct !== null ? 'Uploading\u2026' : 'Measuring\u2026') : 'Save result & upload new'}
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

// File history — the SAME right-anchored popover the press Test/Certify surface
// uses (rounded-2xl, soft header band, close X, revision rows newest first),
// revealed by the toolbar History icon, not a standing card (Ruby, Aug 18 2026).
// Rows are the REAL fileEvents audit trail: the newest upload is "Current";
// prior uploads show their check result; press downloads/unlocks are their own
// event rows. Nothing is ever deleted.
function HistoryPanel({ t, rows, onClose }: { t: Theme; rows: FileEventRow[]; onClose: () => void }) {
  const firstUploadIdx = rows.findIndex((r) => r.event === 'uploaded');
  const meta = (row: FileEventRow, i: number): { word: string; icon: LucideIcon; color: string; fillDot?: boolean } => {
    if (row.event === 'downloaded') return { word: 'Downloaded by press', icon: Download, color: t.subink };
    if (row.event === 'unlocked') return { word: 'Unlocked by press', icon: Lock, color: t.subink };
    if (i === firstUploadIdx) return { word: 'Current', icon: Circle, color: t.ready, fillDot: true };
    if (row.result === 'pass') return { word: 'Passed', icon: CheckCircle2, color: t.subink };
    return { word: 'Replaced', icon: ArrowLeftRight, color: t.faint };
  };
  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} data-testid="file-history-backdrop" />
      <div
        className="absolute z-[71] rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, top: 'calc(100% + 6px)', right: 0, width: 380 }}
        role="dialog"
        aria-label="File history"
        data-testid="file-history"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}`, backgroundColor: t.soft }}>
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: t.ink }}>File history</div>
            <div className="text-[12px] mt-0.5" style={{ color: t.subink }}>Every upload and download, newest first</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full inline-flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${t.hairline}`, color: t.subink }} data-testid="button-close-history">
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div className="px-5 py-3 max-h-[420px] overflow-y-auto">
          {rows.length === 0 && (
            <p className="text-[12.5px] py-3" style={{ color: t.faint }} data-testid="history-empty">No uploads or downloads recorded yet.</p>
          )}
          {rows.map((h, i) => {
            const m = meta(h, i);
            const Icon = m.icon;
            return (
              <div key={h.id} className="py-3 flex items-center justify-between gap-4" style={{ borderBottom: i < rows.length - 1 ? `1px solid ${t.hairline}` : undefined }} data-testid={`history-row-${h.id}`}>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate" style={{ color: t.ink }} title={h.fileName ?? undefined}>{h.fileName ?? 'File'}</div>
                  <div className="text-[11.5px] mt-0.5 tabular-nums" style={{ color: t.subink }}>{h.dims ? <>{h.dims} &middot; </> : null}{fmtWhen(h.at)}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold flex-shrink-0" style={{ color: m.color }} data-testid={`history-status-${h.event}`}>
                  <Icon className="w-3 h-3 flex-shrink-0" style={m.fillDot ? { fill: m.color } : undefined} aria-hidden />
                  {m.word}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── GOLDENROD raw-template flow (Ruby's Aug 19 restructure handoff) ─────────
// Everything below renders the pre-art scene: mode toggle (panel images vs
// full template), area chips, panel viewports cropped from the real rendered
// template sheet, drop boxes and the contained upload dialog. Full-template
// drops are REAL; per-panel confirms close quietly (gogoods, Aug 19 2026:
// "visual-only" — no fake seated state).

type RawPanelId = 'front' | 'back' | 'spine';
type RawArea = 'all' | RawPanelId;

// Handoff PANEL_REGIONS verbatim — fractions of the MRP 12″ jacket sheet.
// Used as a visual approximation for every template until per-template
// regions exist (flagged to Ruby in docs/STATUS.md).
const PANEL_REGIONS: Record<RawPanelId, { x: number; y: number; width: number; height: number }> = {
  back: { x: 0.100, y: 0.195, width: 0.292, height: 0.600 },
  front: { x: 0.515, y: 0.195, width: 0.292, height: 0.600 },
  spine: { x: 0.483, y: 0.195, width: 0.028, height: 0.600 },
};
const JACKET_ASPECT = 779.41 / 539.33; // sheet w/h — handoff verbatim

const RAW_PANELS: Array<{ id: RawPanelId; label: string }> = [
  { id: 'back', label: 'Back' },
  { id: 'front', label: 'Front' },
  { id: 'spine', label: 'Spine' },
];

// Segmented pill group — handoff SegChip. Soft bg rail, active chip = card bg
// + shadow + semibold.
function SegChip<V extends string>({ t, value, onChange, options, size = 'sm', testPrefix }: {
  t: Theme; value: V; onChange: (v: V) => void;
  options: Array<{ value: V; label: string; icon?: LucideIcon; locked?: boolean; tooltip?: string }>;
  size?: 'sm' | 'lg'; testPrefix: string;
}) {
  const pad = size === 'lg' ? '8px 16px' : '6px 13px';
  return (
    <div className="inline-flex items-center rounded-full" style={{ background: t.soft, padding: 3 }} role="tablist" data-testid={testPrefix}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={o.locked || undefined}
            title={o.tooltip}
            onClick={() => { if (!o.locked) onChange(o.value); }}
            className="inline-flex items-center gap-1.5 rounded-full text-[13px] transition-colors"
            style={{
              padding: pad,
              background: active ? t.card : 'transparent',
              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.14)' : undefined,
              fontWeight: active ? 600 : 500,
              color: o.locked ? t.faint : active ? t.ink : t.subink,
              opacity: o.locked ? 0.55 : 1,
              cursor: o.locked ? 'not-allowed' : 'pointer',
            }}
            data-testid={`${testPrefix}-${o.value}`}
          >
            {o.locked ? <Lock className="w-3.5 h-3.5 flex-shrink-0" /> : Icon ? <Icon className="w-3.5 h-3.5 flex-shrink-0" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Replace chooser popover — handoff ViewToolbar chooser. Radios Full template /
// A single panel (+ panel sub-picker); Cancel + blue Continue.
function ReplaceChooser({ t, method, panel, onMethod, onPanel, onCancel, onConfirm }: {
  t: Theme; method: 'template' | 'images'; panel: RawPanelId;
  onMethod: (m: 'template' | 'images') => void; onPanel: (p: RawPanelId) => void;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onCancel} data-testid="replace-chooser-backdrop" />
      <div
        className="absolute z-20 rounded-2xl"
        style={{ top: 'calc(100% + 8px)', right: 0, width: 300, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 18px 44px rgba(0,0,0,0.32)', padding: 16 }}
        role="dialog"
        aria-label="Replace file"
        data-testid="replace-chooser"
      >
        <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>How are you replacing the art?</div>
        <div className="flex flex-col" style={{ marginTop: 10, gap: 6 }}>
          {([
            { v: 'template' as const, label: 'Full template', sub: 'One file covering the whole piece', testid: 'replace-method-template' },
            { v: 'images' as const, label: 'A single panel', sub: 'Swap just one panel of the art', testid: 'replace-method-images' },
          ]).map((o) => {
            const active = method === o.v;
            return (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onMethod(o.v)}
                className={cn('w-full flex items-start gap-2.5 rounded-xl text-left transition-colors', t.hoverCard)}
                style={{ padding: '9px 10px', border: `1px solid ${active ? t.blue : t.hairline}` }}
                data-testid={o.testid}
              >
                <span
                  className="rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ width: 16, height: 16, marginTop: 1, border: `1.5px solid ${active ? t.blue : t.dot}` }}
                  aria-hidden
                >
                  {active && <span className="rounded-full" style={{ width: 8, height: 8, background: t.blue }} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium" style={{ color: t.ink }}>{o.label}</span>
                  <span className="block text-[12px]" style={{ color: t.faint }}>{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        {method === 'images' && (
          <div className="flex items-center flex-wrap" style={{ marginTop: 10, gap: 6 }}>
            {RAW_PANELS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPanel(p.id)}
                className="rounded-full text-[12.5px] font-medium transition-colors"
                style={{
                  padding: '5px 12px',
                  border: `1px solid ${panel === p.id ? t.blue : t.hairline}`,
                  color: panel === p.id ? t.blue : t.subink,
                  background: panel === p.id ? `${t.blue}1f` : 'transparent',
                }}
                data-testid={`replace-panel-${p.id}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={onCancel}
            className={cn('rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
            style={{ padding: '6px 13px', color: t.subink }}
            data-testid="replace-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ padding: '6px 14px', background: t.blue }}
            data-testid="replace-confirm"
          >
            <Check className="w-3.5 h-3.5 flex-shrink-0" /> Continue
          </button>
        </div>
      </div>
    </>
  );
}

// Dashed drop box — handoff TemplateDropBox. Sits over a scrimmed sheet.
function TemplateDropBox({ label, onOpen, onDropFile, testid }: {
  label: string; onOpen: () => void; onDropFile: (file: File | undefined) => void; testid: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'rgba(20,20,22,0.42)', backdropFilter: 'blur(1px)' }}>
      <button
        type="button"
        onClick={onOpen}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onDropFile(e.dataTransfer.files?.[0]); }}
        className="flex flex-col items-center justify-center text-center gap-2 rounded-2xl transition-opacity hover:opacity-95"
        style={{ width: 'min(90%, 380px)', padding: '30px 26px', background: '#1c1c1e', border: '1.5px dashed rgba(255,255,255,0.35)', color: '#f5f5f7' }}
        data-testid={testid}
      >
        <UploadCloud className="w-7 h-7" style={{ strokeWidth: 1.5 }} aria-hidden />
        <span className="text-[13.5px] font-semibold">{label}</span>
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.65)' }}>or click to upload &middot; paste a URL</span>
      </button>
    </div>
  );
}

// Contained upload dialog — handoff UploadDialog (variant 'contained': scrim
// scoped to the sheet). Segmented Upload file / Paste a URL; confirm earns its
// blue only once a file is chosen or a URL typed. Real when wired to the
// full-template handlers; per-panel confirms seat art locally (Ruby's Aug 19
// update — the panel path ends honestly: seated, never measured). deadEnd is
// kept for any caller that still wants a quiet close.
function RawUploadDialog({ t, title, subtitle, onClose, deadEnd, busy, uploadPct, measuring, onConfirmFile, onConfirmUrl }: {
  t: Theme; title: string; subtitle: string; onClose: () => void; deadEnd: boolean;
  busy: boolean; uploadPct: number | null; measuring: boolean;
  onConfirmFile: (file: File) => void; onConfirmUrl: (url: string) => void;
}) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [urlText, setUrlText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const armed = tab === 'upload' ? !!file : urlText.trim().length > 0;
  const confirm = () => {
    if (!armed || busy) return;
    if (deadEnd) { onClose(); return; } // quiet dead-end — no seat, no fake state
    if (tab === 'upload' && file) onConfirmFile(file);
    else if (tab === 'url') onConfirmUrl(urlText.trim());
  };
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(20,20,22,0.42)', backdropFilter: 'blur(1px)' }}>
      <div className="rounded-2xl" style={{ width: 'min(92%, 420px)', background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 22px 60px rgba(0,0,0,0.38)', padding: 18 }} role="dialog" aria-label={title} data-testid="raw-upload-dialog">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold" style={{ color: t.ink }}>{title}</div>
            <div className="text-[12.5px]" style={{ marginTop: 3, color: t.faint }}>{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn('flex-shrink-0 inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)}
            style={{ width: 28, height: 28, border: `1px solid ${t.hairline}`, color: t.subink }}
            data-testid="dialog-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <SegChip
            t={t}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upload' as const, label: 'Upload file' },
              { value: 'url' as const, label: 'Paste a URL' },
            ]}
            testPrefix="dialog-tab"
          />
        </div>
        {tab === 'upload' ? (
          <>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="input-dialog-file" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-xl text-center transition-colors"
              style={{ marginTop: 12, padding: '26px 18px', border: `1.5px dashed ${t.dashed}`, background: t.soft, color: t.subink }}
              data-testid="dialog-drop"
            >
              {file ? (
                <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: t.ink }}>
                  <FileImage className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> {file.name}
                  <Check className="w-4 h-4 flex-shrink-0" style={{ color: t.ready }} />
                </span>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6" style={{ strokeWidth: 1.5 }} aria-hidden />
                  <span className="text-[13px] font-medium" style={{ color: t.ink }}>Drop your file here</span>
                  <span className="text-[12px]" style={{ color: t.faint }}>or click to browse &middot; PDF</span>
                </>
              )}
            </button>
          </>
        ) : (
          <input
            type="text"
            inputMode="url"
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
            placeholder="https://&hellip;"
            className="w-full rounded-xl text-[13px] outline-none"
            style={{ marginTop: 12, padding: '10px 12px', border: `1px solid ${t.hairline}`, background: t.soft, color: t.ink }}
            data-testid="input-dialog-url"
          />
        )}
        {busy && (
          <div style={{ marginTop: 12 }} data-testid="dialog-progress">
            <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: t.soft }}>
              <div className="h-full rounded-full transition-all" style={{ width: measuring ? '100%' : `${Math.round((uploadPct ?? 0) * 100)}%`, background: t.blue, opacity: measuring ? 0.65 : 1 }} />
            </div>
            <div className="text-[12px]" style={{ marginTop: 5, color: t.faint }}>{measuring ? 'Running the measured checks\u2026' : 'Uploading\u2026'}</div>
          </div>
        )}
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 14 }}>
          <button type="button" onClick={onClose} className={cn('rounded-full text-[13px] font-medium transition-colors', t.hoverCard)} style={{ padding: '6px 13px', color: t.subink }} data-testid="dialog-cancel">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            aria-disabled={!armed || busy}
            className="rounded-full text-[13px] font-semibold transition-colors"
            style={armed && !busy
              ? { padding: '6px 16px', background: t.blue, color: '#ffffff' }
              : { padding: '6px 16px', border: `1px solid ${t.hairline}`, color: t.faint, cursor: 'not-allowed' }}
            data-testid="dialog-confirm"
          >
            {tab === 'upload' ? 'Upload' : 'Fetch file'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Red-linework fallback sheet — shown only when no template PDF could render.
function RawLinework({ area }: { area: RawArea }) {
  const RED = 'rgba(200,60,60,0.7)';
  if (area !== 'all') {
    return (
      <div className="absolute inset-0" style={{ background: '#ffffff' }} aria-hidden>
        <div className="absolute" style={{ inset: 14, border: `1px dashed ${RED}` }} />
        <span className="absolute text-[11px] font-semibold" style={{ top: 6, left: 8, color: RED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{area}</span>
      </div>
    );
  }
  return (
    <div className="absolute inset-0" style={{ background: '#ffffff' }} aria-hidden>
      {RAW_PANELS.map((p) => {
        const r = PANEL_REGIONS[p.id];
        return (
          <div key={p.id} className="absolute" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%`, outline: `1.5px solid ${RED}`, outlineOffset: -1 }}>
            {p.id !== 'spine' && <span className="absolute text-[11px] font-semibold" style={{ top: 4, left: 6, color: RED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{p.label}</span>}
          </div>
        );
      })}
      <span className="absolute text-[11px]" style={{ bottom: 8, left: '50%', transform: 'translateX(-50%)', color: RED, letterSpacing: '0.06em' }}>Raw press template &middot; art not placed yet</span>
    </div>
  );
}

// The whole pre-art scene — handoff SceneRawTemplate, wired to the real page.
function RawFlow({ t, pieceLabel, templateName, specLine, tplImg, tplAspect, tplState, tplError, hasTemplateFile, busy, uploadPct, measuring, onUploadFile, onCheckUrl, onDownloadTemplate, canDownload, historyRows }: {
  t: Theme; pieceLabel: string; templateName: string; specLine: string;
  tplImg: string | null; tplAspect: number | null;
  tplState: 'loading' | 'ready' | 'error' | 'idle'; tplError: string | null; hasTemplateFile: boolean;
  busy: boolean; uploadPct: number | null; measuring: boolean;
  onUploadFile: (file: File | undefined) => void; onCheckUrl: (url: string) => void;
  onDownloadTemplate: () => void; canDownload: boolean;
  historyRows: FileEventRow[];
}) {
  // Mode: per-panel images vs one full-template file. Handoff default 'images'.
  const [mode, setMode] = useState<'images' | 'template'>('images');
  const [area, setArea] = useState<RawArea>('front');
  const [dialog, setDialog] = useState<null | 'template' | RawPanelId>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Per-panel seated art (Ruby's Aug 19 update: the panel path now has a real
  // ending). Object URLs for dropped files; a pasted link seats without a
  // preview. Local-only — panels can't be measured server-side yet.
  const [panelArt, setPanelArt] = useState<Record<RawPanelId, string | null>>({ front: null, back: null, spine: null });
  const anyPanelArt = RAW_PANELS.some((p) => panelArt[p.id] !== null);
  const allPanelArt = RAW_PANELS.every((p) => panelArt[p.id] !== null);
  const panelComplete = mode === 'images' && allPanelArt;

  const seatPanel = (p: RawPanelId, file?: File) => {
    setPanelArt((s) => ({ ...s, [p]: file ? URL.createObjectURL(file) : '' }));
    setDialog(null);
  };

  // Template mode always views the full sheet; images mode views a panel
  // until every panel is seated (then Full template unlocks).
  useEffect(() => {
    if (mode === 'template' && area !== 'all') setArea('all');
    if (mode === 'images' && area === 'all' && !allPanelArt) setArea('front');
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetAspect = tplAspect ?? JACKET_ASPECT;
  const dialogTitle = dialog === 'template' ? 'Upload your full template' : dialog ? `Upload your ${dialog} art` : '';

  const viewChips: Array<{ value: RawArea; label: string; locked?: boolean; tooltip?: string }> =
    mode === 'template'
      ? [{ value: 'all', label: 'Full template' }, ...RAW_PANELS.map((p) => ({ value: p.id as RawArea, label: p.label, locked: true, tooltip: 'Panels unlock once your template art is placed' }))]
      : [{ value: 'all', label: 'Full template', locked: !allPanelArt, tooltip: allPanelArt ? undefined : 'Upload each panel to see the full template' }, ...RAW_PANELS.map((p) => ({ value: p.id as RawArea, label: p.label }))];

  return (
    <div data-testid="raw-flow">
      {/* Headline — handoff verbatim. */}
      <h1 className="font-semibold" style={{ marginTop: 18, fontSize: 26, letterSpacing: '-0.02em', color: t.ink, lineHeight: 1.15 }} data-testid="raw-headline">
        Add your art.<br />Straight onto the template.
      </h1>
      <p className="text-[13.5px]" style={{ marginTop: 8, maxWidth: 560, color: t.subink, lineHeight: 1.5 }}>
        Drop your art onto each panel, or upload one file that covers the whole template. We check it against the press spec the moment it lands.
      </p>

      {/* First-run entry chips + raw-template download. */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 18 }}>
        <SegChip
          t={t}
          value={mode}
          onChange={setMode}
          size="lg"
          options={[
            { value: 'images' as const, label: 'Add panel images', icon: ImagePlus },
            { value: 'template' as const, label: 'Upload a full template', icon: LayoutTemplate },
          ]}
          testPrefix="raw-entry-chips"
        />
        <button
          type="button"
          onClick={() => { if (canDownload) onDownloadTemplate(); }}
          aria-disabled={!canDownload}
          className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', canDownload && t.hoverCard)}
          style={{ padding: '7px 14px', color: canDownload ? t.subink : t.faint, border: `1px solid ${t.hairline}`, opacity: canDownload ? 1 : 0.55, cursor: canDownload ? 'pointer' : 'not-allowed' }}
          data-testid="button-download-raw"
        >
          <LayoutTemplate className="w-4 h-4 flex-shrink-0" /> Download raw template
        </button>
      </div>

      {/* Status card. The per-panel path can't be measured against the press
          spec — measured checks run on ONE print-ready template file. When all
          three panels are seated we show an HONEST, CALM intermediate (Ruby's
          Aug 19 update): a neutral "Not tested against press spec" chip, calm
          grammar, and one quiet forward path into the template flow where
          checks CAN run. Never a green Passed on the panel path. */}
      {panelComplete ? (
        <div className="rounded-2xl" style={{ marginTop: 16, padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="raw-not-measured">
          <span
            className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold"
            style={{ padding: '3px 10px', border: `1px solid ${t.hairline}`, color: t.subink, background: t.soft }}
            data-testid="chip-not-measured"
          >
            <CircleDashed className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> Not tested against press spec
          </span>
          <div className="text-[15px] font-semibold" style={{ marginTop: 12, color: t.ink, letterSpacing: '-0.01em' }}>
            Looks right. Not yet measured.
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 4, color: t.subink, maxWidth: 560, lineHeight: 1.55 }}>
            Measured checks run on a single print-ready template file. Your panels are seated visually &mdash; the press will run the full check when your proof is made.
          </p>
          <div className="text-[12.5px]" style={{ marginTop: 12, color: t.faint, lineHeight: 1.55 }}>
            Want it measured now? Download the template, place your art, and upload it as one file.
          </div>
          <button
            type="button"
            onClick={() => { setMode('template'); setArea('all'); }}
            className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
            style={{ marginTop: 10, padding: '6px 13px', border: `1px solid ${t.hairline}`, color: t.ink }}
            data-testid="button-switch-to-template"
          >
            <LayoutTemplate className="w-4 h-4 flex-shrink-0" aria-hidden /> Switch to the template path
            <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ marginTop: 16, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="pending-card">
          <div className="flex items-center gap-3" style={{ padding: '16px 20px' }}>
            {anyPanelArt ? (
              <BadgeCheck className="w-5 h-5 flex-shrink-0" style={{ color: t.subink }} aria-hidden />
            ) : (
              <span className="flex-shrink-0 rounded-full" style={{ width: 18, height: 18, border: `2px solid ${t.dot}` }} aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold" style={{ color: t.ink }}>
                {anyPanelArt ? 'Art started \u2014 some panels still pending' : 'Pending \u2014 no art uploaded yet'}
              </div>
              <div className="text-[12.5px]" style={{ marginTop: 2, color: t.faint }}>{specLine}</div>
            </div>
          </div>
        </div>
      )}

      {/* File header card — title + status chips, rename dead-end. */}
      <div className="rounded-2xl" style={{ marginTop: 16, padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="raw-file-header">
        <div className="flex items-center gap-2.5 flex-wrap group">
          <h2 className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{pieceLabel}</h2>
          <button
            type="button"
            aria-label="Rename"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: t.faint }}
            data-testid="button-rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {panelComplete ? (
            /* Per-panel completed slot — honest, calm, word + icon. Neutral
               dashed-circle, not a green "Passed": the panels are seated but
               nothing has been measured against the press spec yet. */
            <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium" style={{ padding: '3px 10px', border: `1px solid ${t.chipBorder}`, color: t.subink }} data-testid="chip-file-status">
              <CircleDashed className="w-3.5 h-3.5 flex-shrink-0" /> Art seated &middot; not yet measured
            </span>
          ) : anyPanelArt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium" style={{ padding: '3px 10px', border: `1px solid ${t.chipBorder}`, color: t.subink }} data-testid="chip-file-status">
              <History className="w-3.5 h-3.5 flex-shrink-0" /> Not tested
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium" style={{ padding: '3px 10px', border: `1px solid ${t.chipBorder}`, color: t.subink }}>
                <Clock className="w-3.5 h-3.5 flex-shrink-0" /> No art yet
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium" style={{ padding: '3px 10px', border: `1px solid ${t.chipBorder}`, color: t.subink }}>
                <History className="w-3.5 h-3.5 flex-shrink-0" /> Not tested
              </span>
            </>
          )}
        </div>
        <p className="text-[12.5px]" style={{ marginTop: 6, color: t.faint }}>
          {templateName} &middot; {panelComplete ? 'panels seated \u2014 measured checks run on one template file' : 'drop art to run the measured checks'}
        </p>
      </div>

      {/* View toolbar — area chips left, circles + locked Replace + ••• right. */}
      <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginTop: 16 }} data-testid="chip-view-area">
        <SegChip t={t} value={area} onChange={setArea} options={viewChips} testPrefix="chip-area" />
        <div className="flex items-center gap-2 relative">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-label="File history"
              aria-expanded={showHistory}
              className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)}
              style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.subink }}
              data-testid="button-history"
            >
              <History className="w-4 h-4" />
            </button>
            {showHistory && <HistoryPanel t={t} rows={historyRows} onClose={() => setShowHistory(false)} />}
          </div>
          <span
            className="inline-flex items-center justify-center rounded-full"
            style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.faint, opacity: 0.55, cursor: 'not-allowed' }}
            aria-disabled="true"
            title="Download test proof"
            data-testid="button-download-proof-disabled"
          >
            <Download className="w-4 h-4" />
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium"
            style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.faint, opacity: 0.6, cursor: 'not-allowed' }}
            aria-disabled="true"
            title="Nothing to replace yet"
            data-testid="button-replace-locked"
          >
            <Lock className="w-4 h-4 flex-shrink-0" /> Replace
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)}
              style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.subink }}
              data-testid="button-file-overflow"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute z-20 rounded-xl overflow-hidden" style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 216, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }} role="menu" data-testid="file-menu-list">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); setShowHistory(true); }}
                    className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)}
                    style={{ padding: '10px 14px', color: t.ink }}
                    data-testid="file-menu-history"
                  >
                    <History className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> File history
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); if (canDownload) onDownloadTemplate(); }}
                    aria-disabled={!canDownload}
                    className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', canDownload && t.hoverCard)}
                    style={{ padding: '10px 14px', color: canDownload ? t.ink : t.faint, borderTop: `1px solid ${t.hairline}`, cursor: canDownload ? 'pointer' : 'not-allowed' }}
                    data-testid="file-menu-download"
                  >
                    <Download className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> Download raw template
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Honest template-load states (real page grammar). */}
      {tplState === 'loading' && (
        <p className="text-[13px]" style={{ marginTop: 14, color: t.faint }} data-testid="template-loading">Loading the press template&hellip;</p>
      )}
      {tplState === 'error' && (
        <p className="text-[13px]" style={{ marginTop: 14, color: t.subink }} data-testid="template-error">{tplError}</p>
      )}
      {tplState === 'idle' && !hasTemplateFile && (
        <p className="text-[13px]" style={{ marginTop: 14, color: t.subink }} data-testid="template-missing">
          The press hasn&rsquo;t attached a template file for this piece yet &mdash; your art will still be checked against its measured specs.
        </p>
      )}

      {/* Canvas — full sheet (template mode) or a panel viewport (images mode),
          cropped from the real rendered template sheet when available. In
          images mode the Full-template view is the stitched spread of the
          seated panels (unlocked once all three are in). */}
      {area === 'all' && mode === 'images' ? (
        <div className="relative w-full overflow-hidden rounded-2xl" style={{ marginTop: 14, border: `1px solid ${t.hairline}`, background: '#ffffff' }} data-testid="raw-sheet-stitched">
          <div className="relative w-full" style={{ aspectRatio: `${sheetAspect} / 1`, maxHeight: '70vh' }}>
            {tplImg ? (
              <img src={tplImg} alt={`${templateName} template`} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain' }} aria-hidden />
            ) : (
              <RawLinework area="all" />
            )}
            {RAW_PANELS.map((p) => {
              const src = panelArt[p.id];
              if (src === null) return null;
              const r = PANEL_REGIONS[p.id];
              const box: React.CSSProperties = { position: 'absolute', left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
              return src ? (
                <img key={p.id} src={src} alt={`${p.label} art`} style={{ ...box, objectFit: 'cover' }} data-testid={`stitched-${p.id}`} />
              ) : (
                <div key={p.id} className="flex items-center justify-center" style={{ ...box, background: 'rgba(0,0,0,0.04)' }} data-testid={`stitched-${p.id}`}>
                  <span className="inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium" style={{ padding: '2px 8px', border: `1px solid ${t.hairline}`, background: t.card, color: t.subink }}>
                    <CircleDashed className="w-3 h-3 flex-shrink-0" /> Art seated
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : area === 'all' ? (
        <div className="relative w-full overflow-hidden rounded-2xl" style={{ marginTop: 14, border: `1px solid ${t.hairline}`, background: '#ffffff' }} data-testid="raw-sheet">
          <div className="relative w-full" style={{ aspectRatio: `${sheetAspect} / 1`, maxHeight: '70vh' }}>
            {tplImg ? (
              <img src={tplImg} alt={`${templateName} template`} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain' }} data-testid="raw-sheet-img" />
            ) : (
              <RawLinework area="all" />
            )}
            {dialog === 'template' ? (
              <RawUploadDialog
                t={t}
                title={dialogTitle}
                subtitle={`Press-ready art for ${pieceLabel} \u2014 we validate it automatically.`}
                onClose={() => setDialog(null)}
                deadEnd={false}
                busy={busy}
                uploadPct={uploadPct}
                measuring={measuring}
                onConfirmFile={(f) => onUploadFile(f)}
                onConfirmUrl={onCheckUrl}
              />
            ) : (
              <TemplateDropBox
                label="Drag & drop your template"
                onOpen={() => setDialog('template')}
                onDropFile={onUploadFile}
                testid="raw-drop-template"
              />
            )}
          </div>
        </div>
      ) : (
        (() => {
          const r = PANEL_REGIONS[area];
          const panelAspect = (r.width * JACKET_ASPECT) / r.height;
          return (
            <div className="relative w-full overflow-hidden rounded-2xl" style={{ marginTop: 14, border: `1px solid ${t.hairline}`, background: '#ffffff' }} data-testid={`raw-panel-${area}`}>
              <div className="relative w-full mx-auto" style={{ maxWidth: Math.round(460 * panelAspect), height: 'min(460px, 70vh)' }}>
                {tplImg ? (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `url(${tplImg})`,
                      backgroundSize: `${(1 / r.width) * 100}% ${(1 / r.height) * 100}%`,
                      backgroundPosition: `${(r.x / (1 - r.width)) * 100}% ${(r.y / (1 - r.height)) * 100}%`,
                    }}
                    aria-hidden
                  />
                ) : (
                  <RawLinework area={area} />
                )}
                {dialog === area ? (
                  <RawUploadDialog
                    t={t}
                    title={dialogTitle}
                    subtitle={`Press-ready art for the ${area} panel \u2014 we validate it automatically.`}
                    onClose={() => setDialog(null)}
                    deadEnd={false}
                    busy={false}
                    uploadPct={null}
                    measuring={false}
                    onConfirmFile={(f) => seatPanel(area, f)}
                    onConfirmUrl={() => seatPanel(area)}
                  />
                ) : panelArt[area] !== null ? (
                  /* Seated panel — art (when we have a preview) + a quiet
                     Replace affordance. No green Passed on the panel path. */
                  <>
                    {panelArt[area] ? (
                      <img src={panelArt[area]!} alt={`${area} art`} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} data-testid={`seated-${area}`} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center" data-testid={`seated-${area}`}>
                        <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium" style={{ padding: '3px 10px', border: `1px solid ${t.hairline}`, background: t.card, color: t.subink }}>
                          <CircleDashed className="w-3.5 h-3.5 flex-shrink-0" /> Art seated &middot; not yet measured
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setDialog(area)}
                      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium transition-colors"
                      style={{ padding: '5px 12px', border: `1px solid ${t.hairline}`, background: t.card, color: t.subink }}
                      data-testid={`button-replace-${area}`}
                    >
                      <Upload className="w-3.5 h-3.5 flex-shrink-0" /> Replace
                    </button>
                  </>
                ) : (
                  <TemplateDropBox
                    label={`Drag & drop your ${area} art`}
                    onOpen={() => setDialog(area)}
                    onDropFile={(f) => seatPanel(area, f)}
                    testid={`raw-drop-${area}`}
                  />
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}



export default ArtistTemplateTest;
