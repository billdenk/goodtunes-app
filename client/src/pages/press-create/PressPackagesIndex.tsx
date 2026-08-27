// PressPackagesIndex — the press-side "MRP Packages" catalog. A press (MRP)
// sees and edits the packages they've built with the builder. These are the
// press's OWN saved packages, distinct from GoodTunes' standard set.
//
// BODY ONLY (Ruby handoff, Aug 19 2026): the mock's PressShell is dropped —
// this renders INSIDE OperatorShell. Dark mode comes from useAdminDark()
// (dark = body.gt-admin-dark). Live data replaces the MOCK_ consts:
// GET /api/press/:id/estimates?kind=package supplies the rows; the card's
// vinyl, cover, sell line and price all read off the row payload the builder
// wrote. The disc/cover renderers are imported from the builder so the card
// face is pixel-identical to the builder's live preview.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CheckCircle2, Check, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAdminDark } from '@/lib/adminAppearance';
import {
  CATALOG_COLORS,
  VinylDisc,
  PPB_COVERS,
  matchVinylBackground,
  DEFAULT_KIND_MIN_QTY,
  usePressBrand,
  usePressCatalogSwatches,
  resolveSavedSwatch,
  savedSnapshotSwatch,
  parseSummaryColorName,
} from './PressPackageBuilder';

type Swatch = (typeof CATALOG_COLORS)[number];

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = 'var(--q-ink)';
const SUBINK = 'var(--q-subink)';
const HAIRLINE = 'var(--q-hairline)';
const PILL_SHADOW = 'var(--q-pill-shadow)';

// Vars are scoped to the page root (.q-create-root) so portalled popovers on
// the page resolve them too. The <style> tag mounts only while this page is
// mounted; the dark override rides on body.gt-admin-dark (admin appearance).
const Q_THEME_CSS = String.raw`
.q-create-root { --q-ink:#1d1d1f; --q-subink:#6e6e73; --q-hairline:#e6e6ea; --q-canvas:#f5f5f7; --q-rail:#f5f5f7; --q-card:#ffffff; --q-track:#f2f2f5; --q-frost:rgba(255,255,255,0.78); --q-pill-shadow:0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04); }
body.gt-admin-dark .q-create-root { --q-ink:#f5f5f7; --q-subink:#98989d; --q-hairline:rgba(255,255,255,0.12); --q-canvas:#161617; --q-rail:#1c1c1e; --q-card:#2a2a2d; --q-track:rgba(255,255,255,0.08); --q-frost:rgba(22,22,23,0.72); --q-pill-shadow:0 1px 3px rgba(0,0,0,0.5); }
body.gt-admin-dark .q-create-root .bg-white { background-color: var(--q-card) !important; }
body.gt-admin-dark .q-create-root .hover\:bg-slate-50:hover, body.gt-admin-dark .q-create-root .hover\:bg-slate-100:hover, body.gt-admin-dark .q-create-root .hover\:bg-slate-200:hover, body.gt-admin-dark .q-create-root .hover\:bg-black\/5:hover { background-color: rgba(255,255,255,0.07) !important; }
body.gt-admin-dark .q-create-root .ring-slate-200 { --tw-ring-color: rgba(255,255,255,0.15); }
body.gt-admin-dark .q-create-root .placeholder\:text-slate-400::placeholder { color: rgba(255,255,255,0.30); }
body.gt-admin-dark .q-create-root .hover\:text-slate-600:hover { color: #d0d0d5 !important; }
@keyframes ppiSavedDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
`;

// ─── Two-tone heading (from the donor's PageHeading) ─────────────────
function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PACKAGE DATA
// ═══════════════════════════════════════════════════════════════════
type PkgStatus = 'live' | 'draft' | 'archived';

type Pkg = {
  id: string;
  name: string;
  sell: string;
  coverId: string;      // PPB cover id or 'match'
  swatch: Swatch;       // vinyl swatch driving the disc + Magic Background
  minRun: number;
  perUnit: number;      // per-unit dollars at the minimum run
  status: PkgStatus;
  specLine: string;     // builder summary line
  updatedAt: string;
};

// Live estimate/package row shape (server-scoped, auth-gated).
type EstimateRow = {
  id: string;
  pressId: string;
  kind: 'estimate' | 'package';
  displayId: string | null;
  title: string;
  status: string;
  payload: any;
  createdAt: string;
  updatedAt: string;
};

function fmt(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rowToPkg(row: EstimateRow, catalog: Swatch[]): Pkg {
  const p = row.payload ?? {};
  const bs = p.builderState ?? {};
  // Shared saved-color resolution (Task #3437) — same lookup the builder
  // uses on Edit: id against the full catalog, then the saved name snapshot
  // (payload.colorSnapshot on new saves, summary-line name on legacy rows).
  // A color the catalog dropped entirely renders from its snapshot instead
  // of silently borrowing another color's swatch.
  const savedName: string | undefined =
    p.colorSnapshot?.name ??
    parseSummaryColorName(p.summary) ??
    CATALOG_COLORS.find((c) => c.id === bs.colorId)?.name;
  const swatch =
    resolveSavedSwatch(catalog, bs.colorId, savedName) ??
    CATALOG_COLORS.find((c) => c.id === bs.colorId) ??
    (bs.colorId && bs.colorKind
      ? savedSnapshotSwatch(
          { id: bs.colorId, kind: bs.colorKind, name: savedName, base: p.colorSnapshot?.base, photo: p.colorSnapshot?.photo },
          bs.sizeId ?? '12',
        )
      : null) ??
    catalog[0] ??
    CATALOG_COLORS[0];
  const minRun = Number(p.minRun ?? bs.minRunQty ?? DEFAULT_KIND_MIN_QTY[swatch.kind] ?? 300) || 300;
  const perUnitCents = Number(p.minPerUnitCents ?? p.perUnitCents ?? 0) || 0;
  const status: PkgStatus = row.status === 'live' ? 'live' : row.status === 'archived' ? 'archived' : 'draft';
  return {
    id: row.id,
    name: row.title,
    sell: String(p.sell ?? bs.cardSell ?? ''),
    coverId: String(p.coverId ?? bs.cardCoverId ?? 'match'),
    swatch,
    minRun,
    perUnit: perUnitCents / 100,
    status,
    specLine: String(p.summary ?? ''),
    updatedAt: row.updatedAt,
  };
}

// Word + icon status (Bill is colorblind — never color alone).
function StatusPill({ status }: { status: PkgStatus }) {
  const live = status === 'live';
  const Icon = live ? CheckCircle2 : status === 'archived' ? Archive : Pencil;
  const label = live ? 'Live' : status === 'archived' ? 'Archived' : 'Draft';
  const tone = live ? BLUE : '#8e8e93';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold"
      style={{
        padding: '4px 11px 4px 9px',
        color: tone,
        backgroundColor: live ? `${BLUE}12` : 'rgba(142,142,147,0.14)',
        border: `1px solid ${live ? `${BLUE}33` : 'rgba(142,142,147,0.28)'}`,
      }}
      data-testid={`status-${status}`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
      {label}
    </span>
  );
}

// ─── The artist-rail card face — the builder's 460×260 stage, scaled to fit
// whatever width the grid gives it (ResizeObserver keeps it crisp). ─────────
function ArtistCardFace({ pkg, radius = 0 }: { pkg: Pkg; radius?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 460));
    ro.observe(el);
    setScale(el.clientWidth / 460);
    return () => ro.disconnect();
  }, []);
  const cover = PPB_COVERS.find((c) => c.id === pkg.coverId);
  const CoverAd = cover?.ad;
  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', aspectRatio: '460 / 260', borderRadius: radius, overflow: 'hidden' }} aria-hidden>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 460, height: 260, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {pkg.coverId === 'match' || !CoverAd ? (
          <div style={{ position: 'absolute', inset: 0, background: matchVinylBackground(pkg.swatch.base) }} />
        ) : (
          <CoverAd />
        )}
        <div style={{ position: 'absolute', left: '50%', top: 78, transform: 'translateX(-50%)', filter: 'drop-shadow(0 -6px 22px rgba(0,0,0,0.45))' }}>
          <VinylDisc size={330} swatch={pkg.swatch} />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 92, background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)' }} />
        <div style={{ position: 'absolute', left: 16, right: 100, top: 14, zIndex: 2, fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3, letterSpacing: -0.1, textShadow: '0 1px 3px rgba(0,0,0,0.5)', opacity: pkg.sell.trim() ? 1 : 0.55 }}>
          {pkg.sell.trim() || 'Everything a first pressing needs.'}
        </div>
      </div>
    </div>
  );
}

// ─── A saved package tile: card face on top, name + status + pinned price
// row below, hover ••• menu (Edit / Archive / Delete). ─────────────────────
function PackageCard({
  pkg, canEdit, justSaved, onOpen, onEdit, onArchiveToggle, onDelete,
}: {
  pkg: Pkg;
  canEdit: boolean;
  justSaved: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Save-arrival whisper: draw a hairline ring + "Saved" chip, scroll the
  // card into view, then fade — quiet Apple-style acknowledgement.
  const [whisper, setWhisper] = useState(justSaved);
  const [whisperFading, setWhisperFading] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t1 = window.setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    const t2 = window.setTimeout(() => setWhisperFading(true), 2300);
    const t3 = window.setTimeout(() => setWhisper(false), 2800);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [justSaved]);
  const dim = pkg.status === 'draft' ? 0.55 : pkg.status === 'archived' ? 0.4 : 1;
  return (
    <div
      ref={cardRef}
      className="group rounded-2xl bg-white flex flex-col transition-all hover:-translate-y-px"
      style={{ position: 'relative', border: `1px solid ${HAIRLINE}`, boxShadow: PILL_SHADOW, overflow: 'hidden' }}
      data-testid={`package-card-${pkg.id}`}
    >
      {whisper && (
        <>
          <svg aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none', opacity: whisperFading ? 0 : 1, transition: 'opacity 500ms ease' }}>
            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="15" fill="none" stroke={BLUE} strokeWidth="2" pathLength={1} strokeDasharray={1} style={{ animation: 'ppiSavedDraw 700ms ease-out forwards' }} />
          </svg>
          <span
            className="inline-flex items-center gap-1 rounded-full text-[11.5px] font-semibold"
            style={{ position: 'absolute', top: 10, left: 10, zIndex: 6, padding: '3px 10px 3px 8px', background: BLUE, color: '#fff', opacity: whisperFading ? 0 : 1, transition: 'opacity 500ms ease', pointerEvents: 'none' }}
            data-testid={`saved-chip-${pkg.id}`}
          >
            <Check className="w-3 h-3" strokeWidth={3} />
            Saved
          </span>
        </>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="text-left"
        style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', opacity: dim }}
        data-testid={`open-${pkg.id}`}
        aria-label={`Preview ${pkg.name}`}
      >
        <ArtistCardFace pkg={pkg} />
      </button>
      {/* hover ••• — frosted, over the art's corner */}
      {canEdit && (
        <button
          type="button"
          aria-label="Package actions"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
          className="items-center justify-center rounded-full transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 4, width: 30, height: 30, display: 'flex', border: 'none', cursor: 'pointer', background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff' }}
          data-testid={`menu-${pkg.id}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      )}
      {menuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} aria-hidden />
          <div
            className="rounded-xl"
            style={{ position: 'absolute', top: 44, right: 10, zIndex: 41, width: 224, background: 'var(--q-card)', border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 40px rgba(0,0,0,0.28)', padding: 6 }}
            data-testid={`menu-sheet-${pkg.id}`}
          >
            <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }} className="w-full flex items-center gap-2.5 text-left rounded-lg text-[13.5px] font-medium hover:bg-black/5 transition-colors" style={{ padding: '9px 10px', border: 'none', background: 'transparent', color: INK, cursor: 'pointer' }} data-testid={`menu-edit-${pkg.id}`}>
              <Pencil className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
              Edit in builder
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onArchiveToggle(); }} className="w-full flex items-start gap-2.5 text-left rounded-lg hover:bg-black/5 transition-colors" style={{ padding: '9px 10px', border: 'none', background: 'transparent', color: INK, cursor: 'pointer' }} data-testid={`menu-archive-${pkg.id}`}>
              <Archive className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6', marginTop: 1 }} />
              <span>
                <span className="block text-[13.5px] font-medium">{pkg.status === 'archived' ? 'Unarchive' : 'Archive'}</span>
                <span className="block text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 1 }}>Keeps its estimate history</span>
              </span>
            </button>
            <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '5px 6px' }} />
            <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }} className="w-full flex items-center gap-2.5 text-left rounded-lg text-[13.5px] font-medium hover:bg-black/5 transition-colors" style={{ padding: '9px 10px', border: 'none', background: 'transparent', color: '#ff453a', cursor: 'pointer' }} data-testid={`menu-delete-${pkg.id}`}>
              <Trash2 className="w-4 h-4 flex-shrink-0" />
              Delete
            </button>
          </div>
        </>
      )}
      {/* under the face: name + status, then the pinned price row */}
      <div style={{ padding: '14px 16px 0', opacity: dim }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[16px] font-semibold tracking-tight" style={{ color: INK }}>{pkg.name}</h3>
          <StatusPill status={pkg.status} />
        </div>
        {pkg.specLine && (
          <p className="text-[12px]" style={{ color: SUBINK, marginTop: 6, lineHeight: 1.5 }}>
            {pkg.specLine}
          </p>
        )}
      </div>
      <div className="flex items-baseline gap-1.5" style={{ margin: '12px 16px 0', padding: '12px 0 14px', borderTop: `1px solid ${HAIRLINE}`, opacity: dim, marginTop: 'auto' }}>
        <span className="text-[16px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid={`price-${pkg.id}`}>
          {fmt(pkg.perUnit)}
        </span>
        <span className="text-[11.5px]" style={{ color: '#a1a1a6' }}>
          / unit at {pkg.minRun.toLocaleString()} minimum
        </span>
      </div>
    </div>
  );
}

// The hint card showing where a newly saved package lands. When the viewer
// can edit, it's a second click-target into the builder (gogoods, Aug 19
// 2026: "center button isn't working" — it looked clickable, so make it so).
function NewPackageHint({ onCreate }: { onCreate?: () => void }) {
  const Tag: any = onCreate ? 'button' : 'div';
  return (
    <Tag
      {...(onCreate ? { type: 'button', onClick: onCreate } : {})}
      className={`rounded-2xl flex flex-col items-center justify-center text-center${onCreate ? ' transition-colors hover:bg-black/5 cursor-pointer' : ''}`}
      style={{ border: `1.5px dashed ${HAIRLINE}`, padding: 24, minHeight: 168, color: SUBINK, background: 'transparent' }}
      data-testid="package-hint"
    >
      <span className="flex items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: 'rgba(0,0,0,0.04)' }}>
        <Plus className="w-5 h-5" style={{ color: '#a1a1a6' }} />
      </span>
      <div className="text-[14px] font-semibold" style={{ color: INK, marginTop: 12 }}>
        Your next package lands here
      </div>
      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, maxWidth: 240, lineHeight: 1.5 }}>
        Anything you save from the builder shows up in this catalog, ready to send as an estimate.
      </p>
    </Tag>
  );
}

// ─── "How artists see it" preview sheet — full-size card face. ─────────────
function PackagePreviewSheet({ pkg, canEdit, onEdit, onClose }: { pkg: Pkg; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 20px 20px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose} data-testid="package-preview-sheet">
      <div className="rounded-2xl" style={{ width: 540, maxWidth: '100%', background: 'var(--q-card)', border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', padding: 24, color: INK }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>How artists see it</div>
            <div className="text-[19px] font-semibold tracking-tight" style={{ marginTop: 3 }}>{pkg.name}</div>
          </div>
          <StatusPill status={pkg.status} />
        </div>
        <div className="rounded-xl" style={{ marginTop: 16, overflow: 'hidden', border: `1px solid ${HAIRLINE}` }}>
          <ArtistCardFace pkg={pkg} />
        </div>
        <div className="text-[12px]" style={{ color: SUBINK, marginTop: 10 }} data-testid="preview-price">
          From {fmt(pkg.perUnit)} / unit at {pkg.minRun.toLocaleString()}
        </div>
        <div className="flex items-center justify-end gap-3" style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
          <button type="button" onClick={onClose} className="text-[13.5px] font-medium transition-opacity hover:opacity-70" style={{ background: 'none', border: 'none', color: SUBINK, cursor: 'pointer', padding: '0 6px' }} data-testid="preview-close">
            Close
          </button>
          {canEdit && (
            <button type="button" onClick={onEdit} className="rounded-full text-[13.5px] font-semibold transition-colors hover:bg-black/5" style={{ height: 38, padding: '0 18px', border: '1px solid #6e6e73', background: 'transparent', color: INK, cursor: 'pointer' }} data-testid="preview-edit">
              Edit in builder →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm — real removal, red action, plain words. ───────────────
function DeleteConfirmSheet({ pkg, busy, onConfirm, onClose }: { pkg: Pkg; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 61, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16vh 20px 20px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose} data-testid="delete-confirm-sheet">
      <div className="rounded-2xl" style={{ width: 400, maxWidth: '100%', background: 'var(--q-card)', border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', padding: 24, color: INK }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[17px] font-semibold tracking-tight">Delete "{pkg.name}"?</div>
        <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, lineHeight: 1.55 }}>
          This removes the package for good. If you want it off the artist rail but might come back to it, Archive keeps its estimate history instead.
        </p>
        <div className="flex items-center justify-end gap-3" style={{ marginTop: 20 }}>
          <button type="button" onClick={onClose} className="text-[13.5px] font-medium transition-opacity hover:opacity-70" style={{ background: 'none', border: 'none', color: SUBINK, cursor: 'pointer', padding: '0 6px' }} data-testid="delete-cancel">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-full text-[13.5px] font-semibold transition-opacity hover:opacity-90" style={{ height: 38, padding: '0 18px', border: 'none', background: '#ff453a', color: '#fff', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }} data-testid="delete-confirm">
            Delete package
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function PressPackagesIndex({ pressId, canEdit, onCreatePackage, onOpenPackage }: { pressId: string; canEdit: boolean; onCreatePackage: () => void; onOpenPackage: (id: string) => void }) {
  const pressBrandShort = usePressBrand().shortName;
  const { colors: pressColors } = usePressCatalogSwatches();
  useAdminDark(); // re-render on Light/Dark/System toggle (vars drive the rest)

  const packagesUrl = '/api/press/' + pressId + '/estimates?kind=package';
  const { data } = useQuery<{ rows: EstimateRow[] }>({ queryKey: [packagesUrl] });
  const packages: Pkg[] = useMemo(() => (data?.rows ?? []).map((r) => rowToPkg(r, pressColors)), [data, pressColors]);

  // The builder hands back `?saved=<id>` — read it once, strip it from the
  // URL (history.replaceState so back doesn't replay the whisper).
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('saved');
    if (!s) return;
    setSavedId(s);
    params.delete('saved');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }, []);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest('PUT', `/api/press/${pressId}/estimates/${id}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [packagesUrl] }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/press/${pressId}/estimates/${id}`);
      return res.json();
    },
    onSuccess: () => { setDeleteId(null); queryClient.invalidateQueries({ queryKey: [packagesUrl] }); },
  });

  const previewPkg = previewId ? packages.find((p) => p.id === previewId) ?? null : null;
  const deletePkg = deleteId ? packages.find((p) => p.id === deleteId) ?? null : null;

  return (
    <div className="q-create-root h-full font-sans" style={{ color: INK }}>
      <style>{Q_THEME_CSS}</style>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>

        {/* Breadcrumb + page heading + primary action */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">Product Specs</a>
              <span style={{ color: '#d0d0d5' }}>›</span>
              <span style={{ color: SUBINK }}>{`${pressBrandShort} Packages`}</span>
            </div>
            <PageHeading lead={`${pressBrandShort} Packages.`} rest="Your saved builds." />
            <p style={{ fontSize: 15, marginTop: 10, maxWidth: 560, color: SUBINK }}>
              Packages skip quantity and price &mdash; artists pick their quantity later.
            </p>
          </div>

          {/* Quiet canon pill (founder, Aug 16 2026): the index CTA leads into
              the package builder — hairline pill, not a filled blue button. */}
          {canEdit && (
            <button
              type="button"
              onClick={() => onCreatePackage()}
              className="rounded-full inline-flex items-center gap-2 text-[14px] font-semibold flex-shrink-0 transition-colors hover:bg-black/5"
              style={{ height: 44, padding: '0 22px', border: `1px solid ${HAIRLINE}`, background: 'var(--q-card)', color: INK, marginTop: 34 }}
              data-testid="button-build-package"
            >
              <Plus className="w-4 h-4" style={{ color: '#a1a1a6' }} />
              Create package
            </button>
          )}
        </div>

        {/* Grid of saved packages + the "lands here" hint */}
        <div
          className="grid"
          style={{ marginTop: 40, gap: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          {packages.length === 0 && (
            <p className="text-[13px]" style={{ color: SUBINK }} data-testid="text-empty-packages">
              No packages yet — create your first.
            </p>
          )}
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              canEdit={canEdit}
              justSaved={pkg.id === savedId}
              onOpen={() => setPreviewId(pkg.id)}
              onEdit={() => onOpenPackage(pkg.id)}
              onArchiveToggle={() => statusMutation.mutate({ id: pkg.id, status: pkg.status === 'archived' ? 'live' : 'archived' })}
              onDelete={() => setDeleteId(pkg.id)}
            />
          ))}
          <NewPackageHint onCreate={canEdit ? () => onCreatePackage() : undefined} />
        </div>

      </div>
      {previewPkg && (
        <PackagePreviewSheet pkg={previewPkg} canEdit={canEdit} onEdit={() => { setPreviewId(null); onOpenPackage(previewPkg.id); }} onClose={() => setPreviewId(null)} />
      )}
      {deletePkg && (
        <DeleteConfirmSheet pkg={deletePkg} busy={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate(deletePkg.id)} onClose={() => setDeleteId(null)} />
      )}
    </div>
  );
}

export default PressPackagesIndex;
