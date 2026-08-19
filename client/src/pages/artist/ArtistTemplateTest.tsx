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
  Link2,
  FileUp,
  ImagePlus,
  LayoutTemplate,
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
      {!hasArt && tpl && (
        <button
          type="button"
          onClick={downloadTemplate}
          className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
          style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
          data-testid="button-download-raw"
        >
          <LayoutTemplate className="w-4 h-4 flex-shrink-0" /> Download raw template
        </button>
      )}

      {/* Replace — the toolbar counterpart of the press "Save result & test
          another" slot. Visible once art exists; goes straight to the upload
          box in one click (opens the card AND reveals the drop target — no
          intermediate button). When locked, becomes a disabled Lock pill. */}
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
        <button
          type="button"
          onClick={() => { setUploadOpen(true); setShowDrop(true); }}
          className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
          style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
          data-testid="button-replace"
          aria-label="Replace file"
          title="Replace file"
        >
          <Upload className="w-4 h-4 flex-shrink-0" /> Replace
        </button>
      ))}
      {!hasArt && (
        /* Disabled-faint Download-test-proof circle — the permanent-toolbar
           placeholder until there's art to proof. */
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.faint, opacity: 0.55, cursor: 'not-allowed' }}
          aria-disabled="true"
          data-testid="button-download-proof-disabled"
          title="Download test proof"
        >
          <Download className="w-4 h-4" />
        </span>
      )}
    </>
  );

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
        {hasArt ? (
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
        ) : (
          <PendingCard t={t} />
        )}

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
              ) : !hasArt ? (
                <RawTemplate t={t} busy={uploading || check.isPending} onReplaceFile={handleReplaceFile} onCheckUrl={(url) => check.mutate({ url, fileName: url.split('/').pop() || 'art.pdf' })} />
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

// Pending card (Part B) — the pre-upload state that replaces the PASSED summary
// when there's no art yet. Quiet, word + icon, zero blue. Mirrors the checks-card
// shell so the two states swap cleanly in place.
function PendingCard({ t }: { t: Theme }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ marginTop: 22, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="pending-card">
      <div className="flex items-center gap-3" style={{ padding: '16px 20px' }}>
        <Clock className="w-5 h-5 flex-shrink-0" style={{ color: t.subink }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold" style={{ color: t.ink }}>
            Pending &mdash; not tested yet
          </div>
          <div className="text-[12.5px]" style={{ marginTop: 2, color: t.faint }}>
            Drop your art onto the template below to run the checks.
          </div>
        </div>
      </div>
    </div>
  );
}

// Panel upload overlay (Part B) — the dashed drop-zone that sits over each raw
// template panel. Clicking opens a small popover with "Choose file" and
// "Paste URL" rows — the same upload-menu affordance used elsewhere. REAL here:
// Choose file opens the picker; Paste URL prompts for a link; both run the
// same measured check as a replace (the file covers the full piece).
function PanelUpload({ t, panel, busy, onReplaceFile, onCheckUrl }: { t: Theme; panel: 'Front' | 'Back'; busy: boolean; onReplaceFile: (file: File | undefined) => void; onCheckUrl: (url: string) => void }) {
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="absolute inset-3">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => { setMenu(false); onReplaceFile(e.target.files?.[0]); }}
        data-testid={`input-panel-${panel.toLowerCase()}`}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => setMenu((v) => !v)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); setMenu(false); onReplaceFile(e.dataTransfer.files?.[0]); }}
        className="w-full h-full flex flex-col items-center justify-center text-center gap-2 rounded-xl transition-colors"
        style={{ border: '2px dashed rgba(200,60,60,0.55)', background: 'rgba(200,60,60,0.05)', color: '#7a2a2a', opacity: busy ? 0.6 : undefined }}
        data-testid={`panel-upload-${panel.toLowerCase()}`}
      >
        <ImagePlus className="w-7 h-7" style={{ strokeWidth: 1.5 }} aria-hidden />
        <span className="text-[13px] font-semibold">Drag &amp; drop your {panel} art here</span>
        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ opacity: 0.8 }}>
          or click to upload &middot; paste a URL
        </span>
      </button>
      {menu && !busy && (
        <div
          className="absolute left-1/2 rounded-xl overflow-hidden"
          style={{ top: '50%', transform: 'translate(-50%, 8px)', minWidth: 190, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 12px 32px rgba(0,0,0,0.28)', zIndex: 5 }}
          data-testid={`panel-menu-${panel.toLowerCase()}`}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)}
            style={{ padding: '10px 14px', color: t.ink }}
            data-testid={`menu-choose-${panel.toLowerCase()}`}
          >
            <FileUp className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> Choose file
          </button>
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              const url = window.prompt('Paste a link to your art file (PDF):');
              if (url && url.trim()) onCheckUrl(url.trim());
            }}
            className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)}
            style={{ padding: '10px 14px', color: t.ink, borderTop: `1px solid ${t.hairline}` }}
            data-testid={`menu-url-${panel.toLowerCase()}`}
          >
            <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> Paste URL
          </button>
        </div>
      )}
    </div>
  );
}

// Raw press template (Part B) — the white template the artist lands on before
// uploading. Front + Back panels with hairline red template linework (simple
// styled divs, no assets) and an upload overlay on each. Shown when the slot
// has no art yet AND no template PDF could be rendered (with a template PDF,
// the real viewer shows the actual template instead).
function RawTemplate({ t, busy, onReplaceFile, onCheckUrl }: { t: Theme; busy: boolean; onReplaceFile: (file: File | undefined) => void; onCheckUrl: (url: string) => void }) {
  const RED = 'rgba(200,60,60,0.7)';
  return (
    <div className="w-full" data-testid="raw-template">
      <div className="grid grid-cols-2" style={{ gap: 2 }}>
        {(['Back', 'Front'] as const).map((panel) => (
          <div key={panel} className="relative" style={{ aspectRatio: '1 / 1', background: '#ffffff', outline: `1.5px solid ${RED}`, outlineOffset: -1 }} data-testid={`raw-panel-${panel.toLowerCase()}`}>
            {/* Bleed guide — dashed inset rectangle, press template convention. */}
            <div className="absolute" style={{ inset: 14, border: `1px dashed ${RED}` }} aria-hidden />
            {/* Panel label, top-left, template red. */}
            <span className="absolute text-[11px] font-semibold" style={{ top: 6, left: 8, color: RED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{panel}</span>
            <PanelUpload t={t} panel={panel} busy={busy} onReplaceFile={onReplaceFile} onCheckUrl={onCheckUrl} />
          </div>
        ))}
      </div>
      {/* Spine strip between panels is implied by the 2px gap; a thin center
          fold guide keeps the template read. */}
      <div className="flex items-center justify-center" style={{ marginTop: 8 }}>
        <span className="text-[11px]" style={{ color: RED, letterSpacing: '0.06em' }}>Raw press template &middot; art not placed yet</span>
      </div>
    </div>
  );
}

export default ArtistTemplateTest;
