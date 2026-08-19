// PressEstimateSend — the press-side delivery loop for an estimate, three
// stitched panes (Apple walk style): 1) Brandon sends it from the builder —
// an ARTIST must be associated (Bill: it populates the system and makes it
// personal), 2) the one-line email the recipient gets, 3) the received
// estimate page (PressClientEstimate) — link, not login.
//
// Canon: quiet dark-gray-outline pills for page actions; filled #319ED8
// blue only for earned confirms (Send earns it when a valid email exists);
// word + icon statuses; real ®; "estimate" never "quote"; commas in
// dollar amounts. Light + dark themes (dark default). Self-contained,
// MOCK_ consts per handoff rules.

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Mail, Search, UserRound } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Themes ──────────────────────────────────────────────────────────
type Theme = typeof DARK;
const BLUE = '#319ED8';

const DARK = {
  dark: true,
  canvas: '#161617',
  card: '#1e1e20',
  cardSoft: '#26262a',
  ink: '#f5f5f7',
  subink: '#98989d',
  faint: '#6e6e73',
  hairline: 'rgba(255,255,255,0.10)',
  outline: 'rgba(255,255,255,0.28)',
  pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
  logoFilter: 'brightness(0) invert(1)',
};
const LIGHT: Theme = {
  dark: false,
  canvas: '#f5f5f7',
  card: '#ffffff',
  cardSoft: '#f0f0f2',
  ink: '#1d1d1f',
  subink: '#6e6e73',
  faint: '#a1a1a6',
  hairline: 'rgba(0,0,0,0.10)',
  outline: '#6e6e73',
  pillShadow: '0 1px 2px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)',
  logoFilter: 'none',
};

// ─── Mock data ───────────────────────────────────────────────────────
const MOCK_ESTIMATE = { no: '071526-02', job: 'Californialand', spec: '12" · 140g · Ruby translucent · 1 LP', total: '$8,375.00' };
const MOCK_SENDER = { name: 'Brandon Seavers', first: 'Brandon', press: 'Memphis Record Pressing' };

type MockArtist = { id: string; name: string; email: string; note: string };
const MOCK_ARTISTS: MockArtist[] = [
  { id: 'niina', name: 'Niina Soleil', email: 'niina@soleilmusic.com', note: 'Client since 2025' },
  { id: 'alma', name: 'Alma Rivera', email: 'alma@almarivera.com', note: 'Client since 2024' },
  { id: 'ezra', name: 'Ezra Vane', email: 'ezra@vanerecords.co', note: 'New — from Spotify import' },
  { id: 'sun', name: 'Sun Parade', email: 'hello@sunparade.band', note: 'Client since 2023' },
];

const EMAIL_OK = (v: string) => /.+@.+\..+/.test(v.trim());

// ─── Small pieces ────────────────────────────────────────────────────
function PaneLabel({ n, title, sub, t }: { n: number; title: string; sub: string; t: Theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span className="inline-flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 24, height: 24, fontSize: 12, fontWeight: 700, border: `1px solid ${t.hairline}`, color: t.subink, transform: 'translateY(4px)' }}>{n}</span>
      <div>
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3, color: t.ink }}>{title}</div>
        <div style={{ fontSize: 13, color: t.subink, marginTop: 3, maxWidth: 560, lineHeight: 1.6 }}>{sub}</div>
      </div>
    </div>
  );
}

function Field({ t, value, onChange, placeholder, type = 'text', testid }: { t: Theme; value: string; onChange: (v: string) => void; placeholder: string; type?: string; testid: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="focus:outline-none w-full"
      style={{ height: 38, borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: t.canvas, border: `1px solid ${t.hairline}`, color: t.ink }}
      data-testid={testid}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════
export default function PressEstimateSend() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = mode === 'dark' ? DARK : LIGHT;

  // Pane 1 state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState<MockArtist | null>(null);
  const [artistName, setArtistName] = useState('');
  const [artistEmail, setArtistEmail] = useState('');
  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [sent, setSent] = useState(false);

  const results = useMemo(
    () => MOCK_ARTISTS.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );
  // Send earns its blue: artist associated AND at least one valid email.
  const earned = artist !== null && (EMAIL_OK(artistEmail) || EMAIL_OK(mgrEmail));

  const pickArtist = (a: MockArtist) => {
    setArtist(a);
    setArtistName(a.name);
    setArtistEmail(a.email);
    setPickerOpen(false);
    setQuery('');
  };

  return (
    <div className="min-h-[100dvh] w-full font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      {/* MOCK-ONLY theme pill */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        className="fixed bottom-4 right-4 z-50 h-8 px-3.5 rounded-full text-[12px] font-medium"
        style={{ backgroundColor: t.card, color: t.subink, border: `1px solid ${t.hairline}`, boxShadow: t.pillShadow }}
        data-testid="button-theme-toggle"
      >
        {mode === 'dark' ? 'View light' : 'View dark'}
      </button>

      <div className="mx-auto w-full" style={{ maxWidth: 860, padding: '56px 32px 120px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: t.faint }}>
          {MOCK_SENDER.press} · Estimate {MOCK_ESTIMATE.no}
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1, marginTop: 8 }}>
          <span style={{ color: t.ink }}>Send the estimate. </span>
          <span style={{ color: t.faint }}>Link, not login.</span>
        </h1>
        <p style={{ fontSize: 14.5, color: t.subink, marginTop: 10, maxWidth: 580, lineHeight: 1.6 }}>
          The delivery loop for {MOCK_ESTIMATE.job}: {MOCK_SENDER.first} sends it, the artist gets one
          quiet email, and the estimate opens with no account — login only appears when they start the project.
        </p>

        {/* ══ Pane 1 — Send ══ */}
        <section style={{ marginTop: 56 }}>
          <PaneLabel
            n={1}
            title="Send"
            sub={`From ${MOCK_SENDER.first}'s builder. Associating an artist is required — it populates the system and makes the estimate personal.`}
            t={t}
          />
          <div style={{ marginTop: 20, borderRadius: 18, border: `1px solid ${t.hairline}`, background: t.card, padding: 26 }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '18px 0' }}>
                <span className="inline-flex items-center justify-center rounded-full" style={{ width: 40, height: 40, border: `1px solid ${t.hairline}` }}>
                  <Check className="w-5 h-5" style={{ color: t.ink }} />
                </span>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>Estimate sent</div>
                <div style={{ fontSize: 12.5, color: t.subink, marginTop: 4 }}>
                  {[EMAIL_OK(artistEmail) && (artistName.trim() || artistEmail), EMAIL_OK(mgrEmail) && (mgrName.trim() || mgrEmail)]
                    .filter(Boolean)
                    .join(' and ')}{' '}
                  got a private link.
                </div>
              </div>
            ) : (
              <>
                {/* Artist association — required, searchable */}
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: t.faint }}>Artist · required</div>
                <div style={{ position: 'relative', marginTop: 10, maxWidth: 380 }}>
                  <button
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    aria-expanded={pickerOpen}
                    className="w-full flex items-center gap-2.5 focus:outline-none"
                    style={{ height: 40, borderRadius: 10, padding: '0 12px', fontSize: 13.5, background: t.canvas, border: `1px solid ${t.hairline}`, color: artist ? t.ink : t.faint, cursor: 'pointer' }}
                    data-testid="button-artist-picker"
                  >
                    <UserRound className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                    <span className="flex-1 truncate text-left">{artist ? artist.name : 'Choose an artist…'}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: t.faint, transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  {pickerOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 20, borderRadius: 14, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 16px 48px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                      <div style={{ position: 'relative', padding: 8, borderBottom: `1px solid ${t.hairline}` }}>
                        <Search className="w-3.5 h-3.5" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: t.faint }} />
                        <input
                          autoFocus
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search artists…"
                          className="w-full focus:outline-none"
                          style={{ height: 32, borderRadius: 8, padding: '0 10px 0 30px', fontSize: 13, background: t.canvas, border: `1px solid ${t.hairline}`, color: t.ink }}
                          data-testid="input-artist-search"
                        />
                      </div>
                      {results.length === 0 && (
                        <div style={{ padding: '14px 14px', fontSize: 12.5, color: t.faint }}>No artists match.</div>
                      )}
                      {results.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => pickArtist(a)}
                          className="w-full flex items-center gap-2.5 text-left"
                          style={{ padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                          data-testid={`option-artist-${a.id}`}
                        >
                          <span className="flex-1 min-w-0">
                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: t.ink }}>{a.name}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: t.faint }}>{a.note}</span>
                          </span>
                          {artist?.id === a.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: t.ink }} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recipients */}
                <div style={{ marginTop: 24, display: 'grid', gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: t.faint, marginBottom: 8 }}>Artist recipient</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
                      <Field t={t} value={artistName} onChange={setArtistName} placeholder="Name" testid="input-artist-name" />
                      <Field t={t} value={artistEmail} onChange={setArtistEmail} placeholder="Email" type="email" testid="input-artist-email" />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: t.faint, marginBottom: 8 }}>Manager · optional</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
                      <Field t={t} value={mgrName} onChange={setMgrName} placeholder="Name" testid="input-manager-name" />
                      <Field t={t} value={mgrEmail} onChange={setMgrEmail} placeholder="Email" type="email" testid="input-manager-email" />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12.5, color: t.faint }}>They&rsquo;ll get a private link — no login needed.</div>
                  {/* Earned blue: artist associated + at least one valid email. */}
                  <button
                    type="button"
                    disabled={!earned}
                    onClick={() => { if (earned) setSent(true); }}
                    className="rounded-full transition-colors"
                    style={{
                      padding: '10px 24px', fontSize: 13.5, fontWeight: 600,
                      cursor: earned ? 'pointer' : 'not-allowed',
                      background: earned ? BLUE : 'transparent',
                      border: earned ? '1px solid transparent' : `1px solid ${t.hairline}`,
                      color: earned ? '#ffffff' : t.subink,
                    }}
                    data-testid="button-send-estimate"
                  >
                    Send estimate
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ══ Pane 2 — The email ══ */}
        <section style={{ marginTop: 56 }}>
          <PaneLabel n={2} title="The email" sub="One line, one button. Nothing to learn, nothing to sign up for." t={t} />
          <div style={{ marginTop: 20, borderRadius: 18, border: `1px solid ${t.hairline}`, background: t.card, padding: '40px 32px', textAlign: 'center' }} data-testid="pane-email-preview">
            <img src={mrpLogo} alt={MOCK_SENDER.press} style={{ width: 44, height: 44, margin: '0 auto', filter: t.logoFilter }} />
            <p style={{ fontSize: 15, color: t.ink, margin: '18px auto 0', maxWidth: 400, lineHeight: 1.6 }}>
              {MOCK_SENDER.first} at {MOCK_SENDER.press} sent you an estimate for <strong>{MOCK_ESTIMATE.job}</strong>.
            </p>
            {/* The email's single button — the private link itself. */}
            <a
              href="#/PressClientEstimate"
              className="inline-flex items-center gap-2 rounded-full"
              style={{ marginTop: 20, padding: '11px 26px', fontSize: 14, fontWeight: 600, background: BLUE, color: '#ffffff', textDecoration: 'none' }}
              data-testid="button-view-estimate"
            >
              View estimate
            </a>
            <div style={{ marginTop: 18, fontSize: 11.5, color: t.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Mail className="w-3.5 h-3.5" aria-hidden />
              Private link · no account needed
            </div>
          </div>
        </section>

        {/* ══ Pane 3 — Received ══ */}
        <section style={{ marginTop: 56 }}>
          <PaneLabel
            n={3}
            title="Received"
            sub="The link opens the estimate page directly — no login wall. Account creation first appears when they press &ldquo;Start this project.&rdquo;"
            t={t}
          />
          <a
            href="#/PressClientEstimate"
            className="block transition-transform hover:-translate-y-0.5"
            style={{ marginTop: 20, borderRadius: 18, border: `1px solid ${t.hairline}`, background: '#111112', padding: 26, textDecoration: 'none', color: '#f5f5f7' }}
            data-testid="pane-received-thumb"
          >
            {/* Miniature framing of PressClientEstimate — the destination. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={californialandCover} alt="" aria-hidden style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#a1a1a6' }}>Prepared for</div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2, marginTop: 2 }}>Niina Soleil</div>
                <div style={{ fontSize: 12, color: '#a1a1a6', marginTop: 2 }}>{MOCK_ESTIMATE.job} — {MOCK_ESTIMATE.spec}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: BLUE }}>Estimate total</div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{MOCK_ESTIMATE.total}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#a1a1a6' }}>Opens with the private link — the full page, live quantity tiers and all.</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#f5f5f7' }}>Open PressClientEstimate →</span>
            </div>
          </a>
          <p style={{ marginTop: 12, fontSize: 12, color: t.faint, lineHeight: 1.6, maxWidth: 620 }}>
            Link, not login: the estimate is readable with zero friction. &ldquo;Start this project&rdquo; is the
            first moment an account exists — its confirm sheet flows straight into &ldquo;Create your account,&rdquo;
            pre-filled with the recipient&rsquo;s name and email.
          </p>
        </section>
      </div>
    </div>
  );
}
