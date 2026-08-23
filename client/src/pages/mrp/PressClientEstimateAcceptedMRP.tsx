// CORNER RULING (Bill, Aug 21 2026): Memphis's corner token = SQUARE across
// the whole MRP skin — buttons, inputs, cards, pills. Only true circles
// (avatars, status dots) stay round.
// PressClientEstimateAcceptedMRP — the confirmation moment right after
// Niina clicks the gold "Start this project" button on her MRP estimate
// (PressClientEstimateMRP). Connective tissue between the estimate and
// PressClientNextStepsMRP: same white MRP skin, same estimate numbers,
// pointing her toward signing in at mrp.pressesvinyl.com.
// Canon honored here:
// - Estimate-not-quote: accepting starts the project; it is not a binding
//   quote. The copy says so plainly, without being timid.
// - ONE filled gold action on the page: "Sign in at mrp.pressesvinyl.com".
//   The confirmation-email preview below is a mock artifact — its gold
//   button is inside the rendered email, not a second page action.
// - Every status = word + icon, never color alone (Bill is colorblind).
// - Gold #D9C153 always carries dark ink, never white.
// - Poppins throughout (their real stylesheet — Bill, Aug 21 2026).
// Self-contained per handoff rules — MOCK_ constants only, no imports
// from other mockups. Numbers match PressClientEstimateMRP at the
// 1,000-unit tier and PressClientNextStepsMRP's deposit math.

import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import californialandCover from './assets/californialand-cover.jpg';
import mrpLogoAsset from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';
import goodtunesLogo from './assets/goodtunes-logo.png';

// ─── Real estimate off the private link (MOCK_* retired) ─────────────
type LinkEstimate = {
  title: string;
  displayId: string | null;
  status: string;
  createdAt: string | null;
  sentAt: string | null;
  pressName: string;
  clientName: string | null;
  preparedBy: string | null;
  build: string | null;
  totalCents: number | null;
  builderState: Record<string, any> | null;
  acceptedAt?: string | null;
  clientEmail?: string | null;
  paidAt?: string | null;
  brand?: { locationLine?: string | null; contactLine?: string | null; skin?: string | null } | null;
};
const SETUP_TOTAL_DOLLARS = 1295;
const moneyFmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

// ─── Palette — MRP light canon (twin of the estimate page) ───────────
const CANVAS = '#ffffff'; // MRP pages are pure white (Andrew, Aug 21 2026)
const CARD = '#ffffff';
const CARD_RAISED = '#fbfaf7';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const HAIRLINE = 'rgba(0,0,0,0.10)';
const GOLD = '#D9C153'; // MRP's site gold (Andrew, Aug 21 2026)
const GOLD_TINT_TOP = 'rgba(217,193,83,0.12)';
const BLUE = '#319ED8'; // the single filled BLUE action per screen (house rule)
const READY = '#1c8a5b';
const WARN = '#c98a00';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

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

type BillingEarning = {
  id: string;
  name: string;
  note: string;
  amountCents: number;
};

type BillingEarnings = {
  /** Server-derived proceeds total; never reconstructed from line items. */
  totalCents: number;
  items: BillingEarning[];
};

type BillingLedgerProps = {
  amountCents: number;
  estimateNumber: string;
  pressName: string;
  build: string;
  paid: boolean;
  payBusy: boolean;
  payError: string | null;
  onPay: () => void;
  onViewEstimate: () => void;
  /** Intentionally optional until a real GoodTunes proceeds source exists. */
  earnings?: BillingEarnings;
  fundedByGoodTunes?: boolean;
};

function SectionHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.4, margin: 0 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6', fontWeight: 500 }}>{rest}</span>
    </h2>
  );
}

function BillingStatus({ paid, fundedByGoodTunes, testId }: { paid: boolean; fundedByGoodTunes: boolean; testId?: string }) {
  return (
    <span data-testid={testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: '3px 9px', background: '#f0f0f2', color: INK, fontSize: 11.5, fontWeight: 600 }}>
      {paid || fundedByGoodTunes ? (
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke={READY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${WARN}`, flexShrink: 0 }} />
      )}
      {fundedByGoodTunes ? 'Paid by GoodTunes presale' : paid ? 'Paid' : 'Due'}
    </span>
  );
}

function BillingLedger({
  amountCents,
  estimateNumber,
  pressName,
  build,
  paid,
  payBusy,
  payError,
  onPay,
  onViewEstimate,
  earnings,
  fundedByGoodTunes = false,
}: BillingLedgerProps) {
  const amountDueCents = paid || fundedByGoodTunes ? 0 : amountCents;
  const amountLabel = moneyFmt(amountCents / 100);
  const dueLabel = moneyFmt(amountDueCents / 100);

  const invoiceRow = (
    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }} data-testid="invoice-pressing">
      <div style={{ minWidth: 0 }}>
        <div style={{ color: INK, fontSize: 14, fontWeight: 600 }}>Pressing estimate — {pressName}</div>
        <div style={{ color: SUBINK, fontSize: 12.5, marginTop: 3 }}>{build || `Estimate ${estimateNumber}`}</div>
        <button type="button" onClick={onViewEstimate} style={{ display: 'block', border: 0, padding: 0, background: 'none', cursor: 'pointer', color: BLUE, fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>
          View estimate &rarr;
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <BillingStatus paid={paid} fundedByGoodTunes={fundedByGoodTunes} testId={paid ? 'billing-paid' : undefined} />
        <span style={{ color: INK, fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{amountLabel}</span>
      </div>
    </div>
  );

  return (
    <section
      data-testid="billing-band"
      style={{
        marginTop: 32,
        display: 'grid',
        gridTemplateColumns: earnings ? 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' : 'minmax(0, 1fr)',
        gap: 28,
        alignItems: 'start',
      }}
    >
      <section data-testid="col-owe">
        <SectionHeading lead="You owe" rest="Invoices from your press" />
        <div style={{ color: INK, fontSize: 34, fontWeight: 700, letterSpacing: -0.7, marginTop: 14, fontVariantNumeric: 'tabular-nums' }} data-testid="amount-due">
          {dueLabel}
        </div>
        <p style={{ color: SUBINK, fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.55 }}>
          {amountDueCents === 0
            ? fundedByGoodTunes
              ? 'Nothing due right now — your presale covered the press bill.'
              : 'Nothing due right now — your press bill is paid.'
            : 'This is the number the Billing chip carries — what needs you.'}
        </p>
        {amountDueCents > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={onPay}
              disabled={payBusy}
              data-testid="billing-pay"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 9999, border: 'none', padding: '10px 20px', cursor: payBusy ? 'default' : 'pointer', background: BLUE, boxShadow: PILL_SHADOW, color: '#ffffff', fontSize: 13.5, fontWeight: 600, opacity: payBusy ? 0.7 : 1, whiteSpace: 'nowrap' }}
            >
              {payBusy ? 'Starting…' : `Pay ${amountLabel}`}
            </button>
            <p style={{ color: SUBINK, fontSize: 12, margin: '8px 0 0' }}>Card or bank transfer — securely handled by Stripe.</p>
          </div>
        )}
        {payError && <div style={{ color: SUBINK, fontSize: 12, marginTop: 8 }} data-testid="billing-error">{payError}</div>}
        <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 16, background: CARD, overflow: 'hidden', marginTop: 18 }}>
          {invoiceRow}
        </div>
        {fundedByGoodTunes && (
          <p style={{ color: SUBINK, fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.55 }}>
            Your fans funded the pressing — the bill exists, and it&rsquo;s already handled.
          </p>
        )}
      </section>

      {earnings && (
        <section data-testid="col-earned">
          <SectionHeading lead="You’ve earned" rest="Proceeds from your presale" />
          <div style={{ color: INK, fontSize: 34, fontWeight: 700, letterSpacing: -0.7, marginTop: 14, fontVariantNumeric: 'tabular-nums' }} data-testid="amount-earned">
            {moneyFmt(earnings.totalCents / 100)}
          </div>
          <p style={{ color: SUBINK, fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.55 }}>
            Presale proceeds and signed GoodDeed® premiums, paid out after launch.
          </p>
          <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 16, background: CARD, overflow: 'hidden', marginTop: 18 }}>
            {earnings.items.map((item, index) => (
              <div key={item.id} style={{ padding: '16px 20px', borderTop: index === 0 ? 'none' : `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }} data-testid={`earned-${item.id}`}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: INK, fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ color: SUBINK, fontSize: 12.5, marginTop: 3 }}>{item.note}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <BillingStatus paid fundedByGoodTunes={false} />
                  <span style={{ color: INK, fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{moneyFmt(item.amountCents / 100)}</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: SUBINK, fontSize: 12.5, margin: '10px 0 0', lineHeight: 1.55 }}>
            Paid out to your account after launch. Full statement lands here with the payout.
          </p>
        </section>
      )}
    </section>
  );
}

function InsetRule() {
  return <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 18px' }} />;
}

// ─── MRP site chrome — copied from the reference MRP mocks (verbatim
// structure; nav is decorative site chrome). Post-acceptance, she's not
// signed in yet, so the header shows the account-less state without the
// gold "GET AN ESTIMATE" rectangle competing with the page's one action. ──
const MRP_NAV = ['Home', 'About MRP', 'Products', 'Resources', 'MRP TV', 'MRP University', 'News', 'Shop', 'Contact'];

function MrpSiteHeader() {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#ffffff' }}>
      {/* Utility bar — 40px row, 12px / 400 / 0.07em, #333 ink (their stylesheet) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 40, padding: '0 26px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 12, fontWeight: 400, letterSpacing: '0.07em', color: '#333333' }}>
        <span>Let&rsquo;s talk about your project</span>
        <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: HAIRLINE }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#333333' }}>
          <MailIcon />
          help@memphisvinyl.com
        </span>
        <span style={{ flex: 1 }} />
      </div>
      {/* Poppins rides with the header so the whole page gets the real MRP face. */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
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
        <img src={mrpLogoAsset} alt="Memphis Record Pressing" style={{ width: 60, height: 60 }} />
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
          <img src={goodtunesLogo} alt="GoodTunes®" style={{ height: 15, width: 'auto', filter: 'invert(1) brightness(2)', opacity: 0.85 }} />
        </span>
      </div>
    </footer>
  );
}

export default function PressClientEstimateAcceptedMRP() {
  /* Their real stylesheet is Poppins throughout (Bill, Aug 21 2026). */
  const font = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();
  const { data: est, isLoading, refetch } = useQuery<LinkEstimate>({
    queryKey: [`/api/estimate-link/${token}`],
    enabled: Boolean(token),
    staleTime: Infinity,
  });

  // ── Payment tap — the artist pays their press bill off the accepted
  // estimate. Amount is server-side; we only ask to start / confirm.
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  // Optimistic "paid" once pay-status confirms, so the pill hides even before
  // the estimate query refetches paidAt.
  const [justPaid, setJustPaid] = useState(false);

  // On return from Checkout (?paid=1&session_id=…), confirm fail-closed.
  useEffect(() => {
    if (!token) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('paid') !== '1') return;
    const sid = q.get('session_id');
    if (!sid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest('GET', `/api/estimate-link/${token}/pay-status?session_id=${encodeURIComponent(sid)}`);
        const body = await res.json();
        if (!cancelled && body?.paid) {
          setJustPaid(true);
          refetch();
        }
      } catch {
        /* leave the pay pill available to retry */
      }
    })();
    return () => { cancelled = true; };
  }, [token, refetch]);

  const startPay = async () => {
    if (!token || payBusy) return;
    setPayBusy(true);
    setPayError(null);
    try {
      const res = await apiRequest('POST', `/api/estimate-link/${token}/pay-session`, {});
      const body = await res.json();
      if (body?.url) {
        window.location.href = body.url as string;
        return;
      }
      setPayError("We couldn't start the payment — please try again.");
    } catch (e: any) {
      setPayError(e?.body?.message ?? "We couldn't start the payment — please try again.");
    } finally {
      setPayBusy(false);
    }
  };

  if (isLoading || !est) {
    return <div style={{ minHeight: '100dvh', background: CANVAS }} />;
  }

  // MRP-light presses only (review gate): this screen is Memphis's own
  // skin with MRP identity assets. Any other press's token bounces back to
  // the estimate page, which self-selects the right presentation.
  if (est.brand?.skin !== 'mrp-light') {
    navigate(`/e/${token}`, { replace: true });
    return <div style={{ minHeight: '100dvh', background: CANVAS }} />;
  }

  // Real estimate fields — same derivations as the estimate page.
  const clientFull = est.clientName ?? '';
  const clientFirst = clientFull.split(' ')[0] || 'there';
  const clientEmail = est.clientEmail ?? '';
  const estimateNo = est.displayId ?? '—';
  const preparedBy = est.preparedBy || est.pressName;
  const firstName = preparedBy.split(' ')[0];
  const pressName = est.pressName;
  const jobTitle = est.title;
  const spec = est.build ?? '';
  const qty = est.builderState?.quantity ?? null;
  const qtyLabel = qty ? `${Number(qty).toLocaleString()} units` : '';
  const totalDollars = est.totalCents != null ? est.totalCents / 100 : null;
  const runDollars = totalDollars != null ? Math.max(0, totalDollars - SETUP_TOTAL_DOLLARS) : null;
  const unitLabel = runDollars != null && qty ? `$${(runDollars / Number(qty)).toFixed(2)} /unit` : '';
  const runLabel = runDollars != null ? moneyFmt(runDollars) : '—';
  const setupLabel = moneyFmt(SETUP_TOTAL_DOLLARS);
  const totalLabel = totalDollars != null ? moneyFmt(totalDollars) : '—';
  const depositLabel = totalDollars != null ? moneyFmt(totalDollars / 2) : '—';
  const acceptedDate = fmtDate(est.acceptedAt) ?? fmtDate(new Date().toISOString());
  const isPaid = Boolean(est.paidAt) || justPaid;
  const portalHost = window.location.host;
  const pressEmail = (est.brand?.contactLine ?? '').match(/\S+@\S+\.\S+/)?.[0] ?? '';

  return (
    <div style={{ minHeight: '100dvh', background: CANVAS, color: INK, fontFamily: font, display: 'flex', flexDirection: 'column' }}>
      <MrpSiteHeader />

      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 24px 72px' }}>

          {/* ── The moment — short, warm, confident ── */}
          <section style={{ textAlign: 'center', paddingTop: 52 }}>
            {/* Word + icon, never color alone */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 13px', border: `1px solid rgba(0,0,0,0.28)`, background: GOLD_TINT_TOP, fontSize: 11.5, fontWeight: 600 }} data-testid="pill-project-started">
              <CheckIcon />
              Project started
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.8, margin: '16px 0 0', lineHeight: 1.15 }}>
              {jobTitle} is a go, {clientFirst}.
            </h1>
            <p style={{ fontSize: 15, color: SUBINK, margin: '12px 0 0', lineHeight: 1.65 }}>
              {firstName} has your project at {pressName}. Estimate {estimateNo} is now your
              working numbers — an estimate, not a final order, so nothing is owed until you approve
              the details together.
            </p>
          </section>

          {/* ── The estimate, carried forward — same numbers, at rest ── */}
          <section style={{ marginTop: 32, border: `1px solid ${HAIRLINE}`, background: CARD, boxShadow: '0 12px 32px rgba(0,0,0,0.06)' }} data-testid="accepted-project-card">
            <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={californialandCover} alt={`${jobTitle} cover art`} style={{ width: 64, height: 64, borderRadius: 0, objectFit: 'cover', border: `1px solid ${HAIRLINE}` }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>{jobTitle}</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>{spec}</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3 }}>
                  Estimate <span style={{ fontWeight: 600, color: INK }}>{estimateNo}</span> · Accepted {acceptedDate}
                </div>
              </div>
            </div>
            <InsetRule />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px' }}>
              <div style={{ fontSize: 13, color: SUBINK }}>Run</div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{qtyLabel} · {unitLabel} · {runLabel}</div>
            </div>
            <InsetRule />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px' }}>
              <div style={{ fontSize: 13, color: SUBINK }}>Setup · one-time</div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{setupLabel}</div>
            </div>
            <div style={{ padding: '16px 18px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>Working total</div>
                <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>May shift with final order specifications</div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>{totalLabel}</div>
            </div>
          </section>

          {est.totalCents != null && (
            <BillingLedger
              amountCents={est.totalCents}
              estimateNumber={estimateNo}
              pressName={pressName}
              build={spec}
              paid={isPaid}
              payBusy={payBusy}
              payError={payError}
              onPay={startPay}
              onViewEstimate={() => navigate(`/e/${token}`)}
            />
          )}

          {/* ── What just happened / what's next — word + icon each ── */}
          <section style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, background: CARD }} data-testid="accepted-next-list">
            <div style={{ padding: '15px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ paddingTop: 2 }}><CheckIcon /></span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Done — your account was created</div>
                <div style={{ fontSize: 12.5, color: SUBINK, marginTop: 3, lineHeight: 1.6 }}>
                  It uses {clientEmail} and the password you just set. {firstName} has been notified.
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
                  Your project home is {portalHost}. Files come first; the 50% deposit ({depositLabel})
                  is only asked for once your test pressing is approved and the run is scheduled.
                </div>
              </div>
            </div>
          </section>

          {/* Sign-in stays secondary; Billing owns the page's sole filled action. */}
          <section style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22 }}>
            <button
              type="button"
              onClick={() => navigate(`/e/${token}`)}
              data-testid="accepted-view-estimate"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: SUBINK }}
            >
              View your estimate
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => navigate('/next-steps')}
                data-testid="accepted-sign-in"
                style={{ padding: '11px 25px', borderRadius: 0, border: `1px solid ${HAIRLINE}`, cursor: 'pointer', background: 'transparent', color: INK, fontSize: 14.5, fontWeight: 600 }}
              >
                Sign in at {portalHost}
              </button>
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 10, textAlign: 'center', fontSize: 11.5, color: 'rgba(0,0,0,0.38)', whiteSpace: 'nowrap' }}>
                {clientEmail}
              </div>
            </div>
          </section>
          <div style={{ height: 26 }} aria-hidden />

          {/* ── Brandon — the human on the other end ── */}
          <section style={{ marginTop: 22, border: `1px solid ${HAIRLINE}`, background: CARD_RAISED, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 46, height: 46, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
              <img src={brandonPhoto} alt={preparedBy} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{preparedBy} is your contact for this run.</div>
              <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>Replies within 1 business day · {pressName}</div>
            </div>
          </section>

          {/* ── The confirmation email, as her inbox will show it ── */}
          <section style={{ marginTop: 44 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: SUBINK, textAlign: 'center' }}>
              The email {clientFirst} receives
            </div>

            <div style={{ marginTop: 14, background: '#eceae3', padding: '22px 16px 26px' }}>
              {/* Inbox chrome (mock-only) — sender identity and subject */}
              <div style={{ maxWidth: 560, margin: '0 auto 12px', padding: '13px 16px', background: CARD, border: `1px solid ${HAIRLINE}` }} data-testid="email-chrome">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }} aria-hidden>
                    <img src={brandonPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {preparedBy} <span style={{ color: SUBINK, fontWeight: 400 }}>&lt;{pressEmail}&gt; · via GoodTunes®</span>
                    </div>
                    <div style={{ fontSize: 12, color: SUBINK, marginTop: 2 }}>To: {clientFull} &lt;{clientEmail}&gt;</div>
                  </div>
                </div>
                <div style={{ marginTop: 9, fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>
                  {jobTitle} is underway at {pressName}
                </div>
                <div style={{ fontSize: 11.5, color: SUBINK, marginTop: 2 }}>
                  Estimate {estimateNo} accepted · {qtyLabel} · {totalLabel} working total — sign in to upload your files.
                </div>
              </div>

              {/* Email body — 600px pattern, single column, static */}
              <div style={{ maxWidth: 560, margin: '0 auto', background: CANVAS, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }} data-testid="email-body">
                <div style={{ padding: '30px 30px 34px' }}>
                  <img src={mrpLogoAsset} alt={pressName} style={{ width: 40, height: 40 }} />
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.4, marginTop: 16 }}>
                    You started something, {clientFirst}.
                  </div>
                  <p style={{ fontSize: 13, color: SUBINK, margin: '10px 0 0', lineHeight: 1.65 }}>
                    {jobTitle} is now a live project at {pressName}, with estimate {estimateNo} as
                    your working numbers. It stays an estimate — not a final order — until you and{' '}
                    {firstName} finalize the order together. Nothing is billed yet.
                  </p>

                  {/* The numbers, at rest */}
                  <div style={{ marginTop: 20, border: `1px solid ${HAIRLINE}` }}>
                    <div style={{ padding: '11px 14px', background: CARD_RAISED, display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{jobTitle}</div>
                      <div style={{ fontSize: 12, color: SUBINK }}>{spec}</div>
                    </div>
                    <div style={{ padding: '9px 14px', borderTop: `1px solid ${HAIRLINE}`, display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, color: SUBINK }}>Run</div>
                      <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{qtyLabel} · {unitLabel} · {runLabel}</div>
                    </div>
                    <div style={{ padding: '9px 14px', borderTop: `1px solid ${HAIRLINE}`, display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 12, color: SUBINK }}>Setup · one-time</div>
                      <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{setupLabel}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderTop: `1px solid ${HAIRLINE}`, background: `linear-gradient(180deg, ${GOLD_TINT_TOP} 0%, ${CARD} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: GOLD }}>Working total</div>
                      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>{totalLabel}</div>
                    </div>
                  </div>

                  {/* One filled gold action inside the email (email's own canon) */}
                  <div style={{ marginTop: 22, textAlign: 'center' }}>
                    <a
                      href="#"
                      onClick={(e) => e.preventDefault()}
                      data-testid="email-sign-in"
                      style={{ display: 'inline-block', padding: '12px 30px', background: GOLD, color: '#1d1d1f', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}
                    >
                      Sign in at {portalHost}
                    </a>
                    <div style={{ marginTop: 9, fontSize: 11.5, color: SUBINK }}>
                      Your account is {clientEmail} — next step is uploading audio &amp; artwork.
                    </div>
                  </div>

                  {/* Reply channel */}
                  <div style={{ marginTop: 24, padding: '12px 14px', border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 0, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                      <img src={brandonPhoto} alt={preparedBy} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </span>
                    <div style={{ fontSize: 12, color: SUBINK, lineHeight: 1.55 }}>
                      <span style={{ color: INK, fontWeight: 600 }}>Questions? Just reply.</span>{' '}
                      Replies go straight to {firstName} at {pressName}.
                    </div>
                  </div>
                </div>

                {/* Email footer — press letterhead + honest terms */}
                <div style={{ padding: '20px 30px 26px', borderTop: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{pressName}</div>
                  <div style={{ fontSize: 10.5, color: SUBINK, marginTop: 2 }}>3015 Brother Blvd · Memphis, TN · memphisvinyl.com</div>
                  <div style={{ fontSize: 10.5, color: SUBINK, lineHeight: 1.7, marginTop: 12 }}>
                    <p style={{ margin: 0 }}>All orders are subject to +/- 10% and billed accordingly.</p>
                    <p style={{ margin: '2px 0 0' }}>Listed prices may change per final order specifications.</p>
                  </div>
                  <div style={{ fontSize: 10, color: SUBINK, marginTop: 12, opacity: 0.8 }}>
                    Sent by GoodTunes® on behalf of {pressName} · Sent to {clientEmail} because you started a project.
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
