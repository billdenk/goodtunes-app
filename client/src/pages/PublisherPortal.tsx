// Task #1953 — Publisher portal.
//
// Read-only mechanical-royalty statement for invited publisher/writer accounts.
// Invited by the operator from the Publishing → payee detail page.
// Scoped server-side to the logged-in publisher's own payeeKey — they
// cannot see any other payee's data, and cannot edit splits or trigger
// payment runs (admin-only operations).
//
// Chrome: OperatorShell with a single "Statement" tab.
// Data: GET /api/publisher/me + GET /api/publisher/statement.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { formatUsdCents } from "@shared/money";
import { CheckCircle2, Clock, ExternalLink, Music2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const dollars = (cents: number) => formatUsdCents(cents);

type PublisherMe = {
  payeeKey: string;
  displayName: string;
  ownerKind: "organization" | "person" | null;
  ownerId: string | null;
  hasPayoutAccount: boolean;
  payoutsEnabled: boolean;
};

type PayeeStatementLine = {
  lineId: string;
  songId: string;
  songTitle: string;
  splitBp: number;
  owedMicros: number;
};

type PayeeStatementAlbum = {
  albumId: string;
  title: string;
  artist: string | null;
  artwork: string | null;
  unitsPressed: number;
  albumMicros: number;
  lines: PayeeStatementLine[];
};

type PayeeStatement = {
  payeeKey: string;
  displayName: string;
  rateMicros: number;
  totalMicros: number;
  totalCents: number;
  lineCount: number;
  albums: PayeeStatementAlbum[];
};

/** Largest-remainder allocation so per-line display cents sum exactly to totalCents. */
function buildReconciledCentsMap(
  albumsData: PayeeStatementAlbum[],
  totalCents: number,
): Map<string, number> {
  const allLines: { lineId: string; owedMicros: number }[] = [];
  for (const album of albumsData) {
    for (const line of album.lines) {
      allLines.push({ lineId: line.lineId, owedMicros: line.owedMicros });
    }
  }
  if (allLines.length === 0) return new Map();
  const floors = allLines.map((l) => Math.floor(l.owedMicros / 10_000));
  const fracs = allLines.map((l, i) => ({
    i,
    frac: l.owedMicros / 10_000 - floors[i],
  }));
  const floorSum = floors.reduce((s, c) => s + c, 0);
  const remainder = totalCents - floorSum;
  const sorted = [...fracs].sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let j = 0; j < remainder && j < sorted.length; j++) {
    result[sorted[j].i] += 1;
  }
  const map = new Map<string, number>();
  allLines.forEach((l, i) => map.set(l.lineId, result[i]));
  return map;
}

function PayoutStatusPill({ has, enabled }: { has: boolean; enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Ready to receive payments
      </span>
    );
  }
  if (has) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
        <Clock className="h-3 w-3" /> Payout setup in progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-fan-faint">
      <Clock className="h-3 w-3" /> Payout not set up
    </span>
  );
}

function PayoutOnboardingBanner({
  hasPayoutAccount,
  ownerKind,
  onAccountLinked,
  toast,
}: {
  hasPayoutAccount: boolean;
  ownerKind: "organization" | "person" | null;
  onAccountLinked: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const canOnboard = ownerKind !== null;

  const onboard = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/publisher/payout-onboard").then((r) => r.json()),
    onSuccess: (data: { url: string }) => {
      // Navigate to Stripe's hosted onboarding. Stripe redirects back to
      // /publisher?payout=return when the publisher completes the flow.
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Payout setup started", description: "Check your Stripe account to continue." });
        onAccountLinked();
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't start payout setup",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (hasPayoutAccount) {
    return (
      <div
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-4"
        data-testid="banner-pub-payout-cta"
      >
        <p className="text-sm font-semibold text-fan-primary">Payout setup in progress</p>
        <p className="mt-1 text-xs text-fan-secondary">
          GoodTunes will notify you when your account is verified and ready to receive payments.
        </p>
        {canOnboard && (
          <button
            type="button"
            onClick={() => onboard.mutate()}
            disabled={onboard.isPending}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-fan-primary transition-colors hover:bg-white/15 disabled:opacity-50"
            data-testid="button-pub-continue-onboarding"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {onboard.isPending ? "Opening Stripe…" : "Continue Stripe setup"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-4"
      data-testid="banner-pub-payout-cta"
    >
      <p className="text-sm font-semibold text-fan-primary">
        Get paid for your publishing royalties
      </p>
      <p className="mt-1 text-xs text-fan-secondary">
        {canOnboard
          ? "Set up a payout account to receive mechanical royalties directly. You'll be taken to Stripe to complete a short verification."
          : "Contact the GoodTunes team to link your account and start receiving mechanical royalties."}
      </p>
      {canOnboard && (
        <button
          type="button"
          onClick={() => onboard.mutate()}
          disabled={onboard.isPending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--brand-blue)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          data-testid="button-pub-setup-payout"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {onboard.isPending ? "Opening Stripe…" : "Set up payout account"}
        </button>
      )}
    </div>
  );
}

export function PublisherPortal() {
  const [tab, setTab] = useState<"statement">("statement");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useQuery<PublisherMe>({
    queryKey: ["/api/publisher/me"],
    queryFn: () =>
      fetch("/api/publisher/me", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: Infinity,
  });

  const {
    data: statement,
    isLoading: statementLoading,
    isError: statementError,
  } = useQuery<PayeeStatement>({
    queryKey: ["/api/publisher/statement"],
    queryFn: () =>
      fetch("/api/publisher/statement", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: Infinity,
    enabled: !!me,
  });

  const reconciledCents = useMemo(
    () =>
      statement
        ? buildReconciledCentsMap(statement.albums, statement.totalCents)
        : new Map<string, number>(),
    [statement],
  );

  const tabs = [{ id: "statement" as const, label: "Statement" }] as const;

  return (
    <OperatorShell
      roleLabel="Publisher portal"
      name={me?.displayName ?? (meLoading ? "Loading…" : "Your dashboard")}
      fallbackIcon={Music2}
      logoShape="square"
      subtitle={
        me ? <PayoutStatusPill has={me.hasPayoutAccount} enabled={me.payoutsEnabled} /> : undefined
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      spaceContent
      testId="publisher-portal"
    >
      {/* Payout onboarding CTA */}
      {me && !me.payoutsEnabled && (
        <PayoutOnboardingBanner
          hasPayoutAccount={me.hasPayoutAccount}
          ownerKind={me.ownerKind}
          onAccountLinked={() => queryClient.invalidateQueries({ queryKey: ["/api/publisher/me"] })}
          toast={toast}
        />
      )}

      {/* Statement loading */}
      {statementLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-fan-secondary">
          Loading your statement…
        </div>
      )}

      {/* Statement error */}
      {statementError && !statementLoading && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-300">
          Couldn't load your statement. Please try refreshing.
        </div>
      )}

      {/* Summary stats */}
      {statement && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-fan-secondary">Total owed</div>
              <div
                className="mt-1 text-2xl font-semibold text-fan-primary"
                data-testid="text-pub-total"
              >
                {dollars(statement.totalCents)}
              </div>
              <div className="mt-1 text-xs text-fan-faint">rounded once across catalog</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-fan-secondary">Track lines</div>
              <div className="mt-1 text-2xl font-semibold text-fan-primary">
                {statement.lineCount}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-fan-secondary">Releases</div>
              <div className="mt-1 text-2xl font-semibold text-fan-primary">
                {statement.albums.length}
              </div>
            </div>
          </div>

          {/* Album → track breakdown */}
          <div className="space-y-4">
            {statement.albums.map((album) => {
              const albumLineCents = album.lines.reduce(
                (s, l) => s + (reconciledCents.get(l.lineId) ?? 0),
                0,
              );
              return (
                <div
                  key={album.albumId}
                  className="overflow-hidden rounded-xl border border-white/10 bg-white/5"
                  data-testid={`section-pub-album-${album.albumId}`}
                >
                  {/* Album header row */}
                  <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                    {album.artwork ? (
                      <img
                        src={album.artwork}
                        alt=""
                        className="h-9 w-9 flex-none rounded object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 flex-none rounded bg-white/10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-fan-primary">{album.title}</div>
                      {album.artist && (
                        <div className="truncate text-xs text-fan-secondary">{album.artist}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-fan-primary">
                        {dollars(albumLineCents)}
                      </div>
                      <div className="text-xs text-fan-secondary">
                        {album.unitsPressed.toLocaleString()} units
                      </div>
                    </div>
                  </div>

                  {/* Per-track lines */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-fan-secondary">
                        <th className="px-4 py-2 font-medium">Track</th>
                        <th className="px-4 py-2 text-right font-medium">Units</th>
                        <th className="px-4 py-2 text-right font-medium">Split</th>
                        <th className="px-4 py-2 text-right font-medium">Owed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {album.lines.map((line) => (
                        <tr
                          key={line.lineId}
                          className="border-b border-white/10 last:border-0"
                          data-testid={`row-pub-line-${line.lineId}`}
                        >
                          <td className="px-4 py-2.5 text-fan-primary">{line.songTitle}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-fan-secondary">
                            {album.unitsPressed.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-fan-secondary">
                            {(line.splitBp / 100).toFixed(2)}%
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-fan-primary">
                            {dollars(reconciledCents.get(line.lineId) ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Rate footnote */}
          <p className="text-xs text-fan-faint">
            Mechanical rate: ${(statement.rateMicros / 1_000_000).toFixed(3)}/unit (US statutory
            minimum). Amounts are estimated and subject to change until your payout is released.
          </p>
        </>
      )}
    </OperatorShell>
  );
}
