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
import { ChevronRight, Disc3 } from 'lucide-react';
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
  dimmed?: boolean;
  visibility: string;
};

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
  const badge = badgeLine(card);
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
        {/* Money flag — overlaid on the cover art, top right. Wording is
            unambiguous: the artist pays GoodTunes for manufacturing milestones. */}
        {card.moneyFlag && (
          <div
            className="absolute inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold"
            style={{ top: 10, right: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', backdropFilter: 'blur(6px)' }}
            data-testid={`money-flag-${card.id}`}
            title="You owe GoodTunes® for this release"
          >
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `2px solid ${t.warn}` }} />
            {card.moneyFlag}
          </div>
        )}
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
