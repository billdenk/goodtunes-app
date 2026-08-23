// PressEstimatesIndex — Create › Estimates home, ported from the founder
// handoff into the real press portal. BODY ONLY: the mock's PressShell (left
// nav, top bar, avatar, mock theme toggle) is dropped — this renders INSIDE
// the portal's OperatorShell. Dark mode comes from useAdminDark()
// (dark = body.gt-admin-dark), NOT the mock's QMode/localStorage chrome.
// The --q-* theme vars are scoped to .q-create-root (see Q_THEME_CSS).
//
// Live data replaces MOCK_ESTIMATES: GET /api/press/:id/estimates?kind=estimate
// supplies every row. Navigation to the builder goes through onBuildEstimate.
// Canon: "estimate" never "quote" in copy, one filled blue max, statuses
// always word + icon — never color alone (founder is colorblind).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  LayoutGrid,
  SlidersHorizontal,
  Check,
  Rows3,
  ArrowUpRight,
  ArrowDownLeft,
  PencilLine,
  Send,
  Eye,
  CircleCheck,
  CircleSlash,
  Loader2,
} from 'lucide-react';
import { Disc as NavVinyl } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = 'var(--q-ink)';
const SUBINK = 'var(--q-subink)';
const HAIRLINE = 'var(--q-hairline)';
const PILL_SHADOW = 'var(--q-pill-shadow)';

const Q_THEME_CSS = String.raw`
.q-create-root { --q-ink:#1d1d1f; --q-subink:#6e6e73; --q-hairline:#e6e6ea; --q-canvas:#f5f5f7; --q-rail:#f5f5f7; --q-card:#ffffff; --q-track:#f2f2f5; --q-frost:rgba(255,255,255,0.78); --q-pill-shadow:0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04); }
body.gt-admin-dark .q-create-root { --q-ink:#f5f5f7; --q-subink:#98989d; --q-hairline:rgba(255,255,255,0.12); --q-canvas:#161617; --q-rail:#1c1c1e; --q-card:#2a2a2d; --q-track:rgba(255,255,255,0.08); --q-frost:rgba(22,22,23,0.72); --q-pill-shadow:0 1px 3px rgba(0,0,0,0.5); }
body.gt-admin-dark .q-root .bg-white { background-color: var(--q-card) !important; }
body.gt-admin-dark .q-root .hover\:bg-slate-50:hover, body.gt-admin-dark .q-root .hover\:bg-slate-100:hover, body.gt-admin-dark .q-root .hover\:bg-slate-200:hover, body.gt-admin-dark .q-root .hover\:bg-black\/5:hover { background-color: rgba(255,255,255,0.07) !important; }
body.gt-admin-dark .q-root .ring-slate-200 { --tw-ring-color: rgba(255,255,255,0.15); }
body.gt-admin-dark .q-root .placeholder\:text-slate-400::placeholder { color: rgba(255,255,255,0.30); }
body.gt-admin-dark .q-root .hover\:text-slate-600:hover { color: #d0d0d5 !important; }
body.gt-admin-dark [data-radix-popper-content-wrapper] > div { background-color: #2a2a2d !important; border-color: rgba(255,255,255,0.12) !important; }
body.gt-admin-dark [data-radix-popper-content-wrapper] .hover\:bg-slate-50:hover { background-color: rgba(255,255,255,0.07) !important; }
`;

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Two-tone heading (canon) ────────────────────────────────────────
function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ESTIMATE MODEL — live rows (word + icon statuses; never color alone)
// ═══════════════════════════════════════════════════════════════════
type EstStatus = 'Draft' | 'Sent' | 'Viewed' | 'Converted' | 'Abandoned';
type EstDirection = 'Outbound' | 'Inbound';
type VinylSize = '7' | '10' | '12';

const STATUS_META: Record<EstStatus, { icon: typeof PencilLine; color: string }> = {
  // Color is a secondary cue only — the word + icon carry the meaning.
  Draft: { icon: PencilLine, color: '#a1a1a6' },
  Sent: { icon: Send, color: BLUE },
  Viewed: { icon: Eye, color: BLUE },
  Converted: { icon: CircleCheck, color: '#34a853' },
  Abandoned: { icon: CircleSlash, color: '#a1a1a6' },
};

type Estimate = {
  id: string;
  artist: string;
  build: string;          // 12" · 300 · Ruby …
  size: VinylSize;
  total: string;
  direction: EstDirection; // Outbound = press-created / Inbound = artist self-service
  source: string;          // MRP referral code / site
  status: EstStatus;
  lastActivity: string;
  paid?: boolean;          // converted rows show a Paid chip when payload.paidAt
  cover?: string;          // artwork; falls back to Memphis house art
  thumb?: string;          // circular artist photo; falls back to initials
};

// ─── Live row shape (server) ─────────────────────────────────────────
type Row = {
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

// ─── Shared bits ─────────────────────────────────────────────────────
function StatusWord({ status }: { status: EstStatus }) {
  const { icon: Icon, color } = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: INK }} data-testid={`status-${status.toLowerCase()}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} aria-hidden />
      {status}
    </span>
  );
}

// Paid chip — converted estimates that have been paid. Word + icon, never
// color alone (founder is colorblind); reads by the check + "Paid" text.
function PaidChip() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 h-5"
      style={{ backgroundColor: 'var(--q-track)', color: INK }}
      data-testid="chip-paid"
    >
      <Check className="w-3 h-3 flex-shrink-0" style={{ color: '#34a853' }} aria-hidden />
      Paid
    </span>
  );
}

function DirectionWord({ direction }: { direction: EstDirection }) {
  const Icon = direction === 'Outbound' ? ArrowUpRight : ArrowDownLeft;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: SUBINK }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} aria-hidden />
      {direction}
    </span>
  );
}

// Memphis house art — estimates with no uploaded artwork get the house mark.
// The mock rendered the MRP logo here; that asset was a mock-chrome import
// and disappears with the mocks, so the dark plate stands alone.
function HouseArt() {
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
    </div>
  );
}

function ArtistThumb({ e, size = 34 }: { e: Estimate; size?: number }) {
  const initials = e.artist.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200"
      style={{ width: size, height: size, backgroundColor: 'var(--q-track)' }}
    >
      {e.thumb
        ? <img src={e.thumb} alt={e.artist} className="w-full h-full object-cover" />
        : <span className="text-[11px] font-semibold" style={{ color: SUBINK }}>{initials}</span>}
    </span>
  );
}

// ONE solid segmented pill group (canon, matches the view toggle & the
// appearance control) — reads by weight/surface, not color.
function SegGroup<T extends string>({ options, value, onChange, ariaLabel, testPrefix }: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  testPrefix: string;
}) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-full flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label={ariaLabel}>
      {options.map(([id, label]) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className="h-8 px-3.5 rounded-full text-[12.5px] transition-colors"
            style={{
              fontWeight: on ? 600 : 500,
              color: on ? INK : SUBINK,
              backgroundColor: on ? 'var(--q-card)' : 'transparent',
              boxShadow: on ? PILL_SHADOW : undefined,
            }}
            data-testid={`${testPrefix}-${id.toLowerCase()}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Status filter — ported from the admin toolbar pattern (SuperAdminPressesFind):
// quiet hairline pill opening a checklist; statuses word + icon, never color alone.
function StatusFilter({ selected, onToggle }: { selected: EstStatus[]; onToggle: (s: EstStatus) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-9 px-3.5 rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-black/5 flex-shrink-0"
          style={{ color: selected.length ? INK : SUBINK, border: `1px solid ${HAIRLINE}` }}
          data-testid="button-filter-status"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: '#a1a1a6' }} />
          Filter
          {selected.length > 0 && (
            <span className="text-[10.5px] font-semibold rounded-full px-1.5 h-4 inline-flex items-center" style={{ backgroundColor: 'var(--q-track)', color: INK }}>
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-52 p-1.5 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="menu-filter-status">
        {(Object.keys(STATUS_META) as EstStatus[]).map((s) => {
          const { icon: Icon, color } = STATUS_META[s];
          const on = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onToggle(s)}
              aria-pressed={on}
              className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] hover:bg-slate-50 transition-colors"
              style={{ color: INK, fontWeight: on ? 600 : 500 }}
              data-testid={`filter-status-${s.toLowerCase()}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} aria-hidden />
              <span className="flex-1 text-left">{s}</span>
              {on && <Check className="w-4 h-4 flex-shrink-0" style={{ color: INK }} />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ─── Live-row → display Estimate mapping (payload is best-effort) ─────
function fmtActivity(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toEstimate(row: Row): { display: Estimate; realId: string } {
  const p = row.payload ?? {};
  const total = p.totalCents != null
    ? '$' + (p.totalCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '—';
  const display: Estimate = {
    id: row.displayId ?? row.id,
    artist: row.title,
    build: p.build ?? '—',
    size: (p.size ?? '12') as VinylSize,
    total,
    direction: (p.direction ?? 'Outbound') as EstDirection,
    source: p.source ?? '—',
    status: row.status as EstStatus,
    lastActivity: fmtActivity(row.updatedAt),
    paid: Boolean(p.paidAt),
    cover: p.coverUrl ?? undefined,
    thumb: p.thumbUrl ?? undefined,
  };
  return { display, realId: row.id };
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
type Format = 'All' | 'Vinyl' | 'CD' | 'Cassette';
type View = 'grid' | 'table';

export function PressEstimatesIndex({ pressId, canEdit, onBuildEstimate }: { pressId: string; canEdit: boolean; onBuildEstimate: (estimateId: string | null) => void }) {
  const [view, setView] = useState<View>('grid');
  const [format, setFormat] = useState<Format>('All');
  const [size, setSize] = useState<VinylSize | 'all'>('all');
  const [statuses, setStatuses] = useState<EstStatus[]>([]);

  const estimatesUrl = '/api/press/' + pressId + '/estimates?kind=estimate';
  const { data, isLoading } = useQuery<{ rows: Row[] }>({
    queryKey: [estimatesUrl],
  });

  const toggleStatus = (s: EstStatus) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Live rows → display estimates, keeping a lookup back to the real row id.
  const mapped = (data?.rows ?? []).map(toEstimate);
  const realIdOf = new Map<string, string>();
  for (const m of mapped) realIdOf.set(m.display.id, m.realId);
  const all = mapped.map((m) => m.display);

  const formatEmpty = format === 'CD' || format === 'Cassette';
  const rows = formatEmpty
    ? []
    : all
        .filter((e) => format !== 'Vinyl' || size === 'all' || e.size === size)
        .filter((e) => statuses.length === 0 || statuses.includes(e.status));

  const goBuild = (displayId: string) => onBuildEstimate(realIdOf.get(displayId) ?? null);

  return (
    <div className="q-create-root q-root">
      <style>{Q_THEME_CSS}</style>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>
        {/* Header */}
        <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#a1a1a6' }}>
          Estimates
        </div>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <PageHeading lead="Estimates." rest="Every build, one place." />
            <p className="text-[15px]" style={{ marginTop: 10, maxWidth: 560, color: SUBINK }}>
              Outbound estimates your team sent, and inbound ones artists started themselves.
            </p>
            <p className="text-[12px]" style={{ marginTop: 6, color: '#a1a1a6' }}>
              Estimates are immutable once sent — edits issue a new estimate variant.
            </p>
          </div>
          {/* Page-header action — dark-gray-outline quiet pill, no fill
              (Bill, Aug 18 2026: header actions are never filled blue; blue is
              earned by confirms only). */}
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onBuildEstimate(null)}
              className="rounded-full px-7 flex-shrink-0 bg-transparent hover:bg-transparent"
              style={{ background: 'transparent', color: INK, border: '1px solid #6e6e73', height: 44, fontSize: 14.5, marginTop: 34 }}
              data-testid="button-build-estimate"
            >
              Build estimate
            </Button>
          )}
        </div>

        {/* Toolbar: format segments left · sizes (vinyl only) + search + filter + view right */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 34 }}>
          <SegGroup
            options={[['All', 'All'], ['Vinyl', 'Vinyl'], ['CD', 'CD'], ['Cassette', 'Cassette']]}
            value={format}
            onChange={(f) => { setFormat(f); setSize('all'); }}
            ariaLabel="Format"
            testPrefix="chip-format"
          />
          <div className="flex items-center gap-2.5 flex-wrap">
            {format === 'Vinyl' && (
              <SegGroup
                options={[['all', 'All sizes'], ['7', '7"'], ['10', '10"'], ['12', '12"']] as Array<[VinylSize | 'all', string]>}
                value={size}
                onChange={(v) => setSize(v)}
                ariaLabel="Vinyl size"
                testPrefix="chip-size"
              />
            )}
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-black/5 flex-shrink-0"
              style={{ color: SUBINK, border: `1px solid ${HAIRLINE}` }}
              aria-label="Search estimates"
              data-testid="button-search-estimates"
            >
              <Search className="w-4 h-4" />
            </button>
            <StatusFilter selected={statuses} onToggle={toggleStatus} />
            {/* View toggle — quiet segmented pair, grid / table */}
            <div className="flex rounded-full p-0.5 flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label="View">
              {([['grid', LayoutGrid, 'Grid'], ['table', Rows3, 'Table']] as Array<[View, typeof LayoutGrid, string]>).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={`${label} view`}
                  onClick={() => setView(v)}
                  className="h-8 w-10 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    color: view === v ? INK : '#a1a1a6',
                    backgroundColor: view === v ? 'var(--q-card)' : 'transparent',
                    boxShadow: view === v ? PILL_SHADOW : undefined,
                  }}
                  data-testid={`view-${v}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading — reuse the empty-state container with a spinner */}
        {isLoading && (
          <div
            className="rounded-2xl bg-white flex flex-col items-center justify-center text-center"
            style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, padding: '72px 32px' }}
            data-testid="loading-estimates"
          >
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#a1a1a6' }} aria-hidden />
          </div>
        )}

        {/* Empty state for formats with no model yet */}
        {!isLoading && formatEmpty && (
          <div
            className="rounded-2xl bg-white flex flex-col items-center justify-center text-center"
            style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, padding: '72px 32px' }}
            data-testid="empty-format"
          >
            <NavVinyl className="w-8 h-8" style={{ color: '#a1a1a6' }} aria-hidden />
            <div className="text-[16px] font-semibold" style={{ marginTop: 14, color: INK }}>
              No {format} estimates yet
            </div>
            <p className="text-[13px]" style={{ marginTop: 6, maxWidth: 380, color: SUBINK }}>
              {format} builds aren&rsquo;t modeled yet. Every estimate so far is vinyl — switch back to see them.
            </p>
          </div>
        )}

        {/* GRID VIEW — cover art with circular artist thumb overlaid */}
        {!isLoading && !formatEmpty && rows.length === 0 && (
          <div
            className="rounded-2xl bg-white flex flex-col items-center justify-center text-center"
            style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, padding: '72px 32px' }}
            data-testid="empty-filter"
          >
            <SlidersHorizontal className="w-8 h-8" style={{ color: '#a1a1a6' }} aria-hidden />
            <div className="text-[16px] font-semibold" style={{ marginTop: 14, color: INK }}>
              No estimates match
            </div>
            <p className="text-[13px]" style={{ marginTop: 6, maxWidth: 380, color: SUBINK }}>
              Nothing matches the current filters — clear a status or size to see more.
            </p>
          </div>
        )}

        {!isLoading && !formatEmpty && rows.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5" style={{ marginTop: 28 }}>
            {rows.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => goBuild(e.id)}
                className="group rounded-2xl bg-white overflow-hidden transition-all hover:-translate-y-px text-left"
                style={{ border: `1px solid ${HAIRLINE}` }}
                data-testid={`card-estimate-${e.id}`}
              >
                <div className="relative aspect-square overflow-hidden">
                  {e.cover
                    ? <img src={e.cover} alt={`${e.artist} artwork`} className="w-full h-full object-cover" />
                    : <HouseArt />}
                  <span className="absolute left-3 bottom-3">
                    <ArtistThumb e={e} size={38} />
                  </span>
                </div>
                <div className="px-4 pt-3 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14px] font-semibold truncate" style={{ color: INK }}>{e.artist}</div>
                    <div className="text-[13.5px] font-semibold flex-shrink-0" style={{ color: INK }}>{e.total}</div>
                  </div>
                  <div className="text-[12px] truncate" style={{ marginTop: 3, color: SUBINK }}>{e.build}</div>
                  <div className="flex items-center justify-between gap-2" style={{ marginTop: 10 }}>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <StatusWord status={e.status} />
                      {e.status === 'Converted' && e.paid && <PaidChip />}
                    </span>
                    <DirectionWord direction={e.direction} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* TABLE VIEW */}
        {!isLoading && !formatEmpty && rows.length > 0 && view === 'table' && (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ marginTop: 28, border: `1px solid ${HAIRLINE}` }}>
            <table className="w-full text-left" data-testid="table-estimates">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
                  <th className="pl-5 pr-3 py-3 font-semibold">Artist</th>
                  <th className="px-3 py-3 font-semibold">Build</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Direction</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="pl-3 pr-5 py-3 font-semibold">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer transition-colors hover:bg-black/5"
                    style={{ borderTop: `1px solid ${HAIRLINE}` }}
                    onClick={() => goBuild(e.id)}
                    data-testid={`row-estimate-${e.id}`}
                  >
                    <td className="pl-5 pr-3 py-3">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <ArtistThumb e={e} size={30} />
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold truncate" style={{ color: INK }}>{e.artist}</span>
                          <span className="block text-[11px] truncate" style={{ color: '#a1a1a6' }}>{e.id}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px]" style={{ color: SUBINK }}>{e.build}</td>
                    <td className="px-3 py-3 text-[13px] font-semibold whitespace-nowrap" style={{ color: INK }}>{e.total}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><DirectionWord direction={e.direction} /></td>
                    <td className="px-3 py-3 text-[12.5px] truncate" style={{ color: SUBINK, maxWidth: 200 }}>{e.source}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusWord status={e.status} />
                        {e.status === 'Converted' && e.paid && <PaidChip />}
                      </span>
                    </td>
                    <td className="pl-3 pr-5 py-3 text-[12.5px] whitespace-nowrap" style={{ color: SUBINK }}>{e.lastActivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
