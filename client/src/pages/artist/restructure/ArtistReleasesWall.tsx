// Artist Portal Restructure — SCENE 1, the Releases wall.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026); ONLY the MOCK_
// consts were swapped for real data (GET /api/artist/wall). Cards stay
// canon — no table, no stats header. Each shows only derived facts: its
// per-format status, its channel, and a money flag when there's something
// to do.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ChevronRight, Disc3, FileImage, MoreHorizontal, ImagePlus, LayoutTemplate, Upload } from 'lucide-react';
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
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15.5px] font-semibold truncate min-w-0" style={{ color: t.ink, letterSpacing: '-0.015em' }}>{card.name}</h3>
          <ChevronRight className="w-4 h-4 flex-shrink-0 transition-opacity" style={{ color: t.faint, opacity: hover ? 1 : 0 }} aria-hidden />
        </div>
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

export function ArtistReleasesWall({ qs, onOpenAlbum }: {
  qs: string;
  /** Admin mirror override — route tiles to /admin/albums/:id instead of
   * the portal's own /artist/albums/:id. */
  onOpenAlbum?: (albumId: string) => void;
}) {
  const t = useRestructureTheme();
  const [, navigate] = useLocation();
  const wall = useQuery<{ cards: WallCard[] }>({
    queryKey: [`/api/artist/wall${qs ? `?${qs}` : ''}`],
  });
  const cards = wall.data?.cards ?? [];

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Releases. </span>
        <span style={{ color: t.subink }}>Every record you&rsquo;ve made.</span>
      </h1>
      {wall.isLoading ? (
        <p className="text-[13.5px]" style={{ marginTop: 24, color: t.subink }}>Loading your releases…</p>
      ) : wall.isError ? (
        <p className="text-[13.5px]" style={{ marginTop: 24, color: t.subink }} data-testid="wall-error">Couldn&rsquo;t load your releases. Refresh to try again.</p>
      ) : cards.length === 0 ? (
        <p className="text-[13.5px]" style={{ marginTop: 24, color: t.subink }} data-testid="wall-empty">No releases yet.</p>
      ) : (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
          {cards.map((c) => (
            <WallCardTile key={c.id} card={c} t={t} onOpen={() => (onOpenAlbum ? onOpenAlbum(c.id) : navigate(`/artist/albums/${c.id}`))} />
          ))}
        </div>
      )}
    </div>
  );
}
