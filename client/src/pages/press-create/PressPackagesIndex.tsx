// PressPackagesIndex — the press-side "MRP Packages" catalog. A press (MRP)
// sees and edits the packages they've built with the builder. These are the
// press's OWN saved packages, distinct from GoodTunes' standard set.
//
// BODY ONLY: the mock's PressShell (left nav, top bar, avatar, mock theme
// toggle) is dropped — this renders INSIDE OperatorShell. Dark mode comes
// from useAdminDark() (dark = body.gt-admin-dark). Live data replaces the
// MOCK_ consts: GET /api/press/:id/estimates?kind=package supplies the rows.

import { CheckCircle2, Pencil, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAdminDark } from '@/lib/adminAppearance';

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
type PkgStatus = 'live' | 'draft';

type Pkg = {
  id: string;
  name: string;
  summary: string;      // component summary line
  perUnit: number;      // per-unit price at 1,000
  status: PkgStatus;
  note?: string;        // small provenance line under the summary
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

// Word + icon status (Bill is colorblind — never color alone).
function StatusPill({ status }: { status: PkgStatus }) {
  const live = status === 'live';
  const Icon = live ? CheckCircle2 : Pencil;
  const label = live ? 'Live' : 'Draft';
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

function PackageCard({ pkg }: { pkg: Pkg }) {
  return (
    <div
      className="rounded-2xl bg-white flex flex-col transition-all hover:-translate-y-px"
      style={{ border: `1px solid ${HAIRLINE}`, boxShadow: PILL_SHADOW, padding: 20 }}
      data-testid={`package-card-${pkg.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[18px] font-semibold tracking-tight" style={{ color: INK }}>{pkg.name}</h3>
        <StatusPill status={pkg.status} />
      </div>

      <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, lineHeight: 1.5 }}>
        {pkg.summary}
      </p>

      {pkg.note && (
        <p className="text-[12px]" style={{ color: '#a1a1a6', marginTop: 10, lineHeight: 1.45 }}>
          {pkg.note}
        </p>
      )}

      <div className="flex items-end justify-between gap-3" style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
        <div>
          <div className="text-[19px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(pkg.perUnit)}
          </div>
          <div className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 1 }}>
            / unit at 1,000
          </div>
        </div>
        {/* Quiet link-styled edit — reopens the builder pre-filled. */}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold hover:opacity-70 transition-opacity"
          style={{ color: BLUE }}
          data-testid={`edit-${pkg.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </a>
      </div>
    </div>
  );
}

// The hint card showing where a newly saved package lands.
function NewPackageHint() {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center text-center"
      style={{
        border: `1.5px dashed ${HAIRLINE}`,
        padding: 24,
        minHeight: 168,
        color: SUBINK,
      }}
      data-testid="package-hint"
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{ width: 40, height: 40, backgroundColor: 'rgba(0,0,0,0.04)' }}
      >
        <Plus className="w-5 h-5" style={{ color: '#a1a1a6' }} />
      </span>
      <div className="text-[14px] font-semibold" style={{ color: INK, marginTop: 12 }}>
        Your next package lands here
      </div>
      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, maxWidth: 240, lineHeight: 1.5 }}>
        Anything you save from the builder shows up in this catalog, ready to send as an estimate.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function PressPackagesIndex({ pressId, canEdit, onCreatePackage, onOpenPackage }: { pressId: string; canEdit: boolean; onCreatePackage: () => void; onOpenPackage: (id: string) => void }) {
  useAdminDark(); // re-render on Light/Dark/System toggle (vars drive the rest)

  const packagesUrl = '/api/press/' + pressId + '/estimates?kind=package';
  const { data } = useQuery<{ rows: EstimateRow[] }>({ queryKey: [packagesUrl] });

  const packages: Pkg[] = (data?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.title,
    summary: row.payload?.summary ?? '—',
    perUnit: (row.payload?.perUnitCents ?? 0) / 100,
    status: (row.status === 'live' ? 'live' : 'draft') as PkgStatus,
    note: row.payload?.note,
  }));

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
              <span style={{ color: SUBINK }}>MRP Packages</span>
            </div>
            <PageHeading lead="MRP Packages." rest="Your saved builds." />
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
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
          <NewPackageHint />
        </div>

      </div>
    </div>
  );
}

export default PressPackagesIndex;
