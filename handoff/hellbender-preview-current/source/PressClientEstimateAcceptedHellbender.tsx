// CORNER RULING (Bill, Aug 22 2026, stylesheet-first from hellbendervinyl.com):
// buttons are fully-rounded PILLS (--buttons-radius 40px) with white text;
// inputs are nearly square (2px); cards/media/popups stay square (0); status/
// variant pills are rounded (40px). Only true circles (avatars, status dots,
// the frosted x) stay fully round.
// PressClientEstimateAcceptedMRP — the confirmation moment right after
// How??? clicks the red "Start this project" button on her Hellbender estimate
// (PressClientEstimateHellbender). Connective tissue between the estimate and
// PressClientNextStepsHellbender: same white Hellbender skin, same estimate numbers,
// pointing her toward signing in at hellbender.makesvinyl.com.
// Canon honored here:
// - Estimate-not-quote: accepting starts the project; it is not a binding
//   quote. The copy says so plainly, without being timid.
// - ONE filled red action on the page: "Sign in at hellbender.makesvinyl.com".
//   The confirmation-email preview below is a mock artifact — its red
//   button is inside the rendered email, not a second page action.
// - Every status = word + icon, never color alone (Bill is colorblind).
// - Red #DF0C15 filled actions always carry WHITE ink (their site --color-button-text).
// - Chivo throughout (their real stylesheet — Bill, Aug 21 2026).
// Self-contained per handoff rules — MOCK_ constants only, no imports
// from other mockups. Numbers match PressClientEstimateHellbender at the
// 1,000-unit tier and PressClientNextStepsHellbender's deposit math.

import howAlbumCover from '../assets/how-album-cover.jpg';
import hellbenderLogo from '../assets/hellbender-full.svg';
import travisPhoto from '../assets/travis-whitlock.webp';
import goodtunesLogo from '../assets/goodtunes-logo.png';

// ─── Mock data — the same estimate the page she just accepted ─────────
const MOCK_CLIENT_FIRST = 'Alex';
const MOCK_CLIENT_FULL = 'Alex Tebeleff';
const MOCK_CLIENT_EMAIL = 'alex@howband.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_ACCEPTED_DATE = 'August 24, 2026';
const MOCK_PREPARED_BY = 'Travis Whitlock';
const MOCK_PRESS = 'Hellbender Vinyl';
const MOCK_PRESS_EMAIL = 'travis@hellbendervinyl.com';
const MOCK_JOB = 'How???';
const MOCK_SPEC = '12" · 140g · Emerald translucent · 1 LP';
const MOCK_QTY = '1,000 units';
const MOCK_UNIT = '$5.37 /unit';
const MOCK_RUN = '$5,370.00';
const MOCK_SETUP = '$1,295.00';
const MOCK_TOTAL = '$6,665.00';
const MOCK_DEPOSIT = '$3,332.50'; // 50% of the working total
const MOCK_PORTAL = 'hellbender.makesvinyl.com';

// ─── Palette — Hellbender light canon (twin of the estimate page) ───────────
const CANVAS = '#ffffff'; // Hellbender pages are pure white (Andrew, Aug 21 2026)
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#DF0C15'; // Hellbender's site red (Andrew, Aug 21 2026)
const GOLD_TINT_TOP = 'rgba(223,12,21,0.10)';

// ─── Status grammar — word + icon, never color alone ─────────────────
function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
      <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={SUBINK} strokeWidth="2" aria-hidden>
      <rect x="2" y="4.5" width="20" height="15" rx="2" />
      <path d="M2.5 6.5L12 13l9.5-6.5" />
    </svg>
  );
}

function InsetRule() {
  return <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />;
}

// ─── Hellbender site chrome — copied from the reference Hellbender mocks (verbatim
// structure; nav is decorative site chrome). Post-acceptance, she's not
// signed in yet, so the header shows the account-less state without the
// red "GET AN ESTIMATE" rectangle competing with the page's one action. ──
const MRP_NAV = ['Home', 'About', 'Products', 'Resources', 'Videos', 'Learn', 'News', 'Shop', 'Contact'];

function MrpSiteHeader() {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#ffffff' }}>
      {/* Utility bar — 40px row, 12px / 400 / 0.07em, #333 ink (their stylesheet) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 40, padding: '0 26px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 12, fontWeight: 400, letterSpacing: '0.07em', color: '#333333' }}>
        <span>Let&rsquo;s talk about your project</span>
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: HAIRLINE }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#333333' }}>
          <MailIcon />
          help@hellbendervinyl.com
        </span>
        <span style={{ flex: 1 }} />
      </div>
      {/* Chivo rides with the header so the whole page gets the real Hellbender face. */}
      <style>{`
        .mrp-nav-link { position: relative; transition: color 0.2s ease; }
        .mrp-nav-link::after {
          content: ''; position: absolute; left: 0; right: 0; bottom: -6px; height: 2px;
          background: ${GOLD}; transform: scaleX(0); transform-origin: left center;
          transition: transform 0.25s ease;
        }
        .mrp-nav-link:hover { color: #111111; }
        .mrp-nav-link:hover::after { transform: scaleX(1); }
      `}</style>
      {/* Main nav — logo left, links centered: 12px / 600 / 0.05em uppercase,
          resting ink rgba(51,51,51,0.5) (their stylesheet). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 34, height: 80, padding: '0 26px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <img src={hellbenderLogo} alt="Hellbender Vinyl" style={{ width: 60, height: 60 }} />
        <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {MRP_NAV.map((l) => (
            <a
              key={l}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="mrp-nav-link"
              style={{ color: 'rgba(51,51,51,0.5)', textDecoration: 'none' }}
            >
              {l}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

const MRP_FOOTER_COLS: { head: string; rows: string[] }[] = [
  { head: 'Most used links', rows: ['Vinyl Records', 'Deluxe Vinyl Packaging', 'Short-Run Record Pressing', 'Forms & Templates', 'Audio File Prep', 'Art File Prep'] },
  { head: 'Contact us', rows: ['Phone: (412) 224-2000', 'Email: help@hellbendervinyl.com', 'Careers'] },
  { head: 'Privacy & security', rows: ['Privacy Notice'] },
  { head: 'Locations', rows: ['Pressing & Customer Service: 5794 Butler Street, Pittsburgh, PA 15201', 'Packaging & Shipping: 5794 Butler Street, Pittsburgh, PA 15201'] },
];

// Inside the app the footer reduces to just the black bar — Hellbender and us.
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
        <img src={hellbenderLogo} alt="" aria-hidden style={{ width: 26, height: 26, filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        Hellbender Vinyl · hellbendervinyl.com
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(245,245,247,0.55)' }}>
          Powered by
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
        </span>
      </div>
    </footer>
  );
}

export default function PressClientEstimateAcceptedHellbender() {
  /* Their real stylesheet is Chivo throughout (Bill, Aug 21 2026). */
  const font = "'Chivo', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const firstName = MOCK_PREPARED_BY.split(' ')[0];

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 24px 72px' }}>

          {/* ── The moment — short, warm, confident ── */}
          <section style={{ textAlign: 'center', paddingTop: 52 }}>
            {/* Word + icon, never color alone */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', borderRadius: 40, border: `1px solid rgba(0,0,0,0.28)`, background: GOLD_TINT_TOP, fontSize: 11.5, fontWeight: 600 }} data-testid="pill-project-started">
              <CheckIcon />
              Project started
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.8, margin: '16px 0 0', lineHeight: 1.15 }}>
              {MOCK_JOB} is a go, {MOCK_CLIENT_FIRST}.
            </h1>
            <p style={{ fontSize: 15, color: SUBINK, margin: '12px 0 0', lineHeight: 1.65 }}>
              {firstName} has your project at {MOCK_PRESS}. Estimate {MOCK_ESTIMATE_NO} is now your
              working numbers — an estimate, not a binding commitment, so nothing is owed until you approve
              the details together.
            </p>
          </section>

          {/* ── The estimate, carried forward — same numbers, at rest ── */}
          <section style={{ marginTop: 32, border: `1px solid ${HAIRLINE}`, background: CARD, boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }} data-testid="accepted-project-card">
            <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={howAlbumCover} alt={`${MOCK_JOB} cover art`} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{MOCK_JOB}</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>{MOCK_SPEC}</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>
                  Estimate <span style={{ fontWeight: 600, color: INK }}>{MOCK_ESTIMATE_NO}</span> · Accepted {MOCK_ACCEPTED_DATE}
                </div>
              </div>
            </div>
            <InsetRule />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px' }}>
              <div style={{ fontSize: 13, color: SUBINK }}>Run</div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{MOCK_QTY} · {MOCK_UNIT} · {MOCK_RUN}</div>
            </div>
            <InsetRule />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px' }}>
              <div style={{ fontSize: 13, color: SUBINK }}>Setup · one-time</div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{MOCK_SETUP}</div>
            </div>
            <div style={{ padding: '16px 18px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>Working total</div>
                <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>May shift with final order specifications</div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{MOCK_TOTAL}</div>
            </div>
          </section>

          {/* ── What just happened / what's next — word + icon each ── */}
          <section style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, background: CARD }} data-testid="accepted-next-list">
            <div style={{ padding: '15px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ paddingTop: 2 }}><CheckIcon /></span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Done — your account was created</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3, lineHeight: 1.6 }}>
                  It uses {MOCK_CLIENT_EMAIL} and the password you just set. {firstName} has been notified.
                </div>
              </div>
            </div>
            <InsetRule />
            <div style={{ padding: '15px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ paddingTop: 2 }}><MailIcon /></span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Sent — a confirmation email is on its way</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3, lineHeight: 1.6 }}>
                  A copy of these numbers and your sign-in link, so this page never has to stay open.
                </div>
              </div>
            </div>
            <InsetRule />
            <div style={{ padding: '15px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', background: CARD_RAISED }}>
              <span style={{ paddingTop: 2 }}><NextIcon /></span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Up next — sign in and upload audio &amp; artwork</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3, lineHeight: 1.6 }}>
                  Your project home is {MOCK_PORTAL}. Files come first; the 50% deposit ({MOCK_DEPOSIT})
                  is only asked for once your test pressing is approved and the run is scheduled.
                </div>
              </div>
            </div>
          </section>

          {/* ── THE action — one filled red button, right-aligned (canon) ── */}
          <section style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22 }}>
            <button
              type="button"
              onClick={() => { window.location.hash = '#/PressClientEstimateHellbender'; }}
              data-testid="accepted-view-estimate"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: SUBINK }}
            >
              View your estimate
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { window.location.hash = '#/PressClientNextStepsHellbender'; }}
                data-testid="accepted-sign-in"
                style={{ minHeight: 45, padding: '0 30px', borderRadius: 40, border: 'none', cursor: 'pointer', background: GOLD, color: '#ffffff', fontSize: 15, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}
              >
                Sign in at {MOCK_PORTAL}
              </button>
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 10, textAlign: 'center', fontSize: 11.5, color: 'rgba(0,0,0,0.38)', whiteSpace: 'nowrap' }}>
                {MOCK_CLIENT_EMAIL}
              </div>
            </div>
          </section>
          <div style={{ height: 26 }} aria-hidden />

          {/* ── Travis — the human on the other end ── */}
          <section style={{ marginTop: 22, border: `1px solid ${HAIRLINE}`, background: CARD_RAISED, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 46, height: 46, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
              <img src={travisPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{MOCK_PREPARED_BY} is your contact for this run.</div>
              <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>Replies within 1 business day · {MOCK_PRESS}</div>
            </div>
          </section>

          {/* ── The confirmation email, as her inbox will show it ── */}
          <section style={{ marginTop: 44 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: SUBINK, textAlign: 'center' }}>
              The email {MOCK_CLIENT_FIRST} receives
            </div>

            <div style={{ marginTop: 14, background: '#eceae3', padding: '22px 16px 26px' }}>
              {/* Inbox chrome (mock-only) — sender identity and subject */}
              <div style={{ maxWidth: 560, margin: '0 auto 12px', padding: '13px 16px', background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="email-chrome">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }} aria-hidden>
                    <img src={travisPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {MOCK_PREPARED_BY} <span style={{ color: SUBINK, fontWeight: 400 }}>&lt;{MOCK_PRESS_EMAIL}&gt; · via GoodTunes®</span>
                    </div>
                    <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>To: {MOCK_CLIENT_FULL} &lt;{MOCK_CLIENT_EMAIL}&gt;</div>
                  </div>
                </div>
                <div style={{ marginTop: 9, fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>
                  {MOCK_JOB} is underway at {MOCK_PRESS}
                </div>
                <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>
                  Estimate {MOCK_ESTIMATE_NO} accepted · {MOCK_QTY} · {MOCK_TOTAL} working total — sign in to upload your files.
                </div>
              </div>

              {/* Email body — 600px pattern, single column, static */}
              <div style={{ maxWidth: 560, margin: '0 auto', background: CANVAS, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }} data-testid="email-body">
                <div style={{ padding: '30px 30px 34px' }}>
                  <img src={hellbenderLogo} alt={MOCK_PRESS} style={{ width: 40, height: 40 }} />
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, marginTop: 16 }}>
                    You started something, {MOCK_CLIENT_FIRST}.
                  </div>
                  <p style={{ fontSize: 13, color: SUBINK, margin: '10px 0 0', lineHeight: 1.65 }}>
                    {MOCK_JOB} is now a live project at {MOCK_PRESS}, with estimate {MOCK_ESTIMATE_NO} as
                    your working numbers. It stays an estimate — not a binding commitment — until you and{' '}
                    {firstName} finalize the order together. Nothing is billed yet.
                  </p>

                  {/* The numbers, at rest */}
                  <div style={{ marginTop: 20, border: `1px solid ${HAIRLINE}` }}>
                    <div style={{ padding: '11px 14px', background: CARD_RAISED, display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{MOCK_JOB}</div>
                      <div style={{ fontSize: 12, color: SUBINK }}>{MOCK_SPEC}</div>
                    </div>
                    <div style={{ padding: '9px 14px', borderTop: `1px solid ${HAIRLINE}`, display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, color: SUBINK }}>Run</div>
                      <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{MOCK_QTY} · {MOCK_UNIT} · {MOCK_RUN}</div>
                    </div>
                    <div style={{ padding: '9px 14px', borderTop: `1px solid ${HAIRLINE}`, display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, color: SUBINK }}>Setup · one-time</div>
                      <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{MOCK_SETUP}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>Working total</div>
                      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>{MOCK_TOTAL}</div>
                    </div>
                  </div>

                  {/* One filled red action inside the email (email's own canon) */}
                  <div style={{ marginTop: 22, textAlign: 'center' }}>
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      data-testid="email-sign-in"
                      style={{ display: 'inline-block', padding: '13px 30px', borderRadius: 40, background: GOLD, color: '#ffffff', fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', textDecoration: 'none' }}
                    >
                      Sign in at {MOCK_PORTAL}
                    </a>
                    <div style={{ marginTop: 9, fontSize: 11.5, color: SUBINK }}>
                      Your account is {MOCK_CLIENT_EMAIL} — next step is uploading audio &amp; artwork.
                    </div>
                  </div>

                  {/* Reply channel */}
                  <div style={{ marginTop: 24, padding: '12px 14px', border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                      <img src={travisPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </span>
                    <div style={{ fontSize: 12, color: SUBINK, lineHeight: 1.55 }}>
                      <span style={{ color: INK, fontWeight: 600 }}>Questions? Just reply.</span>{' '}
                      Replies go straight to {firstName} at {MOCK_PRESS}.
                    </div>
                  </div>
                </div>

                {/* Email footer — press letterhead + honest terms */}
                <div style={{ padding: '20px 30px 26px', borderTop: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{MOCK_PRESS}</div>
                  <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 2 }}>5794 Butler Street · Pittsburgh, PA · hellbendervinyl.com</div>
                  <div style={{ fontSize: 10.5, color: SUBINK, lineHeight: 1.7, marginTop: 12 }}>
                    <p style={{ margin: 0 }}>All orders are subject to +/- 10% and billed accordingly.</p>
                    <p style={{ margin: '2px 0 0' }}>Listed prices may change per final order specifications.</p>
                  </div>
                  <div style={{ fontSize: 10, color: SUBINK, marginTop: 12, opacity: 0.8 }}>
                    Sent by GoodTunes® on behalf of {MOCK_PRESS} · Sent to {MOCK_CLIENT_EMAIL} because you started a project.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <MrpSiteFooter compact />
    </div>
  );
}
