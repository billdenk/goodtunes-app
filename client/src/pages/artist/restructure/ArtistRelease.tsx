// Artist Portal Restructure — SCENES 2–5, the five-tab release view.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026); ONLY the MOCK_
// consts were swapped for real data:
//   - GET /api/artist/albums/:id/portal   → release facts, formats, store, payments
//   - GET /api/admin/albums/:id/dashboard → release-scoped stats (artist-callable)
//   - GET /api/artist/summary             → activity (filtered to this release)
//   - GET /api/albums/:id                 → track list (audio lane)
//   - GET /api/admin/albums/:id/completed-template → vinyl art blocks
// BlockCard's mock `#/ArtistTemplateTest` href became the real
// /artist/albums/:id/art-test/:componentId route. Dead-end CTAs ship as
// quiet no-ops per the handoff contract.

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import {
  ArrowRight, Check, ChevronDown, ChevronRight, Circle, Clock, Copy, Disc3,
  Download, ExternalLink, Eye, FileImage, Link2, Lock, Mail, Pencil, Plus, UploadCloud, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, fetchBlob } from '@/lib/queryClient';
import { uploadAdminDocWithProgress } from '@/lib/adminUpload';
import { useUploadManager } from '@/context/UploadManagerContext';
import { NewAlbumModeDialog } from '@/components/admin/NewAlbumModeDialog';
import { ManufacturingLedger } from '@/components/admin/ShopifyPlusPanel';
import { PageColumn, PageHeader } from '@/components/admin/PageShell';
import { IconButton } from '@/components/ui/IconButton';
import {
  PressTemplateComponentIcon,
  type PressTemplateIconKind,
} from '@/components/admin/PressTemplateComponentIcon';
import { ArtistReleaseTrackRows } from '@/pages/AdminAlbum';
import { BonusPhotos, BonusVideos } from '@/pages/AdminAlbum';
import {
  ALBUM_PHYSICAL_FORMAT_LABEL,
  type AlbumPhysicalFormat,
  type AlbumSellMode,
} from '@shared/schema';
import {
  BLUE, PILL_SHADOW, cn, useRestructureTheme, CanonPill, MilestoneStatus, SegChip,
  FORMAT_WORD, fmtDollars, goodtunesLogo, shopifyLogo,
  type Theme, type StatusWord,
} from './shared';
import mrpLabelLogo from '@/assets/artist-portal/mrp-logo.svg';

// ─── Portal payload shapes (server/artistPortal.ts) ───
type PortalFormat = { id: string; kind: string; label: string; status: 'live' | 'press' | 'draft'; pressName?: string | null };
type PortalMilestone = { id: string; label: string; amountCents: number; status: StatusWord; note: string; payUrl?: string | null };
type PortalPayload = {
  release: { id: string; title: string; artist: string; artworkUrl?: string | null; year: string; tracks: number; physicalFormat?: AlbumPhysicalFormat | null; visibility: string; editing: string; catalogNumber?: string | null; upc?: string | null };
  access?: { canEditMetadata: boolean; canUploadMasters: boolean };
  formats: PortalFormat[];
  store: {
    sellMode: string;
    artistUrl?: string | null;
    albumUrl?: string | null;
    checklist: { art: boolean; audio: boolean; price: boolean; channel: boolean };
    shopifyConnected?: boolean;
  };
  payments: Array<{
    id: string; title: string; press: string; summary: string;
    outstandingCents?: number | null; milestones?: PortalMilestone[] | null;
  }>;
};

const RELEASE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'details', label: 'Details' },
  { id: 'assets', label: 'Assets' },
  { id: 'store', label: 'Store' },
  { id: 'payments', label: 'Payments' },
];

function ReleaseHeader({ activeTab, title, t, onTab, onCrumb }: { activeTab: string; title: string; t: Theme; onTab: (id: string) => void; onCrumb: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
        <button type="button" onClick={onCrumb} className="transition-colors hover:opacity-80" data-testid="crumb-releases">Releases</button>
        <span style={{ color: t.dot }}>›</span>
        <span style={{ color: t.subink }}>{title}</span>
      </div>

      {/* Quiet plain-text page navigation — no chip, no container, no dots.
          Active = ink/white/600, inactive = muted/500. Larger text (15px) so it
          reads as the primary release nav. */}
      <div className="flex items-center gap-8 flex-wrap" style={{ marginTop: 56 }} data-testid="release-tabbar" role="tablist" aria-label="Release section">
        {RELEASE_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className="text-[15px] transition-colors whitespace-nowrap hover:opacity-90"
              style={{
                fontWeight: active ? 600 : 500,
                letterSpacing: '0.01em',
                color: active ? t.ink : t.subink,
                opacity: active ? 1 : 0.8,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Full-width hairline — separates the breadcrumb + tab chip from the scene
          content below. (The art/title header block was removed; its facts now
          live on the Details tab.) */}
      <div style={{ marginTop: 10, marginBottom: 18, borderTop: `1px solid ${t.hairline}` }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD TAB — next-thing band, format heartbeat, stat cards, activity
// ═══════════════════════════════════════════════════════════════════
type FmtStatus = 'live' | 'press' | 'draft';
const FMT_WORD: Record<FmtStatus, string> = { live: 'Live', press: 'At press', draft: 'Draft' };

function FormatStatusIcon({ status, t }: { status: FmtStatus; t: Theme }) {
  if (status === 'live') return <Check className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} style={{ color: t.subink }} aria-hidden />;
  if (status === 'press') return <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: t.subink }} />;
  return <Circle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} aria-hidden />;
}

type DashPayload = {
  lifetime?: { grossCents?: number; units?: number; plays?: number; gooddeeds?: number };
  last30?: { grossCents?: number; plays?: number };
};

function ReleaseDashboard({ portal, albumId, t, onOpenFormat }: { portal: PortalPayload; albumId: string; t: Theme; onOpenFormat: () => void }) {
  const dash = useQuery<any>({ queryKey: [`/api/admin/albums/${albumId}/dashboard`] });
  const summary = useQuery<{ activity?: Array<{ kind: string; ts: string; title: string; detail?: string }> }>({ queryKey: ['/api/artist/summary'] });

  const lifetime = dash.data?.lifetime ?? {};
  const stats: Array<{ label: string; value: string; delta: string; testid: string }> = [
    { label: 'Sales · lifetime', value: fmtDollars(lifetime.grossCents ?? 0), delta: `${(lifetime.units ?? 0).toLocaleString('en-US')} copies sold`, testid: 'stat-sales' },
    { label: 'Fan plays · lifetime', value: (lifetime.plays ?? 0).toLocaleString('en-US'), delta: 'Across the GoodTunes® Player', testid: 'stat-plays' },
    { label: 'Certified GoodDeeds\u00AE', value: (lifetime.units ?? 0).toLocaleString('en-US'), delta: 'One per copy sold', testid: 'stat-gooddeeds' },
  ];

  // Balance-due band — only rendered when a payment milestone is actually
  // requested; otherwise the Dashboard starts with the format heartbeat rows.
  const requested = portal.payments.flatMap((p) => p.milestones ?? []).find((m) => m.status === 'requested');

  const activity = (summary.data?.activity ?? [])
    .filter((a) => a.title?.toLowerCase().includes(portal.release.title.toLowerCase()) || a.detail?.toLowerCase().includes(portal.release.title.toLowerCase()))
    .slice(0, 5);

  return (
    <div style={{ marginTop: 26 }} data-testid="release-dashboard">
      {/* 1 · Balance-due band. Rendered ONLY when a milestone is requested; the
          one actionable item (balance due) carries the ONE filled blue pill.
          No status banner otherwise — the format rows' status pills cover it. */}
      {requested && (
        <div
          className="flex items-center justify-between gap-6 rounded-2xl flex-wrap"
          style={{ padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card, marginBottom: 18 }}
          data-testid="dashboard-nextthing"
        >
          <div className="flex items-start gap-3 min-w-0">
            <Clock className="w-5 h-5 flex-shrink-0" style={{ color: t.subink, marginTop: 1 }} aria-hidden />
            <p className="text-[13px]" style={{ color: t.subink }}>
              {requested.label} &mdash; {fmtDollars(requested.amountCents)} to GoodTunes&reg;.
            </p>
          </div>
          <CanonPill label="Pay balance" onClick={() => { if (requested.payUrl) window.open(requested.payUrl, '_blank', 'noopener'); }} />
        </div>
      )}

      {/* 2 · Per-format heartbeat. Each row hints (chevron) it jumps to that format
          in Assets. */}
      {portal.formats.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid="dashboard-formats">
          {portal.formats.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={onOpenFormat}
              className={cn('w-full flex items-center justify-between gap-6 text-left transition-colors', t.hoverCard)}
              style={{ padding: '15px 18px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
              data-testid={`dashboard-format-${f.kind}-${i}`}
            >
              <span className="text-[14px] font-semibold min-w-0" style={{ color: t.ink }}>
                {f.label}
                {f.kind === 'digital' && <span className="font-medium" style={{ color: t.faint }}> · GoodTunes&reg; Player</span>}
              </span>
              <span className="flex items-center gap-4 flex-shrink-0">
                <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: t.subink }}>
                  <FormatStatusIcon status={f.status} t={t} /> {FMT_WORD[f.status]}
                </span>
                <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} aria-hidden />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 3 · Release-scoped stat cards (portal dashboard grammar). */}
      <div className="grid gap-4" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }} data-testid="dashboard-stats">
        {stats.map((s) => (
          <div key={s.testid} className="rounded-2xl" style={{ padding: '16px 18px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid={s.testid}>
            <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>{s.label}</p>
            <p className="font-semibold" style={{ marginTop: 8, fontSize: 26, letterSpacing: '-0.02em', color: t.ink }}>{dash.isLoading ? '—' : s.value}</p>
            <p className="text-[12px]" style={{ marginTop: 4, color: t.subink }}>{s.delta}</p>
          </div>
        ))}
      </div>

      {/* 4 · Release-only activity. Quiet rows with dates. */}
      {activity.length > 0 && (
        <section style={{ marginTop: 26 }} data-testid="dashboard-activity">
          <h2 className="text-[15px] font-semibold" style={{ color: t.ink, marginBottom: 12 }}>As it happens.</h2>
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }}>
            {activity.map((a, i) => (
              <div
                key={`${a.ts}-${i}`}
                className="flex items-center justify-between gap-6"
                style={{ padding: '14px 18px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
                data-testid={`activity-${i}`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: t.dot }} />
                  <span className="text-[13.5px] min-w-0" style={{ color: t.subink }}>{a.title}{a.detail ? ` — ${a.detail}` : ''}</span>
                </span>
                <span className="text-[12.5px] flex-shrink-0" style={{ color: t.faint }}>
                  {new Date(a.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DETAILS TAB — quiet hairline fact rows (word + icon states)
// ═══════════════════════════════════════════════════════════════════
type EditableDetailKey = 'title' | 'year' | 'catalogNumber' | 'upc';

function ReleaseDetails({ portal, albumId, portalQueryKey, t }: { portal: PortalPayload; albumId: string; portalQueryKey: string; t: Theme }) {
  const r = portal.release;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editingOpen = portal.access?.canEditMetadata ?? r.editing === 'Open';
  const [editingKey, setEditingKey] = useState<EditableDetailKey | null>(null);
  const [draft, setDraft] = useState('');
  const primaryFormat = portal.formats.find((f) => f.kind === 'vinyl') ?? portal.formats[0];
  const selectedFormatLabel = r.physicalFormat === 'single_lp'
    ? 'Vinyl'
    : r.physicalFormat
      ? ALBUM_PHYSICAL_FORMAT_LABEL[r.physicalFormat]
      : primaryFormat?.label ?? 'Not configured';
  const save = useMutation({
    mutationFn: async ({ key, value }: { key: EditableDetailKey; value: string }) => {
      const body = key === 'year'
        ? { year: value.trim() ? Number(value) : null }
        : { [key]: value.trim() };
      const response = await apiRequest('PUT', `/api/admin/albums/${albumId}`, body);
      return { status: response.status, body: await response.json() };
    },
    onSuccess: async (result) => {
      setEditingKey(null);
      await queryClient.invalidateQueries({ queryKey: [portalQueryKey] });
      toast({ description: result.status === 202 ? 'Edit sent for review' : 'Release details saved' });
    },
    onError: (error: Error) => {
      toast({ description: error.message || 'Couldn’t save release details', variant: 'destructive' });
    },
  });

  const beginEdit = (key: EditableDetailKey, value: string) => {
    if (!editingOpen || save.isPending) return;
    setEditingKey(key);
    setDraft(value);
  };
  const editableValue = (key: EditableDetailKey, value: string, emptyLabel: string, emphasis = false) => {
    if (editingKey === key) {
      return (
        <span className="flex items-center justify-end gap-2 w-full">
          <input
            autoFocus
            value={draft}
            type={key === 'year' ? 'number' : 'text'}
            inputMode={key === 'year' ? 'numeric' : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditingKey(null);
              if (e.key === 'Enter' && !(key === 'title' && !draft.trim())) save.mutate({ key, value: draft });
            }}
            className="h-9 min-w-0 max-w-[280px] flex-1 rounded-xl px-3 text-[13.5px] outline-none"
            style={{ color: t.ink, background: t.canvas, border: `1px solid ${t.hairline}` }}
            aria-label={key === 'catalogNumber' ? 'Catalog number' : key === 'upc' ? 'UPC code' : key}
          />
          <button type="button" onClick={() => setEditingKey(null)} className="text-[13px] font-medium px-2 py-1.5 rounded-full" style={{ color: t.subink }}>Cancel</button>
          <button
            type="button"
            disabled={save.isPending || (key === 'title' && !draft.trim())}
            onClick={() => save.mutate({ key, value: draft })}
            className="text-[13px] font-semibold text-white px-3 py-1.5 rounded-full disabled:opacity-45"
            style={{ background: BLUE }}
          >
            Save
          </button>
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={!editingOpen}
        onClick={() => beginEdit(key, value)}
        className="inline-flex min-h-9 items-center justify-end gap-2 text-right rounded-lg px-2 py-1 -mr-2 disabled:cursor-default"
        style={{ color: value ? (emphasis ? t.ink : t.subink) : t.faint }}
      >
        {value ? (
          <span className={emphasis ? 'font-semibold' : undefined}>{value}</span>
        ) : editingOpen ? (
          <>
            <span className="group-hover:hidden group-focus-within:hidden">—</span>
            <span className="hidden group-hover:inline group-focus-within:inline" style={{ color: BLUE }}>{emptyLabel}</span>
          </>
        ) : <span>—</span>}
        {editingOpen && (
          <Pencil
            className="w-3.5 h-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
            aria-hidden
          />
        )}
      </button>
    );
  };
  const rows: Array<{ label: string; value: ReactNode; testid: string }> = [
    { label: 'Title', value: editableValue('title', r.title, 'Add title', true), testid: 'detail-title' },
    { label: 'Artist', value: r.artist, testid: 'detail-artist' },
    { label: 'Format', value: selectedFormatLabel, testid: 'detail-format' },
    { label: 'Year', value: editableValue('year', r.year, 'Add year'), testid: 'detail-year' },
    { label: 'Tracks', value: `${r.tracks} tracks`, testid: 'detail-tracks' },
    { label: 'Catalog Number', value: editableValue('catalogNumber', r.catalogNumber ?? '', 'Add catalog number'), testid: 'detail-catalog-number' },
    { label: 'UPC Code', value: editableValue('upc', r.upc ?? '', 'Add UPC'), testid: 'detail-upc' },
    {
      label: 'Visibility',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} aria-hidden /> {r.visibility}
        </span>
      ),
      testid: 'detail-visibility',
    },
  ];
  return (
    <div style={{ marginTop: 26 }}>
      <PageHeader as="h2" title="Details" subtitle="Everything about this release at a glance" />
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid="release-details">
        {rows.map((r2, i) => (
          <div
            key={r2.testid}
            className="group flex items-center justify-between gap-6 transition-colors"
            style={{ padding: '13px 18px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
            data-testid={r2.testid}
          >
            <span className="text-[12px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: t.faint }}>{r2.label}</span>
            <span className="text-[13.5px] text-right min-w-0" style={{ color: t.subink }}>{r2.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ASSETS TAB — Art / Audio lanes, Master / Player / Vinyl formats
// ═══════════════════════════════════════════════════════════════════

type VinylArtBlock = {
  id: string;
  title: string;
  status: 'waiting' | 'album' | 'custom';
  imageUrl: string | null;
};

function templateIconKind(id: string, title: string): PressTemplateIconKind {
  const key = `${id} ${title}`.toLowerCase();
  if (key.includes('label') || key.includes('disc face') || key.includes('shell print')) return 'labels';
  if (key.includes('sticker')) return 'sticker';
  if (key.includes('inner') || key.includes('sleeve') || key.includes('tray card')) return 'sleeve';
  if (key.includes('booklet') || key.includes('j-card')) return 'booklet';
  if (key.includes('insert') || key.includes('obi')) return 'insert';
  if (key.includes('jacket') || key.includes('cover') || key.includes('gatefold') || key.includes('o-card')) return 'jacket';
  return 'other';
}

function MediaImportDialog({ block, t, onClose, onConfirm }: {
  block: VinylArtBlock;
  t: Theme;
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<'upload' | 'url'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [invalidFile, setInvalidFile] = useState(false);
  const choose = (candidate?: File) => {
    if (!candidate) return;
    const valid = candidate.type === 'application/pdf' || candidate.type.startsWith('image/') || /\.(pdf|png|jpe?g|tiff?|webp)$/i.test(candidate.name);
    setInvalidFile(!valid);
    if (valid) setFile(candidate);
  };
  const guidance = block.title.toLowerCase().includes('label')
    ? 'PDF or print-ready label artwork. Include the full panel at the press template size.'
    : 'PDF or image artwork. Include the full panel at the press template size.';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(20,20,22,0.46)', backdropFilter: 'blur(2px)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[440px] rounded-2xl" role="dialog" aria-modal="true" aria-label={`Import ${block.title} art`} data-testid={`media-import-dialog-${block.id}`} style={{ background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 24px 70px rgba(0,0,0,.34)', padding: 20 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: t.ink }}>Import {block.title} art</h2>
            <p className="mt-1 text-xs" style={{ color: t.subink }}>{guidance}</p>
          </div>
          <IconButton type="button" onClick={onClose} label="Close import dialog" variant="ghost" style={{ color: t.subink }} data-testid="media-import-close"><X /></IconButton>
        </div>
        <div className="mt-4 flex gap-1 rounded-xl p-1" style={{ background: t.soft }}>
          {(['upload', 'url'] as const).map((value) => (
            <button key={value} type="button" onClick={() => setMethod(value)} className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: method === value ? t.card : 'transparent', color: method === value ? t.ink : t.subink, boxShadow: method === value ? '0 1px 3px rgba(0,0,0,.08)' : undefined }} data-testid={`media-import-method-${value}`}>
              {value === 'upload' ? 'Upload file' : 'Paste a URL'}
            </button>
          ))}
        </div>
        {method === 'upload' ? (
          <>
            <input ref={inputRef} type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} data-testid={`media-import-input-${block.id}`} />
            <div
              className="mt-3 flex w-full flex-col items-center justify-center rounded-xl text-center"
              style={{ minHeight: 150, padding: '24px 16px', border: `1.5px dashed ${dragging ? BLUE : t.dashed}`, background: dragging ? t.soft : t.dropEmpty, color: t.subink }}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
              data-testid={`media-import-drop-${block.id}`}
            >
              {file ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: t.ink }}><FileImage className="h-4 w-4" />{file.name}<Check className="h-4 w-4" style={{ color: t.ready }} /></span>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6" />
                  <span className="mt-2 text-sm font-semibold" style={{ color: t.ink }}>Drop your artwork here</span>
                  <button
                    type="button"
                    className="mt-3 rounded-full px-4 py-2 text-sm font-semibold"
                    style={{ color: BLUE, border: `1px solid ${BLUE}`, background: 'transparent' }}
                    onClick={() => inputRef.current?.click()}
                    data-testid={`media-import-choose-${block.id}`}
                  >
                    Choose file
                  </button>
                </>
              )}
            </div>
            <p className="mt-2 text-xs" style={{ color: t.faint }}>Accepted: PDF, PNG, JPG, TIFF, or WebP. Files are checked against the press template after upload.</p>
            {invalidFile && <p className="mt-1 text-xs" style={{ color: t.fail }}>That file type cannot be used for this art slot. Choose a PDF or image file.</p>}
          </>
        ) : (
          <div className="mt-3 rounded-xl p-4" style={{ background: t.soft, border: `1px solid ${t.hairline}` }}>
            <p className="text-xs font-semibold" style={{ color: t.ink }}>URL import isn’t available for this art surface</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: t.subink }}>Choose a local file instead. There is no existing production URL-mirroring path for completed-template artwork, so this action is intentionally unavailable.</p>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3.5 py-2 text-sm font-medium" style={{ color: t.subink }}>Cancel</button>
          <button type="button" disabled={method !== 'upload' || !file} onClick={() => file && onConfirm(file)} className="rounded-full px-4 py-2 text-sm font-semibold" style={method === 'upload' && file ? { background: BLUE, color: '#fff' } : { border: `1px solid ${t.hairline}`, color: t.faint, cursor: 'not-allowed' }} data-testid={`media-import-confirm-${block.id}`}>Upload</button>
        </div>
      </div>
    </div>
  );
}

function BlockCard({ block, href, t, canUpload }: { block: VinylArtBlock; href: string; t: Theme; canUpload: boolean }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const albumId = href.split('/')[3] ?? '';
  const openTest = () => navigate(`${href.split('?')[0]}${window.location.search}`);
  const upload = async (file: File | undefined) => {
    if (!file || uploading || !albumId) return;
    setUploading(true);
    try {
      const url = await uploadAdminDocWithProgress(file, () => {});
      await apiRequest('POST', `/api/admin/albums/${albumId}/completed-template/check`, {
        componentId: block.id,
        url,
        fileName: file.name,
      });
      await queryClient.invalidateQueries({ queryKey: [`/api/admin/albums/${albumId}/completed-template`] });
      toast({ description: 'Custom art uploaded' });
    } catch (error: any) {
      toast({ description: error?.message || 'Couldn’t upload that art', variant: 'destructive' });
    } finally {
      setUploading(false);
      setDialogOpen(false);
      launcherRef.current?.focus();
    }
  };
  const status = block.status === 'custom'
    ? { label: 'Custom art uploaded', icon: <FileImage className="w-3.5 h-3.5" aria-hidden /> }
    : block.status === 'album'
      ? { label: 'Using album art', icon: <Link2 className="w-3.5 h-3.5" aria-hidden /> }
      : { label: 'Waiting for art', icon: <Circle className="w-3.5 h-3.5" aria-hidden /> };
  return (
    <div
      className={cn('gt-tile w-full h-full rounded-2xl overflow-hidden flex flex-col text-left transition-colors cursor-pointer', t.hoverCard)}
      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}
      data-testid={`block-${block.id}`}
    >
      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          if (block.status === 'custom') openTest();
          else if (canUpload) setDialogOpen(true);
        }}
        className="relative block w-full flex-shrink-0 overflow-hidden"
        style={{ height: 240, backgroundColor: t.dropEmpty, borderBottom: `1px solid ${t.hairline}` }}
        data-testid={block.status === 'custom' ? `open-art-test-${block.id}` : `open-artwork-importer-${block.id}`}
        aria-label={block.status === 'custom' ? `Open Test and Certify for ${block.title}` : canUpload ? `Open artwork importer for ${block.title}` : `${block.title} art`}
      >
        {block.imageUrl ? (
          <img
            src={block.imageUrl}
            alt={`${block.title} art`}
            className="w-full h-full object-cover"
            data-testid={`img-block-${block.id}`}
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <PressTemplateComponentIcon
              kind={templateIconKind(block.id, block.title)}
              color={t.faint}
              fill={t.dropEmpty}
              size={70}
            />
            <span className="text-xs font-medium" style={{ marginTop: 8, color: t.subink }}>{uploading ? 'Uploading…' : canUpload ? 'Open artwork importer' : 'Artwork upload locked'}</span>
          </span>
        )}
      </button>
      <div className="w-full flex flex-col" style={{ height: 78, padding: '14px 18px 16px' }}>
        <button type="button" onClick={() => block.status === 'custom' ? openTest() : canUpload && setDialogOpen(true)} className="text-left text-sm font-semibold truncate" style={{ color: t.ink, letterSpacing: '-0.01em' }} data-testid={block.status === 'custom' ? `open-art-test-title-${block.id}` : `open-artwork-importer-title-${block.id}`}>{block.title}</button>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ marginTop: 'auto', color: t.subink }}>
          {status.icon} {status.label}
        </span>
      </div>
      {dialogOpen && <MediaImportDialog block={block} t={t} onClose={() => { setDialogOpen(false); launcherRef.current?.focus(); }} onConfirm={(file) => void upload(file)} />}
    </div>
  );
}

// Press attribution — quiet inline text+icon utility (grayed to t.faint so the
// heading dominates). Monochrome mark on either surface via theme logoFilter.
function PressAttribution({ pressName, t }: { pressName: string; t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm font-medium flex-shrink-0"
      style={{ color: t.faint }}
      data-testid="press-attribution"
      title={`Press: ${pressName}`}
    >
      <Disc3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      {pressName}
    </span>
  );
}

// Templates — quiet inline text+icon utility, grayed to t.faint; no pill/border.
function TemplatesChip({ albumId, search, t }: { albumId: string; search: string; t: Theme }) {
  const [, navigate] = useLocation();
  const openTemplates = () => {
    const liveSearch = window.location.search.replace(/^\?/, '') || search;
    const current = new URLSearchParams(liveSearch);
    current.set('tab', 'assets');
    current.set('templateLibrary', '1');
    navigate(`/artist/albums/${albumId}?${current.toString()}`);
  };
  return (
    <button
      type="button"
      onClick={openTemplates}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80"
      style={{ color: t.faint }}
      data-testid="button-open-press-templates"
      title="Open press templates"
    >
      <Download className="w-3.5 h-3.5 flex-shrink-0" /> Templates
    </button>
  );
}

type ArtistTemplateSpec = {
  id: string;
  label?: string;
  templatePageInches?: { w: number; h: number } | null;
  finishedInches?: { w: number; h: number } | null;
  bleedInches?: number | null;
  expectedPages?: number | null;
  templateFileUrl?: string | null;
  printRules?: Record<string, unknown> | null;
};

function TemplateLibrary({ albumId, pressName, specs, loading, error, t, onBack }: {
  albumId: string;
  pressName: string;
  specs: ArtistTemplateSpec[];
  loading: boolean;
  error: boolean;
  t: Theme;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  const download = async (spec: ArtistTemplateSpec) => {
    if (!spec.templateFileUrl || downloading) return;
    setDownloading(spec.id);
    try {
      const blob = await fetchBlob(`/api/admin/albums/${albumId}/completed-template/template-file/${encodeURIComponent(spec.id)}`);
      const anchor = document.createElement('a');
      const href = URL.createObjectURL(blob);
      anchor.href = href;
      anchor.download = `${(spec.label || spec.id).replace(/[^\w\- ]+/g, '')} - press template.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e: any) {
      toast({ description: e?.message || 'The template could not be downloaded', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };
  const instructions = (spec: ArtistTemplateSpec) => {
    const rules = spec.printRules ?? {};
    const notes = [
      typeof rules.acceptedFormatsNote === 'string' ? rules.acceptedFormatsNote : null,
      typeof rules.placedImageRule === 'string' ? rules.placedImageRule : null,
      ...(Array.isArray(rules.advisories) ? rules.advisories.filter((value): value is string => typeof value === 'string') : []),
      ...(Array.isArray(rules.labelAdvisories) ? rules.labelAdvisories.filter((value): value is string => typeof value === 'string') : []),
    ].filter(Boolean);
    return notes.length ? notes.join(' · ') : 'No additional production instructions were provided.';
  };
  return (
    <section className="mt-7" data-testid="artist-template-library">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold" style={{ color: t.subink }}>
        <ArrowRight className="h-4 w-4 rotate-180" aria-hidden /> Back to Assets
      </button>
      <PageHeader as="h2" className="mt-5" title="Press templates" subtitle={`Production files supplied by ${pressName}. Download these before preparing artwork.`} />
      {loading ? (
        <div className="mt-5 space-y-3" data-testid="template-library-loading">{[0, 1, 2].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl" style={{ background: t.soft }} />)}</div>
      ) : error ? (
        <div className="mt-5 rounded-2xl p-6" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid="template-library-error">
          <p className="text-sm font-semibold" style={{ color: t.ink }}>Templates couldn’t be loaded</p>
          <p className="mt-1 text-xs" style={{ color: t.subink }}>Return to Assets and try again. Your album access has not changed.</p>
        </div>
      ) : specs.length === 0 ? (
        <div className="mt-5 rounded-2xl p-8 text-center" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid="template-library-empty">
          <p className="text-sm font-semibold" style={{ color: t.ink }}>Templates pending</p>
          <p className="mt-1 text-xs" style={{ color: t.subink }}>{pressName} has not supplied a template package for this album yet.</p>
        </div>
      ) : (
        <ol className="mt-5 overflow-hidden rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card }}>
          {specs.map((spec, index) => {
            const dimensions = spec.templatePageInches ?? spec.finishedInches;
            const available = !!spec.templateFileUrl;
            return <li key={spec.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center" style={{ borderTop: index ? `1px solid ${t.hairline}` : undefined }} data-testid={`template-row-${spec.id}`}>
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: t.soft }}>
                <PressTemplateComponentIcon kind={templateIconKind(spec.id, spec.label ?? '')} color={t.subink} fill={t.card} size={38} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: t.ink }}>{spec.label || spec.id}</p>
                <p className="mt-1 text-xs" style={{ color: t.subink }}>
                  {dimensions ? `${dimensions.w} × ${dimensions.h} in` : 'Dimensions pending'}
                  {spec.expectedPages ? ` · ${spec.expectedPages} ${spec.expectedPages === 1 ? 'page' : 'pages'}` : ''}
                  {spec.bleedInches != null ? ` · ${spec.bleedInches} in bleed` : ''}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: t.faint }}>{instructions(spec)}</p>
              </div>
              {available ? (
                <button type="button" disabled={downloading === spec.id} onClick={() => void download(spec)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50" style={{ color: BLUE, border: `1px solid ${BLUE}` }}>
                  <Download className="h-4 w-4" /> {downloading === spec.id ? 'Downloading…' : 'Download'}
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: t.faint }}><Clock className="h-4 w-4" /> Unavailable</span>
              )}
            </li>;
          })}
        </ol>
      )}
    </section>
  );
}

function deriveTrackTitle(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/^\s*(?:\d+\s*[-_.]\s*|\d{1,3}\s+)/, '')
    .replace(/[_]+/g, ' ')
    .trim() || 'Untitled track';
}

function AudioMasterList({
  tracks,
  assetFormat,
  albumId,
  canUpload,
  t,
  onShowMaster,
}: {
  tracks: Array<{ title: string; trackNumber?: number }>;
  assetFormat: 'digital' | 'master' | 'vinyl';
  albumId: string;
  canUpload: boolean;
  t: Theme;
  onShowMaster: () => void;
}) {
  const { enqueueAudioBatch } = useUploadManager();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { toast } = useToast();
  const forVinyl = assetFormat === 'vinyl';
  // Uploads remain canonical-source actions. The task-first Player view must
  // not hide the production master uploader that formerly lived under Master.
  const canUploadSourceMasters = canUpload && (assetFormat === 'master' || assetFormat === 'digital');
  const acceptFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((file) => /\.(mp3|m4a|aac|wav|flac|ogg|aif|aiff)$/i.test(file.name));
    if (!accepted.length) {
      toast({ description: 'Choose MP3, M4A, AAC, WAV, FLAC, OGG, AIF, or AIFF audio files', variant: 'destructive' });
      return;
    }
    const nextTrack = Math.max(0, ...tracks.map((track, index) => track.trackNumber ?? index + 1)) + 1;
    enqueueAudioBatch({
      albumId,
      files: accepted.map((file) => ({ file, title: deriveTrackTitle(file.name) })),
      suggestedStartNumber: nextTrack,
    });
    toast({ description: `Uploading ${accepted.length} ${accepted.length === 1 ? 'master' : 'masters'} in the background` });
    if (inputRef.current) inputRef.current.value = '';
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  };
  return (
    <div>
      {tracks.length > 0 && (
        <p className="mb-3 text-[length:var(--apple-type-secondary)] font-medium leading-[1.5]" style={{ color: t.subink }}>
          {forVinyl ? 'Lacquer masters derived from your album masters' : 'Album masters'}
        </p>
      )}
      <div
        id="artist-audio-track-controls"
        className={tracks.length === 0 ? 'rounded-2xl overflow-hidden' : undefined}
        style={tracks.length === 0 ? { border: `1px solid ${t.hairline}`, background: t.card } : undefined}
        data-testid={forVinyl ? 'audio-list-vinyl' : 'audio-list-master'}
      >
        {canUploadSourceMasters && (
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.flac,.aif,.aiff,.mp3,.m4a,.aac,.ogg"
            multiple
            className="sr-only"
            onChange={(event) => acceptFiles(event.target.files)}
            data-testid="input-upload-masters"
          />
        )}
        {tracks.length === 0 ? (
          canUploadSourceMasters ? (
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{ padding: '42px 20px', background: dragging ? t.soft : t.card }}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              data-testid="master-upload-dropzone"
            >
              <UploadCloud className="w-7 h-7" style={{ color: t.faint }} aria-hidden />
              <p className="text-[14px] font-semibold" style={{ marginTop: 10, color: t.ink }}>No tracks yet</p>
              <p className="text-[12.5px]" style={{ marginTop: 5, color: t.subink }}>Drop audio files here or choose them from your device</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
                style={{ marginTop: 16, background: BLUE }}
                data-testid="button-upload-masters"
              >
                <UploadCloud className="w-4 h-4" aria-hidden /> Upload masters
              </button>
            </div>
          ) : assetFormat === 'master' ? (
            <div className="flex flex-col items-center justify-center text-center" style={{ padding: '38px 20px' }}>
              <Lock className="w-5 h-5" style={{ color: t.faint }} aria-hidden />
              <p className="text-[14px] font-semibold" style={{ marginTop: 9, color: t.ink }}>Master uploads locked</p>
              <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>
                Your release team manages master uploads at this stage.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center" style={{ padding: '38px 20px' }}>
              <p className="text-[14px] font-semibold" style={{ color: t.ink }}>No tracks yet</p>
              <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>
                {assetFormat === 'digital'
                  ? 'Player audio uses your album masters. Upload them once and they appear here automatically.'
                  : 'Vinyl audio uses your album masters. Upload them once and they appear here automatically.'}
              </p>
              <button type="button" onClick={onShowMaster} className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ marginTop: 12, color: BLUE }}>
                Upload masters <ArrowRight className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          )
        ) : (
          <>
            <ArtistReleaseTrackRows albumId={albumId} />
            {canUploadSourceMasters && (
              <div className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold"
                  style={{ color: BLUE, border: `1px solid ${BLUE}`, background: 'transparent' }}
                  data-testid="button-upload-more-masters"
                >
                  <UploadCloud className="w-4 h-4" aria-hidden /> Upload masters
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Component-id → friendly slot facts (mirrors the press-template component ids).
const COMPONENT_SLOTS: Record<string, { title: string }> = {
  jacket: { title: 'Cover · jacket' },
  labels: { title: 'Center labels' },
  sleeve: { title: 'Printed inner sleeve' },
  inner_sleeve: { title: 'Printed inner sleeve · spread' },
  insert: { title: 'Insert' },
  booklet: { title: 'Booklet' },
};

function ReleaseAssets({ portal, albumId, t, search }: { portal: PortalPayload; albumId: string; t: Theme; search: string }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasVinyl = portal.formats.some((f) => f.kind === 'vinyl');
  const vinylFormat = portal.formats.find((f) => f.kind === 'vinyl');
  const pressName = vinylFormat?.pressName?.trim() || 'Press not assigned';
  const initialContext = new URLSearchParams(search);
  const initialLane = initialContext.get('assetLane');
  const [lane, setLane] = useState<'art' | 'audio' | 'bonus'>(
    initialLane === 'audio' || initialLane === 'bonus' ? initialLane : 'art',
  );
  // `master` is a source-management mode, not a product selector option.
  // Keeping it in state preserves the former production uploader without
  // advertising an invalid product/task combination.
  const initialProduct = initialContext.get('assetProduct');
  const [assetFormat, setAssetFormat] = useState<'digital' | 'gooddeed' | 'vinyl' | 'master'>(
    initialProduct === 'digital' || initialProduct === 'gooddeed' || (initialProduct === 'vinyl' && hasVinyl)
      ? initialProduct
      : hasVinyl ? 'vinyl' : 'digital',
  );
  const [bonusType, setBonusType] = useState<'videos' | 'photos'>(initialContext.get('bonusType') === 'photos' ? 'photos' : 'videos');
  const [addFormatOpen, setAddFormatOpen] = useState(false);
  const addFormat = useMutation({
    mutationFn: async ({ sellMode, physicalFormat }: { sellMode: AlbumSellMode; physicalFormat: AlbumPhysicalFormat | null }) => {
      await apiRequest('PUT', `/api/admin/albums/${albumId}`, { sellMode, physicalFormat });
    },
    onSuccess: async () => {
      setAddFormatOpen(false);
      await queryClient.invalidateQueries({ queryKey: [`/api/artist/albums/${albumId}/portal`] });
      toast({ description: 'Physical format added' });
    },
    onError: (error: Error) => {
      toast({ description: error.message || 'Couldn’t add the physical format', variant: 'destructive' });
    },
  });

  const album = useQuery<{ songs?: Array<{ title: string; trackNumber?: number }> }>({ queryKey: [`/api/albums/${albumId}`] });
  const scan = useQuery<{
    components?: Array<{ componentId: string; fileName?: string | null; previewUrl?: string | null }>;
    requiredComponents?: Array<string | ArtistTemplateSpec>;
  }>({
    queryKey: [`/api/admin/albums/${albumId}/completed-template`],
    enabled: hasVinyl,
    retry: false,
  });

  const tracks = album.data?.songs ?? [];
  const templateLibraryOpen = initialContext.get('templateLibrary') === '1';
  const closeTemplateLibrary = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('templateLibrary');
    navigate(`${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  };
  const templateSpecs: ArtistTemplateSpec[] = (scan.data?.requiredComponents ?? []).map((spec) =>
    typeof spec === 'string' ? { id: spec } : spec,
  );
  const products: Array<['digital' | 'gooddeed' | 'vinyl', string]> =
    lane === 'art'
      ? [
          ...(hasVinyl ? ([['vinyl', 'Vinyl']] as Array<['vinyl', string]>) : []),
          ['digital', 'GoodTunes® Player'],
          ['gooddeed', 'GoodDeed®'],
        ]
      : lane === 'audio'
        ? [
            ...(hasVinyl ? ([['vinyl', 'Vinyl']] as Array<['vinyl', string]>) : []),
            ['digital', 'GoodTunes® Player'],
          ]
        : [];
  const selectLane = (next: 'art' | 'audio' | 'bonus') => {
    setLane(next);
    const params = new URLSearchParams(window.location.search);
    params.set('assetLane', next);
    if (next === 'art' && assetFormat === 'master') {
      setAssetFormat('digital');
      params.set('assetProduct', 'digital');
    } else if (next === 'audio' && assetFormat === 'gooddeed') {
      const fallback = hasVinyl ? 'vinyl' : 'digital';
      setAssetFormat(fallback);
      params.set('assetProduct', fallback);
    }
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
  };
  const selectProduct = (next: 'digital' | 'gooddeed' | 'vinyl') => {
    setAssetFormat(next);
    const params = new URLSearchParams(window.location.search);
    params.set('assetProduct', next);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
  };
  const selectBonusType = (next: 'videos' | 'photos') => {
    setBonusType(next);
    const params = new URLSearchParams(window.location.search);
    params.set('bonusType', next);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
  };

  const blocks: VinylArtBlock[] = useMemo(() => {
    // requiredComponents rows are objects ({id, label, …}) from the
    // completed-template config; tolerate plain string ids too.
    const required = (scan.data?.requiredComponents ?? []).map((r) =>
      typeof r === 'string'
        ? { id: r, label: undefined as string | undefined, templatePageInches: null, finishedInches: null }
        : r);
    const byId = new Map((scan.data?.components ?? []).map((c) => [c.componentId, c]));
    const selectedRows = required.length
      ? required
      : Array.from(byId.keys()).map((id) => ({ id, label: undefined as string | undefined, templatePageInches: null, finishedInches: null }));
    // The package/order-version list is authoritative. De-duplicate only exact
    // component ids at this normalization boundary; similarly named, separately
    // selected pieces remain legitimate rows and keep their production labels.
    const seen = new Set<string>();
    const rows = selectedRows.filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return rows.map(({ id, label }) => {
      const c = byId.get(id);
      const slotKey = id.startsWith('inner_sleeve') ? 'inner_sleeve' : id;
      const meta = { title: label?.trim() || COMPONENT_SLOTS[slotKey]?.title || id.charAt(0).toUpperCase() + id.slice(1) };
      const hasCustomArt = !!c?.fileName;
      const hasAlbumArt = !!portal.release.artworkUrl;
      return {
        id,
        title: meta.title,
        status: hasCustomArt ? 'custom' : hasAlbumArt ? 'album' : 'waiting',
        imageUrl: hasCustomArt ? (c?.previewUrl ?? null) : hasAlbumArt ? (portal.release.artworkUrl ?? null) : null,
      };
    });
  }, [portal.release.artworkUrl, scan.data]);

  if (templateLibraryOpen) {
    return <TemplateLibrary albumId={albumId} pressName={pressName} specs={templateSpecs} loading={scan.isLoading} error={scan.isError} t={t} onBack={closeTemplateLibrary} />;
  }

  return (
    <>
      <div style={{ marginTop: 22 }} data-testid="asset-lane-row">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: t.faint }}>What are you working on?</p>
        <SegChip
          options={[['art', 'Art'], ['audio', 'Audio'], ['bonus', 'Bonus']]}
          value={lane}
          onChange={selectLane}
          ariaLabel="Asset family"
          testPrefix="lane"
          t={t}
          size="lg"
        />
        {lane !== 'bonus' && <div className="mt-7 flex items-end justify-between gap-5 border-b" style={{ borderColor: t.hairline }}>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Choose a product</p>
            <div className="flex flex-wrap gap-7" role="tablist" aria-label="Product">
              {products.map(([id, label]) => {
                const active = assetFormat === id;
                return <button key={id} type="button" role="tab" aria-selected={active} onClick={() => selectProduct(id)} className="relative pb-3 text-sm font-semibold transition-opacity hover:opacity-80" style={{ color: active ? t.ink : t.subink }} data-testid={`assetformat-${id}`}>
                  {label}
                  {active && <span className="absolute inset-x-0 bottom-[-1px] h-0.5 rounded-full" style={{ background: BLUE }} />}
                </button>;
              })}
            </div>
          </div>
          <button
          type="button"
          onClick={() => setAddFormatOpen(true)}
          style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
          data-testid="button-add-format"
          className={cn('mb-2 inline-flex items-center h-9 px-3 rounded-full text-sm font-semibold flex-shrink-0', t.hoverCard)}
        ><Plus className="w-3.5 h-3.5 mr-1.5" />Add format</button>
        </div>}
      </div>
      <NewAlbumModeDialog
        open={addFormatOpen}
        required={false}
        formatOnly
        busy={addFormat.isPending}
        onClose={() => setAddFormatOpen(false)}
        onSubmit={(selection) => addFormat.mutate(selection)}
      />

      {lane === 'bonus' ? (
        <>
          <PageHeader
            as="h2"
            className="mt-9"
            title="Bonus"
            subtitle="Extras for fans in the GoodTunes® Player."
            actions={<SegChip
              options={[['videos', 'Videos'], ['photos', 'Photos']]}
              value={bonusType}
               onChange={selectBonusType}
              ariaLabel="Bonus media"
              testPrefix="bonus"
              t={t}
            />}
          />
          <div className="mt-5" id="album-bonus-content">
            {(portal.access?.canEditMetadata ?? false) ? (
              bonusType === 'videos'
                ? <BonusVideos albumId={albumId} presentation="artist-assets" onEdit={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/albums', albumId, 'videos'] });
                  }} />
                : <BonusPhotos albumId={albumId} presentation="artist-assets" onEdit={() => {
                    queryClient.invalidateQueries({ queryKey: ['/api/albums', albumId, 'photos'] });
                  }} />
            ) : (
              <div className="rounded-2xl border p-6 text-center" style={{ borderColor: t.hairline, background: t.card }} data-testid="bonus-read-only">
              <p className="text-sm font-semibold" style={{ color: t.ink }}>Bonus content is read-only</p>
              <p className="mt-1 text-xs" style={{ color: t.subink }}>Your current release permissions allow viewing, but not adding or removing player extras.</p>
              </div>
            )}
          </div>
        </>
      ) : lane === 'audio' ? (
        <>
          <PageHeader
            as="h2"
            className="mt-9"
            title={assetFormat === 'master' ? 'Canonical masters' : `${assetFormat === 'digital' ? 'GoodTunes® Player' : 'Vinyl'} audio`}
            titleExtras={<>
              {assetFormat === 'vinyl' && <PressAttribution pressName={pressName} t={t} />}
              {assetFormat !== 'master' && (
                <button type="button" onClick={() => setAssetFormat('master')} className="text-sm font-medium transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-show-source-masters">
                  Manage source masters
                </button>
              )}
            </>}
            subtitle={
              <>
                {assetFormat === 'master'
                  ? 'The canonical files behind every format. Uploads, downloads, extraction, lyrics, credits, splits, and track actions stay on Individual Tracks.'
                  : assetFormat === 'vinyl'
                  ? 'The lacquer-ready set for this pressing. Uses your album masters for this pressing.'
                    : 'What buyers stream in the GoodTunes® Player. Individual Tracks owns masters, ordering, downloads, lyrics, credits, splits, and track actions.'}
              </>
            }
          />
          <AudioMasterList tracks={tracks} assetFormat={assetFormat === 'gooddeed' ? 'digital' : assetFormat} albumId={albumId} canUpload={portal.access?.canUploadMasters ?? portal.release.editing === 'Open'} t={t} onShowMaster={() => setAssetFormat('master')} />
        </>
      ) : (
        <>
          <PageHeader
            as="h2"
            className="mt-9"
            title={`${assetFormat === 'digital' ? 'GoodTunes® Player' : assetFormat === 'gooddeed' ? 'GoodDeed®' : 'Vinyl'} art`}
            titleExtras={<>
                {assetFormat === 'vinyl' && <PressAttribution pressName={pressName} t={t} />}
                {assetFormat === 'vinyl' && <TemplatesChip albumId={albumId} search={search} t={t} />}
            </>}
            subtitle={
              <>
                {assetFormat === 'digital'
                    ? 'What buyers see in the GoodTunes® Player. Uses your album art as-is — no press template to meet.'
                    : assetFormat === 'gooddeed'
                      ? 'The production GoodDeed® certificate remains the trusted renderer for every export.'
                    : 'Download the press templates, prepare each artwork file, then select a piece below to import and test it.'}
              </>
            }
          />

          {assetFormat === 'vinyl' ? (
            blocks.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" style={{ marginTop: 18 }}>
                {blocks.map((b) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    href={`/artist/albums/${albumId}/art-test/${b.id}${search ? `?${search}` : ''}`}
                    t={t}
                    canUpload={portal.access?.canEditMetadata ?? portal.release.editing === 'Open'}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 18, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
                <p className="text-[14px] font-semibold" style={{ color: t.ink }}>No print files scanned yet</p>
                <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>Once {pressName} scans your finished print files, each piece shows up here checked against the press template.</p>
              </div>
            )
          ) : assetFormat === 'gooddeed' ? (
            <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 18, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="gooddeed-production-note">
              <p className="text-sm font-semibold" style={{ color: t.ink }}>GoodDeed® production artwork</p>
              <p className="text-xs" style={{ marginTop: 6, color: t.subink, maxWidth: 460 }}>
                GoodDeed® artwork is generated from the production certificate when a copy is certified. No mock preview or replacement art is used here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 18, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
              {portal.release.artworkUrl ? (
                <img src={portal.release.artworkUrl} alt={`${portal.release.title} album art`} className="rounded-xl" style={{ width: 180, height: 180, objectFit: 'cover', border: `1px solid ${t.hairline}` }} data-testid="img-master-art" />
              ) : null}
              <p className="text-[14px] font-semibold" style={{ marginTop: portal.release.artworkUrl ? 16 : 0, color: t.ink }}>
                Player artwork
              </p>
              <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>
                The GoodTunes® Player shows the release image at a 1080×1080 target.
              </p>
              {hasVinyl && (
                <button type="button" onClick={() => setAssetFormat('vinyl')} className="text-[13px] font-semibold" style={{ marginTop: 14, color: BLUE }}>Show vinyl art</button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STORE TAB — channel picker, share link, Shopify connect, toggle,
// email appearance, Publish + readiness checklist
// ═══════════════════════════════════════════════════════════════════
function ReleaseStore({ portal, albumId, t }: { portal: PortalPayload; albumId: string; t: Theme }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const sellMode = portal.store.sellMode ?? '';
  const isShopify = sellMode.startsWith('shopify');
  const channel: 'goodtunes' | 'shopify' | null = !sellMode ? null : isShopify ? 'shopify' : 'goodtunes';
  const cl = portal.store.checklist;
  const checklist = [
    { id: 'art', label: 'Artwork added', pending: 'Artwork — not started', done: cl.art, href: `/artist/albums/${albumId}?tab=assets` },
    { id: 'audio', label: 'Audio in the player', pending: 'Audio — not started', done: cl.audio, href: `/artist/albums/${albumId}?tab=assets` },
    { id: 'price', label: 'Price set', pending: 'Price — not set', done: cl.price, href: `/admin/albums/${albumId}?tab=sell` },
    { id: 'channel', label: isShopify ? 'Shopify channel connected' : 'Sales channel chosen', pending: 'Sales channel — not chosen', done: cl.channel, href: `/admin/albums/${albumId}?tab=sell` },
  ];
  const ready = checklist.every((c) => c.done);

  const channels = [
    { id: 'goodtunes' as const, title: 'GoodTunes® Direct', blurb: 'We press it, sell it, and fulfill it. The GoodTunes® storefront is the share link below.', logo: goodtunesLogo, alt: 'GoodTunes®', h: 26 },
    { id: 'shopify' as const, title: 'GoodTunes® for Shopify', blurb: 'You sell on your own Shopify store. We press, run GoodDeed®, and can fulfill for you too.', logo: shopifyLogo, alt: 'Shopify', h: 22 },
  ];
  const shareLinks = [
    ...(portal.store.artistUrl ? [{ label: 'Artist URL', url: portal.store.artistUrl }] : []),
    ...(portal.store.albumUrl ? [{ label: 'Album URL', url: portal.store.albumUrl }] : []),
  ];

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      toast({ description: 'Link copied' });
    } catch {
      toast({ description: 'Couldn\u2019t copy — select and copy the link text', variant: 'destructive' });
    }
  };

  return (
    <div className="grid gap-5" style={{ marginTop: 26, gridTemplateColumns: 'minmax(0, 1fr) 340px' }} data-testid="release-store">
      {/* LEFT — channel picker + channel-specific content */}
      <div className="space-y-5">
        {/* Channel picker — stacked rows w/ real brand marks (Sell-choice canon).
            Channel changes are an operator conversation for now — rows read
            state, they don't switch it. */}
        <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="channel-picker">
          <h2 className="text-[16px] font-semibold" style={{ color: t.ink }}>Where does this sell?</h2>
          <p className="text-[13px]" style={{ marginTop: 4, color: t.subink, lineHeight: 1.5 }}>
            Fans always get the music in the GoodTunes® player and their GoodDeed® no matter which you pick; only checkout differs.
          </p>
          <div className="flex flex-col" style={{ marginTop: 16, gap: 12 }}>
            {channels.map((o) => {
              const active = o.id === channel;
              return (
                <div
                  key={o.id}
                  data-testid={`channel-option-${o.id}`}
                  className="w-full rounded-2xl text-left"
                  style={{ padding: '16px 18px', border: `${active ? 2 : 1}px solid ${active ? BLUE : t.hairline}`, background: t.canvas, opacity: active ? 1 : 0.7 }}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex items-center justify-center flex-shrink-0" style={{ width: 72 }}>
                      <img src={o.logo} alt={o.alt} style={{ height: o.h, width: 'auto', filter: t.logoFilter }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold" style={{ color: t.ink }}>{o.title}</div>
                      <p className="text-[12.5px]" style={{ marginTop: 3, color: t.subink, lineHeight: 1.45 }}>{o.blurb}</p>
                    </div>
                    <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, border: `2px solid ${active ? BLUE : t.dashed}`, background: active ? BLUE : 'transparent', boxShadow: active ? `inset 0 0 0 3px ${t.card}` : undefined }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Channel-specific block */}
        {channel === 'goodtunes' ? (
          <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="share-link-section">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4" style={{ color: t.subink }} />
              <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Share link</h3>
              {portal.store.sellMode === 'live' && (
                <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: t.passBg, color: t.ready }}>
                  <Check className="w-3 h-3" strokeWidth={3} /> Live
                </span>
              )}
            </div>
            <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink }}>This is your GoodTunes® storefront — the page fans land on.</p>
            {shareLinks.length === 0 && (
              <p className="text-[12.5px]" style={{ marginTop: 12, color: t.faint }}>Share links appear once your storefront page is set up.</p>
            )}
            {shareLinks.map((row) => (
              <div key={row.label} className="flex items-center gap-2" style={{ marginTop: 12 }}>
                <div className="flex-1 min-w-0 rounded-xl flex items-center px-3" style={{ height: 40, border: `1px solid ${t.hairline}`, background: t.canvas }}>
                  <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint, marginRight: 8 }}>{row.label}</span>
                  <span className="text-[12.5px] truncate" style={{ color: t.ink }}>{row.url}</span>
                </div>
                <button type="button" onClick={() => copyLink(row.url)} className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors', t.hoverCard)} style={{ border: `1px solid ${t.hairline}`, color: t.subink }} aria-label="Copy" data-testid={`copy-${row.label}`}>
                  <Copy className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => window.open(`https://${row.url}`, '_blank', 'noopener')} className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors', t.hoverCard)} style={{ border: `1px solid ${t.hairline}`, color: t.subink }} aria-label="Open" data-testid={`open-${row.label}`}>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : channel === 'shopify' ? (
          <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="shopify-connect-section">
            <div className="flex items-center gap-2">
              <img src={shopifyLogo} alt="Shopify" style={{ height: 18, filter: t.logoFilter }} />
              <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Your Shopify store</h3>
            </div>
            {portal.store.shopifyConnected ? (
              <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
                <Check className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} style={{ color: t.ready }} />
                <span className="text-[12.5px] font-semibold" style={{ color: t.ink }}>Connected — fans buy on your store; we handle GoodDeed® and can fulfill.</span>
              </div>
            ) : (
              <>
                <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, lineHeight: 1.5 }}>Connect the store, map this album to a product, and paste its sale URL. Fans buy on your store; we handle GoodDeed® and can fulfill.</p>
                <div className="flex items-center gap-2 rounded-xl" style={{ marginTop: 14, padding: '12px 14px', background: t.warnBg, border: `1px solid ${t.warnBorder}` }}>
                  <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, border: `2px solid ${t.warn}` }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: t.warnInk }}>Not connected — needed before you can publish to Shopify</span>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Email appearance — the post-purchase note fans get. */}
        <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="email-appearance">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4" style={{ color: t.subink }} />
            <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Email appearance</h3>
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink }}>The post-purchase note fans get. Follows the channel above.</p>
          <div className="rounded-xl flex items-start gap-3" style={{ marginTop: 12, padding: 14, border: `1px solid ${t.hairline}`, background: t.canvas }}>
            {portal.release.artworkUrl && (
              <img src={portal.release.artworkUrl} alt="" aria-hidden className="rounded-md flex-shrink-0" style={{ width: 44, height: 44, objectFit: 'cover' }} />
            )}
            <div className="min-w-0">
              <div className="text-[13px] font-semibold" style={{ color: t.ink }}>Thank you for backing {portal.release.title}</div>
              <p className="text-[12px]" style={{ marginTop: 2, color: t.subink, lineHeight: 1.45 }}>Your music is in the GoodTunes® player, and your GoodDeed® is on its way.</p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — readiness checklist */}
      <div className="space-y-5">
        <div className="rounded-2xl sticky" style={{ top: 24, border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="publish-panel">
          <h3 className="text-[15px] font-semibold" style={{ color: t.ink }}>{ready ? 'Ready for fans' : 'Getting ready'}</h3>
          <p className="text-[12.5px]" style={{ marginTop: 4, color: t.subink, lineHeight: 1.5 }}>
            {channel === 'goodtunes'
              ? `${portal.release.title} sells on the GoodTunes® storefront.`
              : channel === 'shopify'
                ? `${portal.release.title} sells on your Shopify store.`
                : 'Choose where this release will sell.'}
          </p>
          <div className="space-y-2" style={{ marginTop: 16 }}>
            {checklist.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={c.done ? undefined : () => navigate(c.href)}
                className="flex w-full items-center gap-2.5 text-left disabled:cursor-default"
                disabled={c.done}
                data-testid={`readiness-${c.id}`}
              >
                {c.done
                  ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: t.ready }} strokeWidth={3} />
                  : <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, border: `2px solid ${t.warn}` }} />}
                <span className="text-[13px] font-medium" style={{ color: c.done ? t.ink : BLUE }}>{c.done ? c.label : c.pending}</span>
                {!c.done && <ChevronRight className="ml-auto w-3.5 h-3.5" style={{ color: BLUE }} aria-hidden />}
              </button>
            ))}
          </div>
          {ready && (
            <p className="text-[11.5px]" style={{ marginTop: 14, color: t.faint, lineHeight: 1.5 }}>Everything passed — this release is set up end to end.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENTS TAB — project rows + milestone schedules
// ═══════════════════════════════════════════════════════════════════
function ProjectRow({ project, expanded, onToggle, t }: { project: PortalPayload['payments'][number]; expanded: boolean; onToggle: () => void; t: Theme }) {
  const quoted = !project.milestones || project.milestones.length === 0;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid={`project-row-${project.id}`}>
      <button type="button" onClick={!quoted ? onToggle : undefined} className="w-full flex items-center justify-between gap-4 px-5" style={{ height: 68 }}>
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="h-9 w-9 rounded-full bg-white ring-1 ring-black/10 flex items-center justify-center flex-shrink-0 p-1.5">
            <img src={mrpLabelLogo} alt="" aria-hidden className="w-full h-full object-contain" style={{ filter: 'brightness(0)' }} />
          </span>
          <div className="min-w-0 text-left">
            <div className="text-[14.5px] font-semibold truncate" style={{ color: t.ink }}>
              {project.title} · <span style={{ color: t.subink, fontWeight: 500 }}>{project.summary}</span>
            </div>
            <div className="text-[12.5px] mt-0.5" style={{ color: quoted ? t.subink : t.warnInk }}>
              {quoted ? 'Estimate accepted — schedule pending' : `${fmtDollars(project.outstandingCents ?? 0)} outstanding`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {quoted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.soft, color: t.subink }}>
              <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${t.subink}` }} />
              Estimated
            </span>
          ) : (
            <ChevronDown className="w-4 h-4 transition-transform" style={{ color: t.faint, transform: expanded ? 'rotate(180deg)' : 'none' }} />
          )}
        </div>
      </button>

      {expanded && project.milestones && project.milestones.length > 0 && (
        <div className="px-5 pb-5" style={{ borderTop: `1px solid ${t.hairline}`, paddingTop: 16 }} data-testid={`schedule-${project.id}`}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: t.faint }}>Payment schedule</span>
            <span className="text-[12px]" style={{ color: t.subink }}>Generated from your accepted estimate</span>
          </div>
          <div className="space-y-3">
            {project.milestones.map((m, i) => (
              <div key={m.id} className="rounded-xl" style={{ border: `1px solid ${t.hairline}`, padding: 16, background: t.canvas }} data-testid={`milestone-${m.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold" style={{ background: t.soft, color: t.subink }}>{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{m.label}</div>
                      <div className="text-[15px] font-semibold" style={{ marginTop: 2, color: t.ink }}>{fmtDollars(m.amountCents)}</div>
                      <p className="text-[11.5px]" style={{ marginTop: 4, color: t.faint, lineHeight: 1.45 }}>{m.note}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <MilestoneStatus word={m.status} t={t} />
                    {m.status === 'requested' && (
                      <CanonPill label="Pay GoodTunes®" onClick={() => { if (m.payUrl) window.open(m.payUrl, '_blank', 'noopener'); }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11.5px]" style={{ marginTop: 12, color: t.faint, lineHeight: 1.5 }}>
            You only ever pay GoodTunes®. Press names are context, never the payee — GoodTunes® releases funds to {project.press} at each milestone.
          </p>
        </div>
      )}
    </div>
  );
}

function ReleasePayments({ portal, t }: { portal: PortalPayload; t: Theme }) {
  const withSchedule = portal.payments.find((p) => (p.milestones ?? []).length > 0);
  const [expanded, setExpanded] = useState<string | null>(withSchedule?.id ?? null);
  // Manufacturing-ledger steps (Shopify+ pressing runs) live in their own
  // table — the same key ShopifyPlusPanel uses, so the cache is shared with
  // the embedded partner view. gatePayouts admits the release owner and
  // teammates with payment access; anyone else 403s and we show nothing.
  const ledgerQ = useQuery<{ steps?: Array<{ id: string }> }>({
    queryKey: ["/api/admin/albums", portal.release.id, "manufacturing-ledger"],
    retry: false,
  });
  const hasLedgerSteps = (ledgerQ.data?.steps?.length ?? 0) > 0;
  const ledgerSettled = !ledgerQ.isLoading;
  // A 403 just means no payment access (treated as no ledger); any other
  // failure must not masquerade as "Nothing owed".
  const ledgerErrored =
    ledgerQ.isError && !/^403/.test(String((ledgerQ.error as any)?.message ?? ""));
  return (
    <>
      <PageHeader
        as="h2"
        className="mt-6"
        title="Money out to the plant"
        subtitle="One row per project — a format pressed by one plant. You only ever pay GoodTunes®; we release funds to the plant at each milestone"
      />
      {hasLedgerSteps && (
        <div className="mb-4">
          <ManufacturingLedger
            albumId={portal.release.id}
            canEdit={false}
            canPay={true}
            isOperatorView={false}
          />
        </div>
      )}
      {portal.payments.length === 0 && !hasLedgerSteps ? (
        !ledgerSettled ? (
          <div className="rounded-2xl flex items-center justify-center" style={{ padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
            <p className="text-[12.5px]" style={{ color: t.subink }}>Loading payments…</p>
          </div>
        ) : ledgerErrored ? (
          <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="note-ledger-load-failed">
            <p className="text-[14px] font-semibold" style={{ color: t.ink }}>Couldn't load manufacturing payments</p>
            <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>Refresh to try again. If this keeps happening, contact GoodTunes.</p>
          </div>
        ) : (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
          <p className="text-[14px] font-semibold" style={{ color: t.ink }}>Nothing owed on this release</p>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>Payment schedules appear here once a pressing project starts.</p>
        </div>
        )
      ) : (
        <div className="space-y-3">
          {portal.payments.map((p) => (
            <ProjectRow key={p.id} project={p} expanded={expanded === p.id} onToggle={() => setExpanded((cur) => (cur === p.id ? null : p.id))} t={t} />
          ))}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE — five-tab release view, tab mirrored into ?tab=
// ═══════════════════════════════════════════════════════════════════
export function ArtistRelease({ albumId }: { albumId: string }) {
  const t = useRestructureTheme();
  const [, navigate] = useLocation();
  const search = useSearch();
  const tab = new URLSearchParams(search).get('tab') ?? 'dashboard';
  const setTab = (next: string) => {
    const params = new URLSearchParams(search);
    if (next === 'dashboard') params.delete('tab'); else params.set('tab', next);
    const qs = params.toString();
    navigate(`/artist/albums/${albumId}${qs ? `?${qs}` : ''}`, { replace: true });
  };

  // Super-admin god view passes ?personId= through the URL — thread it.
  const personId = new URLSearchParams(search).get('personId');
  const portalQueryKey = `/api/artist/albums/${albumId}/portal${personId ? `?personId=${personId}` : ''}`;
  const portalQ = useQuery<PortalPayload>({ queryKey: [portalQueryKey] });
  const portal = portalQ.data;

  return (
    <PageColumn>
      <ReleaseHeader activeTab={tab} title={portal?.release.title ?? '…'} t={t} onTab={setTab} onCrumb={() => navigate('/artist?tab=catalog')} />
      {portalQ.isLoading ? (
        <p className="text-[13.5px]" style={{ marginTop: 26, color: t.subink }}>Loading this release…</p>
      ) : portalQ.isError || !portal ? (
        <p className="text-[13.5px]" style={{ marginTop: 26, color: t.subink }} data-testid="release-error">Couldn&rsquo;t load this release. Refresh to try again.</p>
      ) : tab === 'dashboard' ? (
        <ReleaseDashboard portal={portal} albumId={albumId} t={t} onOpenFormat={() => setTab('assets')} />
      ) : tab === 'details' ? (
        <ReleaseDetails portal={portal} albumId={albumId} portalQueryKey={portalQueryKey} t={t} />
      ) : tab === 'assets' ? (
        <ReleaseAssets portal={portal} albumId={albumId} t={t} search={search} />
      ) : tab === 'store' ? (
        <ReleaseStore portal={portal} albumId={albumId} t={t} />
      ) : (
        <ReleasePayments portal={portal} t={t} />
      )}
    </PageColumn>
  );
}
