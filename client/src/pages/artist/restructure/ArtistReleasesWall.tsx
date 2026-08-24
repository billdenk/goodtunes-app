// Artist Portal Restructure — SCENE 1, the Releases wall.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026); ONLY the MOCK_
// consts were swapped for real data (GET /api/artist/wall). Cards stay
// canon — no table, no stats header. Each shows only derived facts: its
// per-format status, its channel, and a money flag when there's something
// to do.

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Disc3, FileImage, MoreHorizontal, ImagePlus, LayoutTemplate, Upload, Plus } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  useRestructureTheme,
  ChannelGlyph,
  type Channel,
  type Theme,
} from './shared';

type WallFormat = { id: string; format: string; kind: string; label: string; active: boolean; status: 'live' | 'press' | 'draft' };
type WallCard = {
  id: string;
  name: string;
  year: string;
  cover?: string | null;
  formats: WallFormat[];
  channel: Channel;
  moneyFlag?: string | null;
  needsArt?: boolean;
  dimmed?: boolean;
  visibility: string;
};

// Cover ••• menu rows — Ruby's Aug 19 handoff COVER_MENU. All three are
// deliberate quiet dead-ends until thumbnail management is designed
// (gogoods, Aug 19 2026: "visual-only").
const COVER_MENU = [
  { id: 'front', label: 'Use Front panel', icon: ImagePlus },
  { id: 'back', label: 'Use Back panel', icon: LayoutTemplate },
  { id: 'upload', label: 'Upload your own thumbnail', icon: Upload },
] as const;

// Derived per-format badge line — pill states → words, per Part 3.
const STATUS_WORD: Record<string, string> = { live: 'live', press: 'at press', draft: 'draft' };
const KIND_LABEL: Record<string, string> = { digital: 'Digital', vinyl: 'Vinyl', cd: 'CD', cassette: 'Cassette', other: 'Format' };
function badgeLine(card: WallCard): string {
  if (card.visibility === 'Hidden') return 'Sunset';
  if (!card.formats.length) return card.visibility === 'Preview' ? 'In preview' : 'No formats yet';
  const seen = new Map<string, string>();
  for (const f of card.formats) {
    if (!seen.has(f.kind)) seen.set(f.kind, `${KIND_LABEL[f.kind] ?? f.kind} ${STATUS_WORD[f.status] ?? f.status}`);
  }
  return Array.from(seen.values()).join(' · ');
}

function WallCardTile({ card, t, onOpen }: { card: WallCard; t: Theme; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // GOLDENROD badge override — a release that still needs print art leads
  // with that, ahead of the per-format status line (Ruby's Aug 19 handoff).
  const badge = card.needsArt ? 'No print art yet — start from the blank template' : badgeLine(card);
  return (
    <div
      className="group rounded-3xl overflow-hidden cursor-pointer flex flex-col"
      style={{
        backgroundColor: t.card,
        border: `1px solid ${t.hairline}`,
        boxShadow: hover ? '0 12px 32px rgba(0,0,0,0.5)' : 'none',
        transform: hover ? 'translateY(-3px)' : 'none',
        opacity: card.dimmed ? 0.6 : 1,
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      data-testid={`row-release-${card.id}`}
    >
      <div className="relative w-full" style={{ aspectRatio: '1 / 1', backgroundColor: t.soft }}>
        {card.cover ? (
          <img src={card.cover} alt={`${card.name} artwork`} className="absolute inset-0 w-full h-full object-cover" style={{ filter: card.dimmed ? 'saturate(0.4)' : 'none' }} draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Disc3 style={{ width: 56, height: 56, color: t.faint, strokeWidth: 1.25 }} />
          </div>
        )}
        {/* Cover flags — stacked top LEFT (Ruby's Aug 19 handoff): money flag
            first, art flag under it. Wording is unambiguous: the artist pays
            GoodTunes for manufacturing milestones. */}
        {card.moneyFlag && (
          <div
            className="absolute inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold"
            style={{ top: 10, left: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', backdropFilter: 'blur(6px)' }}
            data-testid={`money-flag-${card.id}`}
            title="You owe GoodTunes® for this release"
          >
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `2px solid ${t.warn}` }} />
            {card.moneyFlag}
          </div>
        )}
        {card.needsArt && (
          <div
            className="absolute inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold"
            style={{ top: card.moneyFlag ? 44 : 10, left: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', backdropFilter: 'blur(6px)' }}
            data-testid={`art-flag-${card.id}`}
            title="This release still needs print-ready art"
          >
            <FileImage className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            Needs print-ready art
          </div>
        )}
        {/* Cover ••• overflow — top right on EVERY card; frosted circle that
            shows on hover or while open. Menu rows are quiet dead-ends. */}
        <div
          className="absolute"
          style={{ top: 10, right: 10, opacity: hover || menuOpen ? 1 : 0, transition: 'opacity 0.2s ease' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Cover options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-full"
            style={{ width: 28, height: 28, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(6px)' }}
            data-testid={`cover-menu-${card.id}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute z-20 rounded-xl overflow-hidden"
                style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 208, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}
                role="menu"
                data-testid={`cover-menu-list-${card.id}`}
              >
                {COVER_MENU.map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-2.5 text-left text-[13px]"
                      style={{ padding: '10px 14px', color: t.ink, borderTop: i ? `1px solid ${t.hairline}` : undefined }}
                      data-testid={`cover-menu-${row.id}-${card.id}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> {row.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col" style={{ padding: '13px 16px 15px' }}>
        {/* Hover chevron removed (Bill, Aug 18 2026): the whole card is the affordance. */}
        <h3 className="text-[15.5px] font-semibold truncate min-w-0" style={{ color: t.ink, letterSpacing: '-0.015em' }}>{card.name}</h3>
        {/* Derived per-format status line, directly under the title */}
        <div className="text-[12px] truncate" style={{ marginTop: 6, color: t.subink, lineHeight: 1.4 }} data-testid={`badge-${card.id}`}>{badge}</div>
        {/* Bottom row — year on the left, channel glyph (logo only) on the right */}
        <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
          <span className="text-[11.5px]" style={{ color: t.faint }}>{card.year}</span>
          <ChannelGlyph channel={card.channel} />
        </div>
      </div>
    </div>
  );
}

// New-release walk (Bill & Andrew run-sheet cc260e2) — name + format →
// Release → Draft → Project. The Release/Draft is the prepping album shell
// (same POST /api/admin/albums the operator "+ Add" uses; the server forces
// the artist's own person scope, Task #2868), then we land on the project
// page. The mock's compare chooser is mock-only scaffolding — not shipped.
const NEW_RELEASE_FORMATS = [
  { id: 'single_lp', label: 'Vinyl', sub: '12" record' },
  { id: 'cd', label: 'CD', sub: 'Compact disc' },
  { id: 'cassette', label: 'Cassette', sub: 'Tape' },
] as const;

function NewReleaseModal({ t, artistName, personId, onClose, onCreated }: {
  t: Theme;
  artistName: string | null;
  personId: string | null;
  onClose: () => void;
  onCreated: (albumId: string) => void;
}) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<string>('single_lp');
  const { toast } = useToast();
  // Focus containment — remember the trigger, trap Tab inside the sheet,
  // close on Escape, and hand focus back on unmount.
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => trigger?.focus?.();
  }, []);
  const onSheetKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const focusables = sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/albums', {
        title: name.trim(),
        artist: artistName || 'Unknown artist',
        artwork: '/album-placeholder.svg',
        type: 'LP',
        isGoodTunesRelease: true,
        isPrepping: true,
        physicalFormat: format,
        // Server forces the artist's own scope for artist sessions; the id
        // matters only on the operator god-view mirror.
        primaryArtistId: personId || null,
      });
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/api/artist/wall'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/albums'] });
      onCreated(a.id);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create the release", description: err?.message || 'Please try again.', variant: 'destructive' });
    },
  });
  const canSubmit = name.trim().length > 0 && !create.isPending;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="New release"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', padding: 20 }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="rounded-2xl"
        style={{ width: 440, maxWidth: '100%', background: t.card, border: `1px solid ${t.hairline}`, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onSheetKeyDown}
        data-testid="sheet-new-release"
      >
        <h2 className="text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.02em' }}>New release.</h2>
        <p className="text-[12.5px]" style={{ color: t.subink, marginTop: 6, lineHeight: 1.5 }}>
          Name it and pick the first format — everything else happens on the project page.
        </p>
        <label className="block text-[12px] font-medium" style={{ color: t.subink, marginTop: 16 }} htmlFor="new-release-name">Release name</label>
        <input
          id="new-release-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) create.mutate(); }}
          placeholder="e.g. CALIFORNIALAND"
          className="w-full rounded-lg text-[14px] outline-none"
          style={{ marginTop: 6, padding: '9px 12px', background: 'transparent', border: `1px solid ${t.hairline}`, color: t.ink }}
          data-testid="input-new-release-name"
        />
        <div className="text-[12px] font-medium" style={{ color: t.subink, marginTop: 14 }}>First format</div>
        <div className="grid grid-cols-3 gap-2" style={{ marginTop: 6 }}>
          {NEW_RELEASE_FORMATS.map((f) => {
            const on = format === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className="rounded-xl text-left"
                style={{ padding: '10px 12px', background: on ? t.card : 'transparent', border: `1px solid ${on ? t.ink : t.hairline}`, color: t.ink }}
                aria-pressed={on}
                data-testid={`option-new-release-format-${f.id}`}
              >
                <div className="text-[13px] font-semibold">{f.label}</div>
                <div className="text-[11.5px]" style={{ color: t.subink, marginTop: 2 }}>{f.sub}</div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2.5" style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full text-[13px] font-medium"
            style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${t.hairline}`, color: t.ink }}
            data-testid="button-new-release-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => create.mutate()}
            className="rounded-full text-[13px] font-semibold text-white"
            style={{ padding: '8px 18px', background: '#319ED8', border: 'none', opacity: canSubmit ? 1 : 0.5 }}
            data-testid="button-new-release-create"
          >
            {create.isPending ? 'Creating…' : 'Create release'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ArtistReleasesWall({ qs, onOpenAlbum, artistName, personId }: {
  qs: string;
  /** Admin mirror override — route tiles to /admin/albums/:id instead of
   * the portal's own /artist/albums/:id. */
  onOpenAlbum?: (albumId: string) => void;
  /** Portal artist identity — seeds the create call's artist string. */
  artistName?: string | null;
  /** God-view scope id; artist sessions can leave it null (server forces scope). */
  personId?: string | null;
}) {
  const t = useRestructureTheme();
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const wall = useQuery<{ cards: WallCard[] }>({
    queryKey: [`/api/artist/wall${qs ? `?${qs}` : ''}`],
  });
  const cards = wall.data?.cards ?? [];
  const openAlbum = (albumId: string) => (onOpenAlbum ? onOpenAlbum(albumId) : navigate(`/artist/albums/${albumId}`));

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-semibold min-w-0" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
          <span style={{ color: t.ink }}>Releases. </span>
          <span style={{ color: t.subink }}>Every record you&rsquo;ve made.</span>
        </h1>
        {/* Run-sheet cc260e2 — quiet outline pill, always visible (an empty
            catalog can never be a dead end). No solid blue up here; the wall
            is the hero. */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full text-[13.5px] font-medium flex-shrink-0 transition-colors"
          style={{ padding: '8px 16px', background: t.card, border: `1px solid ${t.hairline}`, color: t.ink }}
          data-testid="button-new-release"
        >
          <Plus className="w-4 h-4" style={{ color: t.subink }} />
          New Release
        </button>
      </div>
      {wall.isLoading ? (
        <p className="text-[13.5px]" style={{ marginTop: 24, color: t.subink }}>Loading your releases…</p>
      ) : wall.isError ? (
        <p className="text-[13.5px]" style={{ marginTop: 24, color: t.subink }} data-testid="wall-error">Couldn&rsquo;t load your releases. Refresh to try again.</p>
      ) : cards.length === 0 ? (
        <p className="text-[13.5px]" style={{ marginTop: 24, color: t.subink }} data-testid="wall-empty">No releases yet — start your first with New Release, top right.</p>
      ) : (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
          {cards.map((c) => (
            <WallCardTile key={c.id} card={c} t={t} onOpen={() => (onOpenAlbum ? onOpenAlbum(c.id) : navigate(`/artist/albums/${c.id}`))} />
          ))}
        </div>
      )}
      {createOpen && (
        <NewReleaseModal
          t={t}
          artistName={artistName ?? null}
          personId={personId ?? null}
          onClose={() => setCreateOpen(false)}
          onCreated={(albumId) => { setCreateOpen(false); openAlbum(albumId); }}
        />
      )}
    </div>
  );
}
