/**
 * GoodTunes Artist — Project Home (populated)
 *
 * What an artist sees when they save out of the configurator and land back
 * on the project page: album cards with artwork thumbnail + basic specs.
 * Hover a card → quiet actions appear: Open · Duplicate · Archive.
 * Archived albums collapse into a muted "Archived" disclosure at the bottom
 * (never deleted — restore any time).
 */
import { useState } from 'react';
import { Disc3, MoreHorizontal } from 'lucide-react';
import { ArtistShell, PageHeading } from './ArtistProjects';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Brand tokens (Apple canon) ──────────────────────────────────────
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';

const PROJECT_NAME = 'CALIFORNIALAND';

type Album = {
  id: string;
  title: string;
  cover?: string;
  format: string;
  pressing: string;
  detail: string;
  status: 'priced' | 'pressing' | 'draft';
  statusLabel: string;
};

const ALBUMS: Album[] = [
  {
    id: 'lp',
    title: 'CALIFORNIALAND 12"',
    cover: californialandCover,
    format: '12" Vinyl',
    pressing: 'Translucent Ruby',
    detail: 'Double LP · 10 tracks',
    status: 'priced',
    statusLabel: 'Priced — ready to press',
  },
  {
    id: 'cd',
    title: 'CALIFORNIALAND CD',
    cover: undefined,
    format: 'CD',
    pressing: 'Jewel case',
    detail: 'Single disc · 10 tracks',
    status: 'draft',
    statusLabel: 'Draft — no artwork yet',
  },
];

const ARCHIVED: Album[] = [
  {
    id: 'cassette',
    title: 'CALIFORNIALAND Cassette',
    cover: undefined,
    format: 'Cassette',
    pressing: 'Smoke shell',
    detail: 'Single tape · 10 tracks',
    status: 'draft',
    statusLabel: 'Archived',
  },
];

function StatusDot({ status }: { status: Album['status'] }) {
  const color =
    status === 'priced' ? '#34c759' : status === 'pressing' ? BLUE : '#aeaeb2';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function AlbumTile({ album, archived = false }: { album: Album; archived?: boolean }) {
  const TILE = 200;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="group cursor-pointer"
      style={{ width: TILE, opacity: archived ? 0.6 : 1 }}
      data-testid={`card-album-${album.id}`}
    >
      {/* Artwork — the whole tile opens the album; hover floats quiet
          actions over the art, text below never moves. */}
      <div
        className="relative rounded-xl overflow-hidden transition-transform group-hover:scale-[1.02]"
        style={{ width: TILE, height: TILE, border: `1px solid ${HAIRLINE}` }}
      >
        {album.cover ? (
          <img
            src={album.cover}
            alt={`${album.title} artwork`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: '#f5f5f7' }}
          >
            <Disc3 className="w-10 h-10" style={{ color: '#c7c7cc' }} />
          </div>
        )}
        {/* Hover: a single frosted "···" circle, Apple Music style.
            Click opens the small menu with the secondary actions. */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="flex items-center justify-center w-7 h-7 rounded-full backdrop-blur-md transition-colors hover:bg-white"
            style={{ backgroundColor: 'rgba(255,255,255,0.88)', color: INK }}
            aria-label="More options"
            data-testid={`button-more-${album.id}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        {menuOpen && (
          <div
            className="absolute bottom-11 right-2 rounded-xl bg-white py-1 shadow-lg"
            style={{ border: `1px solid ${HAIRLINE}`, minWidth: 132 }}
          >
            {(archived ? ['Restore'] : ['Duplicate', 'Archive']).map((label) => (
              <button
                key={label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-slate-50"
                style={{ color: INK }}
                data-testid={`button-${label.toLowerCase()}-${album.id}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text below — always visible, Apple Music style */}
      <div style={{ marginTop: 10 }}>
        <h3
          className="font-medium truncate text-[14px]"
          style={{ color: INK, letterSpacing: '-0.01em' }}
        >
          {album.title}
        </h3>
        <p className="text-[12.5px] truncate" style={{ color: SUBINK, marginTop: 2 }}>
          {album.format} — {album.pressing}
        </p>
        <p
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: SUBINK, marginTop: 5 }}
        >
          <StatusDot status={album.status} />
          {album.statusLabel}
        </p>
      </div>
    </div>
  );
}

export function ArtistProjectHome() {
  const [archivedOpen, setArchivedOpen] = useState(false);

  return (
    <ArtistShell>
      <div className="flex flex-col gap-6">
        {/* Breadcrumb — configurator style (uppercase 11px) */}
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Projects
            </a>
            <span className="text-slate-300">›</span>
            <span className="text-slate-700">{PROJECT_NAME}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <PageHeading
              lead={`${PROJECT_NAME}.`}
              rest="Your project home."
              testId="heading-project-home"
            />
          </div>
        </div>

        {/* Albums */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold" style={{ color: INK, letterSpacing: '-0.01em' }}>
              Albums
            </h2>
            <div className="flex items-center gap-1">
              {/* Archived filter — lives in the header so it never gets
                  pushed down as albums grow. Toggling shows dimmed archived
                  tiles inline at the end of the grid. */}
              <button
                type="button"
                onClick={() => setArchivedOpen((v) => !v)}
                className="inline-flex items-center rounded-full px-3 h-8 text-[13.5px] font-medium transition-colors hover:bg-slate-100"
                style={{
                  color: archivedOpen ? INK : SUBINK,
                  backgroundColor: archivedOpen ? '#e8e8ed' : 'transparent',
                }}
                data-testid="button-toggle-archived"
              >
                Archived ({ARCHIVED.length})
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-full px-3 h-8 text-[13.5px] font-medium transition-colors hover:bg-[#f0f7fc]"
                style={{ color: BLUE }}
                data-testid="button-new-album"
              >
                + New album
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            {ALBUMS.map((a) => (
              <AlbumTile key={a.id} album={a} />
            ))}
            {archivedOpen &&
              ARCHIVED.map((a) => <AlbumTile key={a.id} album={a} archived />)}
          </div>
        </section>
      </div>
    </ArtistShell>
  );
}

export default ArtistProjectHome;
