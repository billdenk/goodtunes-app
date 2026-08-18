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

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import {
  ArrowRight, Check, ChevronDown, ChevronRight, Circle, Clock, Copy, Disc3,
  Download, ExternalLink, Eye, FileImage, Link2, Lock, Mail, Plus, UploadCloud, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  BLUE, PILL_SHADOW, cn, useRestructureTheme, CanonPill, MilestoneStatus, SegChip,
  VerdictChip, InheritanceChip, FORMAT_WORD, fmtDollars, goodtunesLogo, shopifyLogo,
  type Theme, type StatusWord, type ArtBlock, type CheckRow, type Inheritance,
} from './shared';
import mrpLabelLogo from '@/assets/artist-portal/mrp-logo.svg';

// ─── Portal payload shapes (server/artistPortal.ts) ───
type PortalFormat = { id: string; kind: string; label: string; status: 'live' | 'press' | 'draft'; pressName?: string | null };
type PortalMilestone = { id: string; label: string; amountCents: number; status: StatusWord; note: string; payUrl?: string | null };
type PortalPayload = {
  release: { id: string; title: string; artist: string; artworkUrl?: string | null; year: string; tracks: number; visibility: string; editing: string; catalogNumber?: string | null; upc?: string | null };
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

  // Next-thing band — driven by real payments state: a requested milestone
  // carries the ONE filled blue pill; otherwise a quiet status headline.
  const requested = portal.payments.flatMap((p) => p.milestones ?? []).find((m) => m.status === 'requested');
  const pressFormat = portal.formats.find((f) => f.status === 'press');
  const headline = pressFormat
    ? `${pressFormat.label} is at press${pressFormat.pressName ? ` — ${pressFormat.pressName}` : ''}.`
    : portal.formats.some((f) => f.status === 'live')
      ? `${portal.release.title} is live for fans.`
      : 'This release is still in draft.';

  const activity = (summary.data?.activity ?? [])
    .filter((a) => a.title?.toLowerCase().includes(portal.release.title.toLowerCase()) || a.detail?.toLowerCase().includes(portal.release.title.toLowerCase()))
    .slice(0, 5);

  return (
    <div style={{ marginTop: 26 }} data-testid="release-dashboard">
      {/* 1 · Next-thing band. The release's single most important state, with the
          one actionable item (balance due) carrying the ONE filled blue pill. */}
      <div
        className="flex items-center justify-between gap-6 rounded-2xl flex-wrap"
        style={{ padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }}
        data-testid="dashboard-nextthing"
      >
        <div className="flex items-start gap-3 min-w-0">
          <Clock className="w-5 h-5 flex-shrink-0" style={{ color: t.subink, marginTop: 1 }} aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: t.ink }}>{headline}</p>
            {requested && (
              <p className="text-[13px]" style={{ marginTop: 3, color: t.subink }}>
                {requested.label} &mdash; {fmtDollars(requested.amountCents)} to GoodTunes&reg;.
              </p>
            )}
          </div>
        </div>
        {requested && (
          <CanonPill label="Pay balance" onClick={() => { if (requested.payUrl) window.open(requested.payUrl, '_blank', 'noopener'); }} />
        )}
      </div>

      {/* 2 · Per-format heartbeat. Each row hints (chevron) it jumps to that format
          in Assets. */}
      {portal.formats.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ marginTop: 18, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="dashboard-formats">
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
function ReleaseDetails({ portal, t }: { portal: PortalPayload; t: Theme }) {
  const r = portal.release;
  const primaryFormat = portal.formats.find((f) => f.kind === 'vinyl') ?? portal.formats[0];
  const rows: Array<{ label: string; value: ReactNode; testid: string }> = [
    { label: 'Title', value: <span className="font-semibold" style={{ color: t.ink }}>{r.title}</span>, testid: 'detail-title' },
    { label: 'Artist', value: r.artist, testid: 'detail-artist' },
    { label: 'Format', value: primaryFormat?.label ?? '—', testid: 'detail-format' },
    { label: 'Year', value: r.year || '—', testid: 'detail-year' },
    { label: 'Tracks', value: `${r.tracks} tracks`, testid: 'detail-tracks' },
    // Task #3178 — catalog identifiers. Catalog Number shown as-is;
    // UPC always shown (empty state is a dash so artists know the field exists).
    { label: 'Catalog Number', value: r.catalogNumber || '—', testid: 'detail-catalog-number' },
    { label: 'UPC Code', value: r.upc || '—', testid: 'detail-upc' },
    {
      label: 'Visibility',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} aria-hidden /> {r.visibility}
        </span>
      ),
      testid: 'detail-visibility',
    },
    {
      label: 'Editing',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} aria-hidden /> {r.editing}
        </span>
      ),
      testid: 'detail-editing',
    },
  ];
  return (
    <div style={{ marginTop: 26 }}>
      <div className="min-w-0" style={{ marginBottom: 18 }}>
        <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Details.</h2>
        <p className="text-[13.5px]" style={{ marginTop: 4, color: t.subink }}>Everything about this release at a glance.</p>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid="release-details">
        {rows.map((r2, i) => (
          <div
            key={r2.testid}
            className="flex items-center justify-between gap-6"
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

// BlockCard — GoodStudio-card treatment copied verbatim from PressTemplatesIndex
// tiles (Bill, Aug 15/16 2026): the ART is the hero — full-bleed image bleeds
// edge-to-edge across the tile's top, quiet text block flush-left below. Format
// / size / spec detail is HIDDEN — the card shows only the art and that it's
// good/certified. The whole tile is a link into the artist template Test page.
// The pass/needs-fixes chip sits at the BOTTOM, under the info; the top is
// reserved for art only.
function BlockCard({ block, href, artUrl, t }: { block: ArtBlock; href: string; artUrl?: string | null; t: Theme }) {
  const [, navigate] = useLocation();
  const s = block.state;
  const filled = s.kind !== 'empty';
  return (
    <a
      href={href}
      onClick={(e) => { e.preventDefault(); navigate(href); }}
      className={cn('gt-tile w-full h-full rounded-2xl overflow-hidden flex flex-col text-left transition-colors cursor-pointer', t.hoverCard)}
      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}
      data-testid={`block-${block.id}`}
    >
      {/* Hero — art bleeds edge-to-edge across the top. */}
      <span className="block w-full flex-shrink-0" style={{ height: 200, backgroundColor: t.dropEmpty, borderBottom: `1px solid ${t.hairline}` }}>
        {filled && artUrl ? (
          <img
            src={artUrl}
            alt={`${block.title} art`}
            className="w-full h-full object-cover object-top"
            style={{ opacity: s.kind === 'fail' ? 0.55 : 1 }}
            data-testid={`img-block-${block.id}`}
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center">
            <UploadCloud className="w-8 h-8" style={{ color: t.faint }} />
          </span>
        )}
      </span>

      {/* Info under the image — name + which file is in effect. No specs. */}
      <div className="w-full flex flex-col flex-1" style={{ padding: '14px 18px 16px' }}>
        <div className="text-[15px] font-semibold truncate" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{block.title}</div>
        <div style={{ marginTop: 8 }}>
          <InheritanceChip inheritance={block.inheritance} t={t} />
        </div>

        {/* Status chip pinned to the BOTTOM — word + icon, never color alone. */}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <VerdictChip kind={s.kind} t={t} />
        </div>
      </div>
    </a>
  );
}

// Press attribution — quiet inline text+icon utility (grayed to t.faint so the
// heading dominates). Monochrome mark on either surface via theme logoFilter.
function PressAttribution({ pressName, t }: { pressName: string; t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80"
      style={{ color: t.faint }}
      data-testid="press-attribution"
      title={`Press: ${pressName}`}
    >
      <img src={mrpLabelLogo} alt={pressName} className="h-3.5 w-auto flex-shrink-0" style={{ filter: t.logoFilter === 'none' ? 'brightness(0)' : 'brightness(0) invert(1)', opacity: 0.55 }} />
      Press
    </span>
  );
}

// Templates — quiet inline text+icon utility, grayed to t.faint; no pill/border.
function TemplatesChip({ t }: { t: Theme }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80"
      style={{ color: t.faint }}
      data-testid="button-download-templates"
      title="Download the PDF templates"
    >
      <Download className="w-3.5 h-3.5 flex-shrink-0" /> Templates
    </button>
  );
}

function AudioMasterList({ tracks, forVinyl, t }: { tracks: Array<{ title: string }>; forVinyl: boolean; t: Theme }) {
  return (
    <div style={{ marginTop: 18 }}>
      {forVinyl && (
        <div className="rounded-xl flex items-center justify-between gap-4 flex-wrap" style={{ padding: '14px 16px', marginBottom: 16, border: `1px solid ${t.hairline}`, background: t.canvas }} data-testid="callout-wave">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Master these for vinyl with Wave</div>
            <p className="text-[12px]" style={{ marginTop: 3, color: t.subink, lineHeight: 1.45 }}>Vinyl cuts best from a dedicated master. Wave prepares a lacquer-ready set from your album masters.</p>
          </div>
          <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium flex-shrink-0 transition-colors', t.hoverCard)} style={{ padding: '8px 16px', color: t.subink, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="button-master-with-wave">
            <ArrowRight className="w-3.5 h-3.5" /> Master with Wave
          </button>
        </div>
      )}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid={forVinyl ? 'audio-list-vinyl' : 'audio-list-master'}>
        {tracks.length === 0 ? (
          <div className="flex items-center justify-center" style={{ padding: '32px 16px' }}>
            <span className="text-[13px]" style={{ color: t.subink }}>No tracks yet.</span>
          </div>
        ) : tracks.map((song, i) => (
          <div key={`${song.title}-${i}`} className="flex items-center gap-3 px-4" style={{ height: 52, borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }} data-testid={`track-${i + 1}`}>
            <span className="text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ width: 22, color: t.faint }}>{i + 1}</span>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: t.soft }}>
              <Disc3 className="w-4 h-4" style={{ color: t.subink }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium truncate" style={{ color: t.ink }}>{song.title}</div>
              <div className="text-[11.5px]" style={{ color: t.faint }}>{forVinyl ? 'Lacquer master · from your album masters' : 'Album master'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component-id → friendly slot facts (mirrors the press-template component ids).
const COMPONENT_SLOTS: Record<string, { title: string; shape: ArtBlock['shape'] }> = {
  jacket: { title: 'Cover · jacket', shape: 'tall' },
  labels: { title: 'Center labels', shape: 'circle' },
  sleeve: { title: 'Inner sleeve', shape: 'square' },
  insert: { title: 'Insert', shape: 'square' },
  booklet: { title: 'Booklet', shape: 'square' },
};

function ReleaseAssets({ portal, albumId, t }: { portal: PortalPayload; albumId: string; t: Theme }) {
  const hasVinyl = portal.formats.some((f) => f.kind === 'vinyl');
  const vinylFormat = portal.formats.find((f) => f.kind === 'vinyl');
  const pressName = vinylFormat?.pressName ?? 'the press';
  const [lane, setLane] = useState<'art' | 'audio'>('art');
  const [assetFormat, setAssetFormat] = useState<'digital' | 'master' | 'vinyl'>(hasVinyl ? 'vinyl' : 'master');

  const album = useQuery<{ songs?: Array<{ title: string }> }>({ queryKey: [`/api/albums/${albumId}`] });
  const scan = useQuery<{ components?: Array<{ componentId: string; checks?: Array<{ label: string; value: string; verdict: string }>; verdict?: string; fileName?: string | null }>; requiredComponents?: Array<string | { id: string; label?: string }> }>({
    queryKey: [`/api/admin/albums/${albumId}/completed-template`],
    enabled: hasVinyl,
    retry: false,
  });

  const tracks = album.data?.songs ?? [];

  // Real vinyl art blocks from the completed-template scan; slots with no scan
  // yet show as "Waiting for art" with an inherited-album-art chip.
  const blocks: ArtBlock[] = useMemo(() => {
    // requiredComponents rows are objects ({id, label, …}) from the
    // completed-template config; tolerate plain string ids too.
    const required = (scan.data?.requiredComponents ?? []).map((r) =>
      typeof r === 'string' ? { id: r, label: undefined as string | undefined } : { id: r.id, label: r.label });
    const byId = new Map((scan.data?.components ?? []).map((c) => [c.componentId, c]));
    const rows = required.length ? required : Array.from(byId.keys()).map((id) => ({ id, label: undefined as string | undefined }));
    return rows.map(({ id, label }) => {
      const c = byId.get(id);
      const meta = COMPONENT_SLOTS[id] ?? { title: label ?? id.charAt(0).toUpperCase() + id.slice(1), shape: 'square' as const };
      const checks: CheckRow[] = (c?.checks ?? []).map((k) => ({ label: k.label, value: k.value, verdict: k.verdict === 'pass' ? 'pass' : 'fail' }));
      const pass = c ? checks.every((k) => k.verdict === 'pass') && checks.length > 0 : false;
      const inheritance: Inheritance = c?.fileName
        ? { kind: 'format-specific', note: 'Format-specific file — overrides the album art' }
        : { kind: 'inherited-pass', note: 'Using album art' };
      const state: ArtBlock['state'] = !c
        ? { kind: 'empty' }
        : pass
          ? { kind: 'pass', file: c.fileName ?? 'album art', checks }
          : { kind: 'fail', file: c.fileName ?? 'album art', checks };
      return { id, title: meta.title, hint: '', shape: meta.shape, inheritance, state };
    });
  }, [scan.data]);

  return (
    <>
      {/* Top row — just the format chip + expanding "+". The Art / Audio lane
          chip has moved down to the lane-heading row. Formats stay in sync
          across both lanes (the SAME list drives both). */}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 14 }} data-testid="asset-lane-row">
        <SegChip
          options={hasVinyl
            ? [['master', 'Master'], ['digital', 'GoodTunes\u00AE Player'], ['vinyl', 'Vinyl']]
            : [['master', 'Master'], ['digital', 'GoodTunes\u00AE Player']]}
          value={assetFormat}
          onChange={(v) => setAssetFormat(v)}
          ariaLabel="Asset format"
          testPrefix="assetformat"
          t={t}
        />
        {/* Expanding add affordance — a "+" that grows rightward on hover to
            reveal "Add format" (smooth width/opacity), apple-clean. Scoped
            CSS keeps the width/opacity transition off arbitrary utilities. */}
        <style>{`
          .apr-add{transition:background-color .15s ease}
          .apr-add .apr-add-label{max-width:0;opacity:0;margin-left:0;overflow:hidden;white-space:nowrap;transition:max-width .22s ease,opacity .18s ease,margin-left .22s ease}
          .apr-add:hover .apr-add-label,.apr-add:focus-visible .apr-add-label{max-width:96px;opacity:1;margin-left:6px}
        `}</style>
        <button
          type="button"
          className={cn('apr-add inline-flex items-center h-9 px-2.5 rounded-full text-[13px] font-semibold flex-shrink-0', t.hoverCard)}
          style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
          data-testid="button-add-format"
          aria-label="Add format"
          title="Add format"
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="apr-add-label">Add format</span>
        </button>
      </div>

      {lane === 'audio' ? (
        <>
          <div className="flex items-start justify-between gap-6 flex-wrap" style={{ marginTop: 36 }}>
            <div className="min-w-0">
              <div className="flex items-baseline gap-4 flex-wrap">
                <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>
                  {FORMAT_WORD[assetFormat]} audio.
                </h2>
                {assetFormat === 'vinyl' && <PressAttribution pressName={pressName} t={t} />}
                {assetFormat === 'digital' && (
                  <button type="button" className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-add-bonus-content" title="Add bonus content to the GoodTunes® Player">
                    <Plus className="w-3.5 h-3.5 flex-shrink-0" /> Add bonus content
                  </button>
                )}
              </div>
              <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
                {assetFormat === 'vinyl'
                  ? 'The lacquer-ready set for this pressing. References your album masters until Wave prepares a vinyl cut.'
                  : assetFormat === 'digital'
                    ? 'What buyers stream in the GoodTunes® Player. Uses your album masters — add any bonus content you want in the player.'
                    : 'Your canonical album masters. Every format references them until you override.'}
              </p>
            </div>
            <SegChip
              options={[['art', 'Art'], ['audio', 'Audio']]}
              value={lane}
              onChange={(v) => setLane(v)}
              ariaLabel="Asset lane"
              testPrefix="lane"
              t={t}
              icons={{ art: FileImage, audio: Disc3 }}
            />
          </div>
          <AudioMasterList tracks={tracks} forVinyl={assetFormat === 'vinyl'} t={t} />
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-6 flex-wrap" style={{ marginTop: 36 }}>
            <div className="min-w-0">
              <div className="flex items-baseline gap-4 flex-wrap">
                <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>
                  {FORMAT_WORD[assetFormat]} art.
                </h2>
                {assetFormat === 'vinyl' && <PressAttribution pressName={pressName} t={t} />}
                <TemplatesChip t={t} />
              </div>
              <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
                {assetFormat === 'master'
                  ? 'Your canonical album art. Every format references it until you override.'
                  : assetFormat === 'digital'
                    ? 'What buyers see in the GoodTunes® Player. Uses your album art as-is — no press template to meet.'
                    : `Each piece references your album art until you drop a file to ${pressName}'s templates. Tap any piece to open its test view.`}
              </p>
            </div>
            <SegChip
              options={[['art', 'Art'], ['audio', 'Audio']]}
              value={lane}
              onChange={(v) => setLane(v)}
              ariaLabel="Asset lane"
              testPrefix="lane"
              t={t}
              icons={{ art: FileImage, audio: Disc3 }}
            />
          </div>

          {assetFormat === 'vinyl' ? (
            blocks.length > 0 ? (
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 18 }}>
                {blocks.map((b) => (
                  <BlockCard key={b.id} block={b} href={`/artist/albums/${albumId}/art-test/${b.id}`} artUrl={portal.release.artworkUrl} t={t} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 18, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
                <p className="text-[14px] font-semibold" style={{ color: t.ink }}>No print files scanned yet</p>
                <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>Once {pressName} scans your finished print files, each piece shows up here checked against the press template.</p>
              </div>
            )
          ) : (
            <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 18, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
              {portal.release.artworkUrl ? (
                <img src={portal.release.artworkUrl} alt={`${portal.release.title} album art`} className="rounded-xl" style={{ width: 180, height: 180, objectFit: 'cover', border: `1px solid ${t.hairline}` }} data-testid="img-master-art" />
              ) : null}
              <p className="text-[14px] font-semibold" style={{ marginTop: portal.release.artworkUrl ? 16 : 0, color: t.ink }}>
                {assetFormat === 'digital' ? 'Player art — uses your album art' : 'Album art — the canonical source'}
              </p>
              <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>
                {assetFormat === 'digital'
                  ? 'The GoodTunes® Player shows your album art as-is — no press template to meet.'
                  : hasVinyl
                    ? 'Uploaded once at Master. Switch to a physical format (Vinyl) to see each piece checked against that press template.'
                    : 'Uploaded once at Master. Every format references it until you override.'}
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
function ReleaseStore({ portal, t }: { portal: PortalPayload; t: Theme }) {
  const { toast } = useToast();
  const isShopify = portal.store.sellMode.startsWith('shopify');
  const channel: 'goodtunes' | 'shopify' = isShopify ? 'shopify' : 'goodtunes';
  const cl = portal.store.checklist;
  const checklist = [
    { id: 'art', label: 'Artwork approved', done: cl.art },
    { id: 'audio', label: 'Audio in the player', done: cl.audio },
    { id: 'price', label: 'Price set', done: cl.price },
    { id: 'channel', label: isShopify ? 'Shopify channel connected' : 'Sales channel chosen', done: cl.channel },
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
        ) : (
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
        )}

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
          <h3 className="text-[15px] font-semibold" style={{ color: t.ink }}>{ready ? 'Ready for fans.' : 'Getting ready.'}</h3>
          <p className="text-[12.5px]" style={{ marginTop: 4, color: t.subink, lineHeight: 1.5 }}>
            {portal.release.title} sells on {channel === 'goodtunes' ? 'the GoodTunes® storefront' : 'your Shopify store'}.
          </p>
          <div className="space-y-2" style={{ marginTop: 16 }}>
            {checklist.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5" data-testid={`readiness-${c.id}`}>
                {c.done
                  ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: t.ready }} strokeWidth={3} />
                  : <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, border: `2px solid ${t.warn}` }} />}
                <span className="text-[13px] font-medium" style={{ color: c.done ? t.ink : t.subink }}>{c.label}</span>
              </div>
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
  return (
    <>
      <div className="flex items-end justify-between gap-6 flex-wrap" style={{ marginTop: 24 }}>
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Money out to the plant</h2>
          <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
            One row per project — a format pressed by one plant. You only ever pay GoodTunes®; we release funds to the plant at each milestone.
          </p>
        </div>
      </div>
      {portal.payments.length === 0 ? (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 20, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
          <p className="text-[14px] font-semibold" style={{ color: t.ink }}>Nothing owed on this release.</p>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>Payment schedules appear here once a pressing project starts.</p>
        </div>
      ) : (
        <div className="space-y-3" style={{ marginTop: 20 }}>
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
  const portalQ = useQuery<PortalPayload>({ queryKey: [`/api/artist/albums/${albumId}/portal${personId ? `?personId=${personId}` : ''}`] });
  const portal = portalQ.data;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} title={portal?.release.title ?? '…'} t={t} onTab={setTab} onCrumb={() => navigate('/artist?tab=catalog')} />
      {portalQ.isLoading ? (
        <p className="text-[13.5px]" style={{ marginTop: 26, color: t.subink }}>Loading this release…</p>
      ) : portalQ.isError || !portal ? (
        <p className="text-[13.5px]" style={{ marginTop: 26, color: t.subink }} data-testid="release-error">Couldn&rsquo;t load this release. Refresh to try again.</p>
      ) : tab === 'dashboard' ? (
        <ReleaseDashboard portal={portal} albumId={albumId} t={t} onOpenFormat={() => setTab('assets')} />
      ) : tab === 'details' ? (
        <ReleaseDetails portal={portal} t={t} />
      ) : tab === 'assets' ? (
        <ReleaseAssets portal={portal} albumId={albumId} t={t} />
      ) : tab === 'store' ? (
        <ReleaseStore portal={portal} t={t} />
      ) : (
        <ReleasePayments portal={portal} t={t} />
      )}
    </div>
  );
}
