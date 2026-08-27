// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE and
// it applies across the whole MRP skin — buttons, cards, pills included.
// Only true circles (avatars, status dots) stay round.
// ArtistProjectHomeMRP — the MRP-skinned twin of ArtistProjectHome. Same
// page, same structure, kept in LOCKSTEP with the GoodTunes original:
// album tiles with artwork + basic specs, hover "···" menu (Create
// variant / Archive / Restore), archived disclosure in the section
// header. Only the skin changes: MRP white-label light canon (pure white
// canvas, gold #D9C153 with dark ink on the ONE filled action, black
// hairlines, Poppins throughout, square corners). Shell copied from
// PressClientNextStepsMRP: MRP site header signed-in + artist rail with
// Team pinned + dark footer with Powered by GoodTunes®. Statuses are
// word + icon, never color alone (Bill is colorblind). "Estimate", never
// the q-word. Self-contained per handoff rules.

import { useState } from 'react';
import { MessageSquarePlus, UserPen, UserPlus, LogOut } from 'lucide-react';
import californialandCover from '../assets/californialand-cover.jpg';
import niinaPhoto from '../assets/niina-soleil.webp';
import mrpLogoAsset from '../assets/mrp-logo.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';

// ─── Mock data — Niina's running pressing project ────────────────────
const MOCK_CLIENT_FIRST = 'Niina';
const MOCK_PROJECT = 'CALIFORNIALAND';
const MOCK_ESTIMATE_NO = '071500-02';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$8.37 /unit';
const MOCK_TOTAL = '$8,375.00';

// ─── Palette — MRP light canon (twin of PressClientNextStepsMRP) ─────
const CANVAS = '#ffffff';
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#D9C153'; // the ONE earned fill on this page

// ─── Albums — same content as the charcoal original, Californialand run ─
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
    cover: californialandCover,
    format: '12" Vinyl',
    pressing: 'Translucent Ruby',
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
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 0,
        fontSize: 13, fontWeight: active ? 600 : 500, color: active ? INK : SUBINK,
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

// ─── MRP's signed-in chrome — marketing nav drops away after login ───
// (Canon spec, Bill Aug 24 2026: artist photo + name left; quiet
// Feedback + account avatar with the canon dropdown right. No press
// mark, no bell, no name label beside the avatar.)

const MOCK_CLIENT_FULL = 'Niina Soleil';
const MOCK_CLIENT_EMAIL = 'niina@niinasoleil.com';
type Appearance = 'Light' | 'Dark' | 'System';

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>('Light');
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        data-testid="button-user-menu"
        style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${HAIRLINE}`, padding: 0, cursor: 'pointer', background: 'transparent', display: 'block' }}
      >
        <img src={niinaPhoto} alt={MOCK_CLIENT_FULL} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60, width: 300, background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 0, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }} data-testid="menu-user">
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{MOCK_CLIENT_FULL}</div>
            <div style={{ fontSize: 11.5, color: SUBINK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{MOCK_CLIENT_EMAIL}</div>
          </div>
          <div style={{ padding: '4px 0' }}>
            {[{ label: 'Edit profile', icon: UserPen }, { label: 'Invite teammate', icon: UserPlus }].map(({ label, icon: Icon }) => (
              <button key={label} type="button" data-testid={`menu-item-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 34, fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <Icon style={{ width: 15, height: 15, flexShrink: 0, color: SUBINK }} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderTop: `1px solid ${HAIRLINE}` }}>
            <span style={{ fontSize: 13, color: INK }}>Appearance</span>
            <div role="radiogroup" aria-label="Appearance" style={{ display: 'flex', border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: 2 }}>
              {(['Light', 'Dark', 'System'] as Appearance[]).map((m) => {
                const active = m === appearance;
                return (
                  <button key={m} type="button" role="radio" aria-checked={active} onClick={() => setAppearance(m)} data-testid={`appearance-${m.toLowerCase()}`} style={{ padding: '3px 9px', borderRadius: 0, fontSize: 11.5, fontWeight: active ? 600 : 500, cursor: 'pointer', background: active ? CARD_RAISED : 'transparent', border: active ? `1px solid ${HAIRLINE}` : '1px solid transparent', color: active ? INK : SUBINK, fontFamily: 'inherit' }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: '4px 0', borderTop: `1px solid ${HAIRLINE}` }}>
            <button type="button" data-testid="menu-item-sign-out" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 34, fontSize: 13, color: INK, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <LogOut style={{ width: 15, height: 15, flexShrink: 0, color: SUBINK }} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MrpSiteHeader() {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: CANVAS }}>
      {/* Poppins rides with the header — the real MRP face. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
      `}</style>
      {/* Signed-in header — artist brand left; quiet Feedback + avatar right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 56, padding: '0 20px 0 12px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
           <img src={mrpLogoAsset} alt="Memphis Record Pressing" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }} />
           <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', color: INK }}>Memphis Record Pressing</span>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="button-feedback" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 0, background: 'transparent', border: 'none', color: SUBINK, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <MessageSquarePlus style={{ width: 14, height: 14 }} />
          Feedback
        </button>
        <AccountMenu />
      </div>
    </div>
  );
}

const MRP_FOOTER_COLS: { head: string; rows: string[] }[] = [
  { head: 'Most used links', rows: ['Vinyl Records', 'Deluxe Vinyl Packaging', 'Short-Run Record Pressing', 'Forms & Templates', 'Audio File Prep', 'Art File Prep'] },
  { head: 'Contact us', rows: ['Phone: (901) 821-9099', 'Email: help@memphisvinyl.com', 'Careers'] },
  { head: 'Privacy & security', rows: ['Privacy Notice'] },
  { head: 'Locations', rows: ['Pressing & Customer Service: 3015 Brother Blvd, Bartlett, TN 38133', 'Packaging & Shipping: 7625 Appling Center Dr #103, Memphis, TN 38133'] },
];

// Inside the app the footer reduces to just the black bar — Memphis and us.
// The full column footer belongs to the site/login only (Bill, Aug 21 2026).
function MrpSiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer style={{ background: '#111112', color: '#f5f5f7', padding: compact ? '18px 26px' : '44px 26px 36px' }}>
      {!compact && (
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 30 }}>
        {MRP_FOOTER_COLS.map((c) => (
          <div key={c.head}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>{c.head}</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {c.rows.map((r) => (
                <div key={r} style={{ fontSize: 12.5, color: 'rgba(245,245,247,0.75)', lineHeight: 1.55 }}>{r}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
      <div style={{ maxWidth: 1080, margin: compact ? '0 auto' : '34px auto 0', paddingTop: compact ? 0 : 18, borderTop: compact ? 'none' : '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'rgba(245,245,247,0.55)' }}>
        {/* brightness(0) first forces true white — plain invert leaves a
            non-brand tint on non-pure-black pixels (Bill caught it twice). */}
        <img src={mrpLogoAsset} alt="" aria-hidden style={{ width: 26, height: 26, filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        Memphis Record Pressing · memphisvinyl.com
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(245,245,247,0.55)' }}>
          Powered by
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        </span>
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
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 14px', fontSize: 13, fontWeight: 500, color: INK, background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text below — always visible */}
      <div style={{ marginTop: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

export default function ArtistProjectHomeMRP() {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const font = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>

      {/* ── MRP's own site header wears the portal ── */}
      <MrpSiteHeader />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Left rail — artist nav canon, Team pinned at the bottom ── */}
        <nav style={{ width: 218, flexShrink: 0, background: CANVAS, borderRight: `1px solid ${GOLD}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              placeholder="Search"
              data-testid="input-rail-search"
              style={{ width: '100%', height: 34, borderRadius: 0, padding: '0 44px 0 12px', fontSize: 12.5, background: CARD_RAISED, border: `1px solid ${HAIRLINE}`, color: INK, outline: 'none' }}
            />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 600, color: SUBINK, background: CANVAS, border: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '2px 5px' }}>
              &#8984;K
            </span>
          </div>
          {RAIL_ITEMS.map((r) => <RailRow key={r} name={r} active={r === 'Releases'} />)}
          <div style={{ borderTop: `1px solid ${GOLD}`, margin: '8px 12px 6px' }} />
          <RailRow name="Team" active={false} />
        </nav>

        {/* ── Main — the project home, lockstep with the original ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 920, margin: '0 auto', padding: '30px 28px 60px' }}>

            {/* Breadcrumb — uppercase 11px, configurator style */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: SUBINK }}>
              <a href="#" onClick={(e) => e.preventDefault()} style={{ color: SUBINK, textDecoration: 'none' }}>
                Releases
              </a>
              <span aria-hidden style={{ color: 'rgba(0,0,0,0.25)' }}>&rsaquo;</span>
              <span style={{ color: INK }}>{MOCK_PROJECT}</span>
            </div>

            {/* Heading — Apple grammar: lead bold, rest quiet */}
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, margin: '12px 0 0' }} data-testid="heading-project-home">
              {MOCK_PROJECT}. <span style={{ color: SUBINK, fontWeight: 500 }}>Your project home.</span>
            </h1>
            <p style={{ fontSize: 13, color: SUBINK, margin: '6px 0 0' }}>
              Running with Memphis Record Pressing via memphisrecordpressing.com — {MOCK_QTY} at {MOCK_UNIT} · {MOCK_TOTAL} · Estimate <span style={{ fontWeight: 600, color: INK }}>{MOCK_ESTIMATE_NO}</span>
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
                    style={{
                      padding: '7px 14px', borderRadius: 0, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      background: archivedOpen ? CARD_RAISED : 'transparent',
                      border: `1px solid ${archivedOpen ? 'rgba(0,0,0,0.28)' : HAIRLINE}`,
                      color: archivedOpen ? INK : SUBINK,
                    }}
                  >
                    Archived ({MOCK_ARCHIVED.length})
                  </button>
                  {/* The page's ONE filled gold — dark ink on gold, never white. */}
                  <button
                    type="button"
                    data-testid="button-new-album"
                    style={{ padding: '8px 18px', borderRadius: 0, border: 'none', cursor: 'pointer', background: GOLD, color: INK, fontSize: 12.5, fontWeight: 700 }}
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

      <MrpSiteFooter compact />
    </div>
  );
}
