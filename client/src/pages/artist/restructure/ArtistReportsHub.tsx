// Artist Portal Restructure — SCENE 6, the Reports hub.
//
// Copied VERBATIM from handoff/artist-portal-restructure/
// ArtistPortalRestructureFlow.tsx (Ruby, Aug 16 2026): tab bar, never-netted
// note, LedgerCard grammar. MOCK_LEDGERS swapped for GET /api/artist/ledgers.
// Audience / Acquisition / Buyers tabs mount the REAL existing analytics
// components (standing rule: partner surfaces reuse the shared components).

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { AcquisitionTab } from '@/components/operator/AcquisitionTab';
import { BLUE, useRestructureTheme, fmtDollars, type Theme } from './shared';

const REPORTS_TABS = [
  { id: 'audience', label: 'Audience' },
  { id: 'acquisition', label: 'Acquisition' },
  { id: 'buyers', label: 'Buyers' },
  { id: 'payments', label: 'Payments' },
  { id: 'earnings', label: 'Earnings' },
];

type LedgerRow = { label: string; sub: string; amountCents: number };
type LedgersPayload = {
  owed: { totalCents: number; rows: LedgerRow[] };
  earned: { totalCents: number; rows: LedgerRow[] };
};

function LedgerCard({ kind, ledger, t }: { kind: 'owed' | 'earned'; ledger: LedgersPayload['owed']; t: Theme }) {
  const owed = kind === 'owed';
  const rows = ledger.rows;
  const total = fmtDollars(ledger.totalCents);
  return (
    <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid={`ledger-${kind}`}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: owed ? t.warnBg : t.passBg, color: owed ? t.warnInk : t.ready }}>
          {owed
            ? <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
            : <Check className="w-3 h-3" strokeWidth={3} />}
          {owed ? 'Money out' : 'Money in'}
        </span>
      </div>
      <h3 className="text-[16px] font-semibold" style={{ marginTop: 12, color: t.ink }}>{owed ? 'Payments' : 'Earnings'}</h3>
      <p className="text-[12.5px]" style={{ marginTop: 4, color: t.subink }}>
        {owed ? 'What you owe GoodTunes® for manufacturing, across all releases.' : 'What GoodTunes® has paid you from fan sales.'}
      </p>
      <div className="text-[30px] font-semibold" style={{ marginTop: 12, color: t.ink, letterSpacing: '-0.02em' }}>{total}</div>
      <div className="text-[12px]" style={{ color: t.subink }}>{owed ? 'outstanding' : 'paid to you'}</div>
      <div className="space-y-0" style={{ marginTop: 14 }}>
        {rows.length === 0 && (
          <div className="text-[12.5px]" style={{ paddingTop: 10, color: t.faint }}>{owed ? 'Nothing outstanding.' : 'No payouts yet.'}</div>
        )}
        {rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}>
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate" style={{ color: t.ink }}>{r.label}</div>
              <div className="text-[11.5px]" style={{ color: t.faint }}>{r.sub}</div>
            </div>
            <span className="text-[13.5px] font-semibold flex-shrink-0" style={{ color: t.ink }}>{fmtDollars(r.amountCents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArtistReportsHub({ qs, personId, rangeControl }: {
  qs: string;
  personId: string | null;
  /** In-content date-range switcher (canon: the range picker travels with
   * charts, never with the shell). Rendered right-aligned in the sub-tab
   * row; it owns the window behind `qs` for every pane below. */
  rangeControl?: React.ReactNode;
}) {
  const t = useRestructureTheme();
  const [location, navigate] = useLocation();
  const search = useSearch();
  // Sub-tab lives on ?rtab= so it doesn't fight the portal shell's ?tab=
  // (embedded-AdminReports precedent).
  const tab = new URLSearchParams(search).get('rtab') ?? 'payments';
  const setTab = (next: string) => {
    const params = new URLSearchParams(search);
    if (next === 'payments') params.delete('rtab'); else params.set('rtab', next);
    const s = params.toString();
    navigate(`${location}${s ? `?${s}` : ''}`, { replace: true });
  };

  const ledgersQ = useQuery<LedgersPayload>({
    queryKey: [`/api/artist/ledgers${qs}`],
    enabled: tab === 'payments' || tab === 'earnings',
  });
  const ledgers = ledgersQ.data;
  const moneyTab = tab === 'payments' || tab === 'earnings';
  const neverNetted = useMemo(() => {
    if (!ledgers) return null;
    const nettedCents = Math.abs(ledgers.owed.totalCents - ledgers.earned.totalCents);
    return { owed: fmtDollars(ledgers.owed.totalCents), earned: fmtDollars(ledgers.earned.totalCents), netted: fmtDollars(nettedCents) };
  }, [ledgers]);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Reports. </span>
        <span style={{ color: t.subink }}>How am I doing?</span>
      </h1>

      <div className="flex items-center gap-1 overflow-x-auto" style={{ marginTop: 22, borderBottom: `1px solid ${t.hairline}` }}>
        {REPORTS_TABS.map((r) => {
          const active = r.id === tab;
          return (
            <button key={r.id} type="button" onClick={() => setTab(r.id)} data-testid={`reports-tab-${r.id}`} className="relative inline-flex items-center gap-2 text-[14px] transition-colors whitespace-nowrap" style={{ padding: '10px 14px', fontWeight: active ? 600 : 500, color: active ? t.ink : t.subink }}>
              {!active && <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: t.dot }} />}
              {r.label}
              {active && <span aria-hidden className="absolute left-0 right-0" style={{ bottom: -1, height: 2, background: BLUE, borderRadius: 2 }} />}
            </button>
          );
        })}
        {rangeControl && <div className="ml-auto flex-shrink-0 pl-3" style={{ paddingBottom: 6 }}>{rangeControl}</div>}
      </div>

      {moneyTab ? (
        <>
          {neverNetted && (
            <div className="flex items-center gap-2.5 rounded-xl flex-wrap" style={{ marginTop: 20, padding: '10px 16px', background: t.soft }} data-testid="never-netted-note">
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} />
              <span className="text-[13px] font-semibold" style={{ color: t.ink }}>Kept separate on purpose</span>
              <span className="text-[12.5px]" style={{ color: t.subink }}>— you owe {neverNetted.owed} and you&rsquo;re owed {neverNetted.earned}. Two truths, never shown as &ldquo;{neverNetted.netted}.&rdquo;</span>
            </div>
          )}
          {ledgersQ.isLoading ? (
            <p className="text-[13.5px]" style={{ marginTop: 20, color: t.subink }}>Loading ledgers…</p>
          ) : ledgersQ.isError || !ledgers ? (
            <p className="text-[13.5px]" style={{ marginTop: 20, color: t.subink }} data-testid="ledgers-error">Couldn&rsquo;t load the ledgers. Refresh to try again.</p>
          ) : (
            <div className="grid gap-5" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
              <LedgerCard kind="owed" ledger={ledgers.owed} t={t} />
              <LedgerCard kind="earned" ledger={ledgers.earned} t={t} />
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 20 }}>
          {tab === 'audience' && <ArtistAudiencePane qs={qs} />}
          {tab === 'acquisition' && (
            <AcquisitionTab
              kind="artist"
              scopeId={new URLSearchParams(window.location.search).get('personId')}
              rangeQs={qs}
            />
          )}
          {tab === 'buyers' && <ArtistBuyersPane qs={qs} personId={personId} />}
        </div>
      )}
    </div>
  );
}

// Audience + Buyers reuse the ArtistDashboard tab components; imported lazily
// via wrapper components defined in ArtistDashboard.tsx (they stay private
// there). To avoid a circular import, ArtistDashboard passes them in through
// module registration below.
let AudiencePaneImpl: ((props: { qs: string }) => JSX.Element | null) | null = null;
let BuyersPaneImpl: ((props: { qs: string; personId: string | null }) => JSX.Element | null) | null = null;
export function registerReportPanes(panes: {
  audience: (props: { qs: string }) => JSX.Element | null;
  buyers: (props: { qs: string; personId: string | null }) => JSX.Element | null;
}) {
  AudiencePaneImpl = panes.audience;
  BuyersPaneImpl = panes.buyers;
}
function ArtistAudiencePane({ qs }: { qs: string }) {
  return AudiencePaneImpl ? <AudiencePaneImpl qs={qs} /> : null;
}
function ArtistBuyersPane({ qs, personId }: { qs: string; personId: string | null }) {
  return BuyersPaneImpl ? <BuyersPaneImpl qs={qs} personId={personId} /> : null;
}
