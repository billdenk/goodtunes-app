// CORNER RULING (Bill, Aug 22 2026, stylesheet-first from hellbendervinyl.com):
// buttons are fully-rounded PILLS (--buttons-radius 40px) with white text;
// inputs are nearly square (2px); cards/media/popups stay square (0); status/
// variant pills are rounded (40px). Only true circles (avatars, status dots,
// the frosted x) stay fully round.
// PressClientEstimateEmailMRP — the WHITE-LABEL (Hellbender Vinyl)
// flavor of the estimate email. Bill's ask (Aug 21 2026): keep the dark email
// exactly, but match Hellbender's look and feel (hellbendervinyl.com — red
// accent, black/white identity). Only the accent system changes: red
// #DF0C15 (their site's red — Andrew, Aug 21 2026) replaces GoodTunes blue, and
// buttons carry dark ink on red like Hellbender's own "GET A QUOTE" button.
// Companion to PressClientEstimateEmail (the GoodTunes-branded flavor).
//
// Email rules honored in the design (this mock renders the email as the
// client's inbox would):
// - 600px single column, static — no hover spin, no expanders, no live
//   quantity tiers. Anything interactive lives behind the one blue button.
// - Fully-expanded numbers: an email can't collapse, so the per-record
//   lines, setup lines, run and total are all visible at rest.
// - ONE filled-blue action (canon): "Open your estimate". Everything else
//   is quiet text — including the GoodTunes hook line (static color accent,
//   no animation; email clients strip keyframes anyway).
// - Private-link model: the email says no account is needed, matching the
//   page's link-not-login rule.
// - Quiet inbox chrome (From / To / Subject) frames the mock so Bill sees
//   the sender identity and subject line too — chrome is mock-only.
//
// Self-contained per handoff rules. Same MOCK_ data and numbers as
// PressClientEstimate at the 1,000-unit tier (the tier Travis prepared).

import howAlbumCover from '../assets/how-album-cover.jpg';
import hellbenderLogo from '../assets/hellbender-full.svg';
import hellbenderMark from '../assets/hellbender-mark.png';
import travisPhoto from '../assets/travis-whitlock.webp';

// ─── Mock data (same estimate as the live page) ──────────────────────
const MOCK_CLIENT_FIRST = 'Alex';
const MOCK_CLIENT_FULL = 'Alex Tebeleff';
const MOCK_CLIENT_EMAIL = 'alex@howband.com';
const MOCK_ESTIMATE_NO = '071526-02';
const MOCK_DATE = 'August 24, 2026';
const MOCK_VALID_UNTIL = 'September 23, 2026';
const MOCK_PREPARED_BY = 'Travis Whitlock';
const MOCK_PRESS = 'Hellbender Vinyl';
const MOCK_PRESS_EMAIL = 'travis@hellbendervinyl.com';
const MOCK_JOB = 'How???';
const MOCK_SPEC = '12" · 140g · Emerald translucent · 1 LP';
const MOCK_QTY = 1000; // the tier Travis prepared — email shows ONE quantity

// Per-unit line items at the prepared tier (same numbers as the page).
const UNIT_LINES = [
  { id: 'vinyl',    name: '12" LP · 140g color vinyl',   note: 'Translucent emerald, single LP',        amount: 2.30 },
  { id: 'labels',   name: 'Center labels · full color',  note: 'Printed before pressing',            amount: 0.25 },
  { id: 'sleeve',   name: 'Inner sleeve · full color',   note: '100# gloss text',                    amount: 0.81 },
  { id: 'jacket',   name: 'Single jacket · full color',  note: '20pt board, semi-gloss',             amount: 0.81 },
  { id: 'insert',   name: 'Insert · 12"×12" full color', note: '100# cover',                         amount: 0.67 },
  { id: 'assembly', name: 'Assembly',                    note: 'Insert placed on top before shrink', amount: 0.36 },
  { id: 'shrink',   name: 'Shrinkwrap',                  note: 'Retail-ready seal',                  amount: 0.17 },
];
const SETUP_LINES = [
  { id: 'cutting',  name: 'Lacquer cutting', amount: 650 },
  { id: 'plating',  name: 'Lacquer plating', amount: 375 },
  { id: 'test',     name: 'Test pressing',   amount: 175, note: 'Includes 2-day domestic shipping' },
  { id: 'stampers', name: 'Stampers',        amount: 0 },
  { id: 'color',    name: 'Color setup fee', amount: 95 },
];
const SETUP_TOTAL = SETUP_LINES.reduce((a, l) => a + l.amount, 0);
const UNIT_COST = UNIT_LINES.reduce((a, l) => a + l.amount, 0);
const SUBTOTAL = UNIT_COST * MOCK_QTY;
const TOTAL = SUBTOTAL + SETUP_TOTAL;

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const money2 = (n: number) => `$${n.toFixed(2)}`;

// ─── Palette (canon charcoal — matches the estimate page exactly) ────
const CANVAS = '#ffffff'; // Hellbender pages are pure white (Andrew, Aug 21 2026)
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#DF0C15'; // Hellbender white-label accent (same PRESS_ACCENT as the quote builder)
const GOLD_TINT_TOP = 'rgba(223,12,21,0.10)';

function Rule() {
  return <div aria-hidden style={{ height: 1, background: HAIRLINE }} />;
}

export default function PressClientEstimateEmailHellbender() {
  return (
    <div style={{ minHeight: '100vh', background: '#eceae3', color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif", padding: '40px 16px 80px' }}>

      {/* ── Inbox chrome (mock-only) — who it's from and the subject ── */}
      <div style={{ maxWidth: 600, margin: '0 auto 14px', padding: '14px 18px', borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="email-chrome">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }} aria-hidden>
            <img src={travisPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              {MOCK_PREPARED_BY} <span style={{ color: SUBINK, fontWeight: 400 }}>&lt;{MOCK_PRESS_EMAIL}&gt; · via GoodTunes®</span>
            </div>
            <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 2 }}>To: {MOCK_CLIENT_FULL} &lt;{MOCK_CLIENT_EMAIL}&gt;</div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 14.5, fontWeight: 700, letterSpacing: -0.2 }}>
          Your {MOCK_JOB} estimate from {MOCK_PRESS}
        </div>
        {/* Preheader — the gray preview line inbox lists show */}
        <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>
          {MOCK_SPEC} · {MOCK_QTY.toLocaleString()} units · {money(TOTAL)} — open to explore run sizes.
        </div>
      </div>

      {/* ── The email body — 600px, single column, static ── */}
      <div style={{ maxWidth: 600, margin: '0 auto', borderRadius: 0, overflow: 'hidden', background: CANVAS, border: `1px solid ${HAIRLINE}` }} data-testid="email-body">
        <div style={{ padding: '36px 36px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', marginBottom: 20, textAlign: 'center' }}>
            <img src={hellbenderLogo} alt="Hellbender Vinyl" style={{ display: 'block', width: 210, height: 82, objectFit: 'contain', objectPosition: 'center' }} />
          </div>

          {/* Estimate meta — top right, like the page */}
          <div style={{ textAlign: 'right', fontSize: 11.5, color: SUBINK, lineHeight: 1.7 }}>
            <div>Estimate <span style={{ color: INK, fontWeight: 600 }}>{MOCK_ESTIMATE_NO}</span></div>
            <div>{MOCK_DATE}</div>
            <div>Valid until <span style={{ color: INK }}>{MOCK_VALID_UNTIL}</span></div>
          </div>

          {/* Prepared for */}
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }} aria-hidden>
              <img src={howAlbumCover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: SUBINK }}>Prepared for</div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 }}>{MOCK_CLIENT_FULL}</div>
              <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 5 }}>
                {MOCK_JOB} — {MOCK_SPEC} · Prepared by {MOCK_PREPARED_BY}
              </div>
            </div>
          </div>

          {/* The record — static composition (no hover, no spin in email) */}
          <div style={{ marginTop: 30, display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 360, height: 232 }} aria-hidden data-testid="email-album-stage">
              <div style={{ position: 'absolute', left: 140, top: 6, width: 220, height: 220, borderRadius: '50%', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#20B957' }} />
                <img src="/__mockup/vinyl-layers/translucent-vinyl.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.52 }} />
                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '40%', height: '40%', borderRadius: '50%', overflow: 'hidden' }}>
                  <img src={hellbenderMark} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 6, height: 6, borderRadius: '50%', background: '#161617' }} />
                </div>
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundColor: '#ffffff', opacity: 0.72,
                  maskImage: 'url(/__mockup/vinyl-layers/vinyl-highlights.png)',
                  WebkitMaskImage: 'url(/__mockup/vinyl-layers/vinyl-highlights.png)',
                  maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
                  maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
                }} />
              </div>
              <img src={howAlbumCover} alt="" style={{ position: 'absolute', left: 0, top: 0, width: 226, height: 226, borderRadius: 0, objectFit: 'cover', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }} />
            </div>
          </div>

          {/* Totals card — everything expanded; an email can't collapse */}
          <div style={{ marginTop: 30, borderRadius: 0, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: CARD_RAISED, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Per record</div>
                <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 1 }}>This exact build, at {MOCK_QTY.toLocaleString()} units</div>
              </div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{money2(UNIT_COST)}</div>
            </div>
            {UNIT_LINES.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 16px 9px 28px', background: CARD, borderTop: `1px solid ${HAIRLINE}` }}>
                <div>
                  <div style={{ fontSize: 12, color: INK, fontWeight: 500 }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: SUBINK, marginTop: 1 }}>{l.note}</div>
                </div>
                <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {money2(l.amount)} <span style={{ color: SUBINK, fontSize: 10.5 }}>/unit</span>
                </div>
              </div>
            ))}
            <div style={{ padding: '10px 16px', background: CARD_RAISED, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Setup costs</div>
                <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 1 }}>One-time · same at any run size</div>
              </div>
              <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{money(SETUP_TOTAL)}</div>
            </div>
            {SETUP_LINES.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '7px 16px 7px 28px', background: CARD, borderTop: `1px solid ${HAIRLINE}` }}>
                <div>
                  <div style={{ fontSize: 11.5, color: SUBINK }}>{l.name}</div>
                  {l.note && <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 1, opacity: 0.75 }}>{l.note}</div>}
                </div>
                <div style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: SUBINK }}>
                  {l.amount === 0 ? 'Included' : money(l.amount)}
                </div>
              </div>
            ))}
            <div style={{ background: CARD, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', justifyContent: 'space-between', padding: '11px 16px' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Run</div>
                <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 1 }}>Pressed and packed</div>
              </div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{MOCK_QTY.toLocaleString()} units · {money(SUBTOTAL)}</div>
            </div>
            <div style={{ padding: '16px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>Estimate total</div>
                  <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>If {MOCK_CLIENT_FIRST} presses the full run</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6, fontVariantNumeric: 'tabular-nums' }}>{money(TOTAL)}</div>
              </div>
            </div>
          </div>

          {/* Other run sizes — one quiet line, the page is where they explore */}
          <div style={{ marginTop: 12, fontSize: 12, color: SUBINK, textAlign: 'center' }}>
            Thinking bigger or smaller? The estimate page prices every run size from 100 to 3,000 live.
          </div>

          {/* THE action — one filled-blue button, centered (email pattern) */}
          <div style={{ marginTop: 26, textAlign: 'center' }}>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              data-testid="email-open-estimate"
              style={{
                display: 'inline-block', padding: '14px 34px', borderRadius: 40,
                background: GOLD, color: '#ffffff', fontSize: 15, fontWeight: 700,
                letterSpacing: 1, textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              Open your estimate
            </a>
            <div style={{ marginTop: 10, fontSize: 11.5, color: SUBINK }}>
              Private link, just for you — no account needed.
            </div>
          </div>

          {/* GoodTunes hook — static quiet line (no animation in email) */}
          <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13 }}>
            <span style={{ color: SUBINK }}>Get this for $0 out of pocket. </span>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ color: GOLD, textDecoration: 'none' }} data-testid="email-goodtunes-hook">Learn more →</a>
          </div>

          {/* Travis sign-off — replaces the page's "Ask a question" sheet;
              in email, the reply button IS the question channel. */}
          <div style={{ marginTop: 30, padding: '14px 16px', borderRadius: 0, background: CARD, border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
              <img src={travisPhoto} alt={MOCK_PREPARED_BY} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
            <div style={{ fontSize: 12.5, color: SUBINK, lineHeight: 1.55 }}>
              <span style={{ color: INK, fontWeight: 600 }}>Questions? Just reply.</span>{' '}
              Replies go straight to {MOCK_PREPARED_BY.split(' ')[0]} at {MOCK_PRESS}.
            </div>
          </div>
        </div>

        {/* Footer — press letterhead + terms, then platform line */}
        <div style={{ padding: '24px 36px 30px', background: CARD, borderTop: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
          <img src={hellbenderLogo} alt={MOCK_PRESS} style={{ width: 34, height: 34, opacity: 0.9 }} />
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{MOCK_PRESS}</div>
          <div style={{ fontSize: 11, color: SUBINK, marginTop: 2 }}>5794 Butler Street · Pittsburgh, PA · hellbendervinyl.com</div>
          <div style={{ fontSize: 11, color: SUBINK, lineHeight: 1.7, marginTop: 14 }}>
            <p style={{ margin: 0 }}>All orders are subject to +/- 10% and billed accordingly.</p>
            <p style={{ margin: '2px 0 0' }}>Listed prices may change per final order specifications.</p>
            <p style={{ margin: '2px 0 0' }}>This estimate is valid for 30 days.</p>
          </div>
          <div style={{ marginTop: 18 }}><Rule /></div>
          <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 14, opacity: 0.8 }}>
            Sent by GoodTunes® on behalf of {MOCK_PRESS} · This email was sent to {MOCK_CLIENT_EMAIL} because {MOCK_PREPARED_BY.split(' ')[0]} prepared an estimate for you.
          </div>
        </div>
      </div>
    </div>
  );
}
