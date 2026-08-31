// ArtistProjectHomeHellbender — the Hellbender-skinned twin of
// ArtistProjectHome. Same page, same structure, kept in LOCKSTEP with the
// GoodTunes original: album tiles with artwork + basic specs, hover "···"
// menu (Create variant / Archive / Restore), archived disclosure in the
// section header. Only the skin changes: Hellbender white-label light canon
// (Apple-canon light canvas, restrained Hellbender red action accent,
// rounded controls and cards). Shell wears the current signed-in artist
// header and rail. Statuses are word + icon, never color
// alone (Bill is colorblind). "Estimate", never the q-word. Self-contained
// per handoff rules.

import { useState } from 'react';
import { MessageSquarePlus, UserPen, UserPlus, LogOut } from 'lucide-react';
import howAlbumCover from '../assets/how-album-cover.jpg';
import alexPhoto from '../assets/alex-tebeleff.jpg';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';

// ─── Mock data — How???'s running pressing project ────────────────────
const MOCK_CLIENT_FIRST = 'Alex';
const MOCK_PROJECT = 'How???';
const MOCK_ESTIMATE_NO = '071500-02';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$8.37 /unit';
const MOCK_TOTAL = '$8,375.00';

// ─── Palette — Hellbender light canon ────────────────────────────────
const CANVAS = '#f5f5f7';
const CARD = '#ffffff';
const CARD_RAISED = '#f0f0f2';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = '#e6e6ea';
const RED = '#DF0C15'; // the ONE earned fill on this page
const LINK = '#DF0C15'; // links = red

// ─── Button grammar — EXACT from hellbendervinyl.com base.css ────────
// Buttons are FULLY ROUNDED PILLS (--buttons-radius: 40px): uppercase Chivo
// 15px, min-height 45px, padding 0 30px, letter-spacing ~1px. Filled = red
// fill + WHITE text; outlined/secondary = white bg + red text + red border.
// Inputs are (nearly) square: radius 2px, 1px border rgba(0,0,0,0.15).
const INPUT_BORDER = 'rgba(0,0,0,0.15)';
const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  borderRadius: 40, minHeight: 45, padding: '0 30px', fontFamily: "'Chivo', sans-serif",
  fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnFilled: React.CSSProperties = { ...btnBase, background: RED, color: '#ffffff', border: 'none' };
const btnOutline: React.CSSProperties = { ...btnBase, background: 'transparent', color: INK, border: `1px solid ${HAIRLINE}` };

// ─── Albums — same content as the charcoal original, How??? run ──────
type AlbumStatus = 'priced' | 'pressing' | 'draft' | 'archived';

type Album = {
  id: string;
  title: string;
  cover?: string;
  format: string;
  pressing: string;
  detail: string;
  status: AlbumStatus;
  statusLabel: string;
};

const MOCK_ALBUMS: Album[] = [
  {
    id: 'lp',
    title: `${MOCK_PROJECT} 12"`,
    cover: howAlbumCover,
    format: '12" Vinyl',
    pressing: 'Translucent Emerald',
    detail: 'Double LP · 10 tracks',
    status: 'pressing',
    statusLabel: `In production — estimate ${MOCK_ESTIMATE_NO}`,
  },
  {
    id: 'cd',
    title: `${MOCK_PROJECT} CD`,
    cover: undefined,
    format: 'CD',
    pressing: 'Jewel case',
    detail: 'Single disc · 10 tracks',
    status: 'draft',
    statusLabel: 'Draft — no artwork yet',
  },
];

const MOCK_ARCHIVED: Album[] = [
  {
    id: 'cassette',
    title: `${MOCK_PROJECT} Cassette`,
    cover: undefined,
    format: 'Cassette',
    pressing: 'Smoke shell',
    detail: 'Single tape · 10 tracks',
    status: 'archived',
    statusLabel: 'Archived',
  },
];

// ─── Status grammar — word + icon, never color alone ─────────────────
function StatusGlyph({ status }: { status: AlbumStatus }) {
  const common = { fill: 'none' as const, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (status === 'priced') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M3 8.5L6.5 12L13 4.5" stroke={INK} {...common} />
      </svg>
    );
  }
  if (status === 'pressing') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="5.6" stroke={INK} {...common} />
        <circle cx="8" cy="8" r="1.4" stroke={INK} {...common} />
      </svg>
    );
  }
  if (status === 'archived') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path d="M2.5 4h11v2.5h-11zM3.5 6.5v6h9v-6M6.5 9h3" stroke={SUBINK} {...common} />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path d="M10.8 2.8l2.4 2.4L6 12.4l-3 .6.6-3 7.2-7.2z" stroke={SUBINK} {...common} />
    </svg>
  );
}

// ─── Rail — artist nav canon order, Team pinned at the bottom ────────
const RAIL_ITEMS = ['Dashboard', 'Releases', 'Audience', 'Acquisition', 'Orders', 'Buyers', 'Referrals', 'Shopify', 'Reports'];

function RailIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? INK : SUBINK;
  const common = { fill: 'none', stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'Dashboard': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><rect x="2" y="2" width="5" height="5" rx="1.2" {...common} /><rect x="9" y="2" width="5" height="5" rx="1.2" {...common} /><rect x="2" y="9" width="5" height="5" rx="1.2" {...common} /><rect x="9" y="9" width="5" height="5" rx="1.2" {...common} /></svg>;
    case 'Releases': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="5.6" {...common} /><circle cx="8" cy="8" r="1.4" {...common} /></svg>;
    case 'Audience': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="5.5" cy="6" r="2.2" {...common} /><circle cx="10.8" cy="6.6" r="1.7" {...common} /><path d="M2 13c0-2 1.6-3.4 3.5-3.4S9 11 9 13M9.6 12.9c.2-1.6 1.2-2.6 2.6-2.6 1 0 1.8.5 2.2 1.3" {...common} /></svg>;
    case 'Acquisition': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M2 12l4-4 3 3 5-6M14 5v3.5M14 5h-3.5" {...common} /></svg>;
    case 'Orders': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3 4h10l-1 8H4L3 4zM6 6.5V4a2 2 0 0 1 4 0v2.5" {...common} /></svg>;
    case 'Buyers': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="5.5" r="2.4" {...common} /><path d="M3.5 13.5c.5-2.4 2.2-3.8 4.5-3.8s4 1.4 4.5 3.8" {...common} /></svg>;
    case 'Referrals': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M8 2.5v7M8 2.5L5.5 5M8 2.5L10.5 5M3 9.5v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" {...common} /></svg>;
    case 'Shopify': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3.5 5.5h9l-.8 8h-7.4l-.8-8zM5.8 5.5a2.2 2.2 0 0 1 4.4 0" {...common} /></svg>;
    case 'Reports': return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><path d="M3.5 13.5v-4M8 13.5v-8M12.5 13.5V7" {...common} /></svg>;
    default: return <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden><circle cx="5.5" cy="6" r="2.2" {...common} /><circle cx="11" cy="6" r="2.2" {...common} /><path d="M2 13.5c.4-2 1.8-3.2 3.5-3.2s3.1 1.2 3.5 3.2M9.7 11.2c.4-.5 1-.9 1.8-.9 1.4 0 2.6 1 3 3.2" {...common} /></svg>;
  }
}

function RailRow({ name, active }: { name: string; active: boolean }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      data-testid={`rail-${name.toLowerCase()}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
        fontSize: 13, fontWeight: active ? 700 : 400, color: active ? INK : SUBINK,
        background: active ? CARD_RAISED : 'transparent',
        border: active ? `1px solid ${HAIRLINE}` : '1px solid transparent',
        textDecoration: 'none',
      }}
    >
      <RailIcon name={name} active={active} />
      {name}
    </a>
  );
}

// ─── Account persona — the signed-in admin ────────────────────────────
const MOCK_USER_NAME = 'Alex Tebeleff';
const MOCK_USER_EMAIL = 'alex@howband.com';

const FONT = "'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

// ─── Canon account dropdown — local useState popover (self-contained;
// mirrors the UserMenu in ArtistReleasesIndex, Hellbender square skin) ─
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'Light' | 'Dark' | 'System'>('Light');
  const items: { label: string; icon: typeof UserPen }[] = [
    { label: 'Edit profile', icon: UserPen },
    { label: 'Invite teammate', icon: UserPlus },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="button-user-menu"
        style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${HAIRLINE}`, padding: 0, cursor: 'pointer', background: 'transparent', display: 'block' }}
      >
        <img src={alexPhoto} alt={MOCK_USER_NAME} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </button>
      {open && (
        <div
          data-testid="menu-user"
          style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, width: 300, background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.12)', fontFamily: FONT }}
        >
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{MOCK_USER_NAME}</div>
            <div style={{ fontSize: 11.5, color: SUBINK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{MOCK_USER_EMAIL}</div>
          </div>
          <div style={{ padding: '4px 0' }}>
            {items.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => setOpen(false)}
                data-testid={`menu-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}
              >
                <Icon style={{ width: 15, height: 15, flexShrink: 0, color: SUBINK }} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'block', padding: '10px 14px', borderTop: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: SUBINK, marginBottom: 6 }}>APPEARANCE</div>
            <div style={{ display: 'flex', background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, borderRadius: 999, padding: 2 }} role="radiogroup" aria-label="Appearance">
              {(['Light', 'Dark', 'System'] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m)}
                    data-testid={`appearance-${m.toLowerCase()}`}
                    style={{
                      padding: '3px 9px', borderRadius: 40, fontSize: 11.5, cursor: 'pointer', fontFamily: FONT,
                      fontWeight: active ? 700 : 400,
                       background: active ? CARD : 'transparent',
                       border: '1px solid transparent',
                       boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                      color: active ? INK : SUBINK,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: '4px 0', borderTop: `1px solid ${HAIRLINE}` }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              data-testid="menu-item-sign-out"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT }}
            >
              <LogOut style={{ width: 15, height: 15, flexShrink: 0, color: SUBINK }} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Signed-in header — canon quiet chrome (marketing nav + announcement
// bar deleted once signed in): band left, Feedback + avatar right. ─────
function HbSiteHeader() {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(251,251,253,0.72)', backdropFilter: 'blur(18px)' }}>
      <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 20px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src={hellbenderIcon} alt="" aria-hidden style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0, filter: 'brightness(0) saturate(100%) invert(14%) sepia(99%) saturate(6155%) hue-rotate(354deg) brightness(98%) contrast(101%)' }} />
          <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Hellbender Vinyl</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <button
            type="button"
            data-testid="button-feedback"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: SUBINK, fontFamily: FONT, fontSize: 13, fontWeight: 700, padding: '6px 10px' }}
          >
            <MessageSquarePlus style={{ width: 16, height: 16 }} />
            Feedback
          </button>
          <AccountMenu />
        </div>
      </header>
    </div>
  );
}

// Simple portal footer — the MRP twins' compact bar treatment, but on
// Hellbender red instead of black (Bill's call). White mark + ink on red.
function HbSimpleFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${HAIRLINE}`, background: CANVAS, color: SUBINK, padding: '14px 26px' }} data-testid="portal-footer">
      <div style={{ maxWidth: 1240, margin: '0 auto', fontSize: 11.5 }}>
        {MOCK_PROJECT} is running with Hellbender Vinyl · hellbendervinyl.com
      </div>
    </footer>
  );
}

// ─── Album tile — lockstep with the charcoal original, square skin ───
function AlbumTile({ album, archived = false }: { album: Album; archived?: boolean }) {
  const TILE = 200;
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ width: TILE, opacity: archived ? 0.6 : 1, cursor: 'pointer' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      data-testid={`card-album-${album.id}`}
    >
      {/* Artwork — the whole tile opens the album; hover floats a quiet
          "···" over the art, text below never moves. Square corners. */}
      <div style={{ position: 'relative', width: TILE, height: TILE, border: `1px solid ${HAIRLINE}`, borderRadius: 0, overflow: 'hidden', transform: hover ? 'scale(1.02)' : 'none', transition: 'transform 0.2s ease' }}>
        {album.cover ? (
          <img src={album.cover} alt={`${album.title} artwork`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: CARD_RAISED }}>
            {/* Record glyph placeholder — no artwork yet */}
            <svg width="40" height="40" viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="6.4" fill="none" stroke="#c7c7cc" strokeWidth="1.2" />
              <circle cx="8" cy="8" r="1.6" fill="none" stroke="#c7c7cc" strokeWidth="1.2" />
            </svg>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 8, right: 8, opacity: hover ? 1 : 0, transition: 'opacity 0.2s ease' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label="More options"
            data-testid={`button-more-${album.id}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 0, border: `1px solid ${HAIRLINE}`, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', color: INK, cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1 }}
          >
            &middot;&middot;&middot;
          </button>
        </div>
        {menuOpen && (
          <div style={{ position: 'absolute', bottom: 44, right: 8, borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.10)', padding: '4px 0', minWidth: 132 }}>
            {(archived ? ['Restore'] : ['Create variant', 'Archive']).map((label) => (
              <button
                key={label}
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                data-testid={`button-${label.toLowerCase().replace(' ', '-')}-${album.id}`}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 14px', fontSize: 13, fontWeight: 400, color: INK, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text below — always visible */}
      <div style={{ marginTop: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {album.title}
        </h3>
        <p style={{ fontSize: 12.5, color: SUBINK, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {album.format} — {album.pressing}
        </p>
        {/* Status = word + icon, never color alone (Bill is colorblind). */}
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: SUBINK, margin: '5px 0 0' }}>
          <StatusGlyph status={album.status} />
          {album.statusLabel}
        </p>
      </div>
    </div>
  );
}

export default function ArtistProjectHomeHellbender() {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const font = "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif";

  return (
    <div data-testid="artist-project-shell" style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        [data-testid="artist-project-shell"] button { border-radius: 999px !important; }
        [data-testid="artist-project-shell"] [data-testid^="card-album"] > div:first-child { border-radius: 16px !important; }
        @media (max-width: 767px) {
          [data-testid="artist-project-shell"] nav { display: none !important; }
          [data-testid="artist-project-shell"] main > div { padding: 24px 20px 64px !important; }
        }
      `}</style>

      {/* ── Hellbender's own site header wears the portal ── */}
      <HbSiteHeader />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav canon, Team pinned at the bottom ── */}
        <nav style={{ width: 244, flexShrink: 0, background: '#fbfbfd', borderRight: `1px solid ${HAIRLINE}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 56, height: 'calc(100dvh - 56px)' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              placeholder="Search"
              data-testid="input-rail-search"
              style={{ width: '100%', height: 34, borderRadius: 2, padding: '0 44px 0 12px', fontSize: 12.5, background: CARD_RAISED, border: `1px solid ${INPUT_BORDER}`, color: INK, outline: 'none' }}
            />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 700, color: SUBINK, background: CANVAS, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '2px 5px' }}>
              &#8984;K
            </span>
          </div>
          {RAIL_ITEMS.map((r) => <RailRow key={r} name={r} active={r === 'Releases'} />)}
          <div style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: 'auto', paddingTop: 8 }}>
            <RailRow name="Settings" active={false} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 12px 4px', borderTop: `1px solid ${HAIRLINE}`, marginTop: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: SUBINK }}>POWERED BY</span>
            <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 16, width: 'auto', opacity: 0.9 }} />
          </div>
        </nav>

        {/* ── Main — the project home, lockstep with the original ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 40px 96px' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a1a1a6' }}>
              <a href="#" onClick={(e) => e.preventDefault()} style={{ color: SUBINK, textDecoration: 'none' }}>
                Releases
              </a>
              <span aria-hidden style={{ color: '#a1a1a6' }}>&rsaquo;</span>
              <span style={{ color: INK }}>{MOCK_PROJECT}</span>
            </div>

            {/* Heading — Apple grammar: lead bold, rest quiet */}
            <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', margin: '12px 0 0' }} data-testid="heading-project-home">
              {MOCK_PROJECT}. <span style={{ color: SUBINK, fontWeight: 400 }}>Your project home.</span>
            </h1>
            <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0' }}>
              Running with Hellbender Vinyl via hellbendervinyl.com — {MOCK_QTY} at {MOCK_UNIT} · {MOCK_TOTAL} · Estimate <span style={{ fontWeight: 700, color: INK }}>{MOCK_ESTIMATE_NO}</span>
            </p>

            {/* ── Albums ── */}
            <section style={{ marginTop: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>Albums</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Archived filter — lives in the header so it never gets
                      pushed down as albums grow. Quiet outline, square. */}
                  <button
                    type="button"
                    onClick={() => setArchivedOpen((v) => !v)}
                    data-testid="button-toggle-archived"
                    style={{ ...btnOutline, background: archivedOpen ? RED : '#ffffff', color: archivedOpen ? '#ffffff' : RED }}
                  >
                    Archived ({MOCK_ARCHIVED.length})
                  </button>
                  {/* The page's ONE filled red — white text on red, never dark ink. */}
                  <button
                    type="button"
                    data-testid="button-new-album"
                    style={btnFilled}
                  >
                    New album
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                {MOCK_ALBUMS.map((a) => (
                  <AlbumTile key={a.id} album={a} />
                ))}
                {archivedOpen &&
                  MOCK_ARCHIVED.map((a) => <AlbumTile key={a.id} album={a} archived />)}
              </div>
            </section>
          </div>
        </main>
      </div>

      <HbSimpleFooter />
    </div>
  );
}
