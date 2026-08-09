// Publishing — mechanical-settlement section.
//
// Three surfaces, branched by route:
//   /admin/publishing                       catalog-wide roll-up (this list)
//   /admin/publishing/albums/:albumId       per-payee breakdown for one album
//   /admin/publishing/payee?key=<payeeKey>  track-by-track statement for one payee
//
// The mechanical settlement pays each publisher/writer on the basis Bill
// confirmed: statutoryRate ($0.127/unit) × unitsPressed × split%. This
// section is the transparency surface — a publisher can see exactly what
// they're owed and whether they've onboarded to be paid, and the operator
// can see, per song, whether the splits are documented and sum to 100%.
//
// Engine: server/publishingSettlement.ts. API: server/publishingSettlementRoutes.ts.
import { useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { Link, useRoute, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileWarning,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const dollars = (cents: number) => formatUsdCents(cents);

type PayeeInviteStatus = "not_invited" | "invite_sent" | "portal_active" | "payout_ready";

type SettlementsList = {
  rateMicros: number;
  totalCents: number;
  payeeCount: number;
  unpaidPayees: number;
  allocationIssueCount: number;
  missingSplitCount: number;
  payees: {
    payeeKey: string;
    ownerKind: "organization" | "person" | null;
    ownerId: string | null;
    displayName: string;
    payToName: string | null;
    amountCents: number;
    lineCount: number;
    hasPayoutAccount: boolean;
    payoutsEnabled: boolean;
    inviteStatus: PayeeInviteStatus;
  }[];
  albums: {
    albumId: string;
    title: string;
    artist: string | null;
    artwork: string | null;
    unitsPressed: number;
    totalCents: number;
    payeeCount: number;
    unpaidPayees: number;
    allocationIssueCount: number;
    missingSplitCount: number;
  }[];
};

type AlbumSettlement = {
  album: { id: string; title: string; artist: string | null; artwork: string | null };
  albumId: string;
  unitsPressed: number;
  rateMicros: number;
  totalCents: number;
  payees: {
    payeeKey: string;
    ownerKind: "organization" | "person" | null;
    ownerId: string | null;
    displayName: string;
    payToName: string | null;
    amountCents: number;
    lineCount: number;
    hasPayoutAccount: boolean;
    payoutsEnabled: boolean;
  }[];
  allocationIssues: { songId: string; title: string; totalBp: number }[];
  songsMissingSplits: { songId: string; title: string }[];
};

type PayeeStatement = {
  payeeKey: string;
  displayName: string;
  payToName: string | null;
  ownerKind: "organization" | "person" | null;
  ownerId: string | null;
  hasPayoutAccount: boolean;
  payoutsEnabled: boolean;
  rateMicros: number;
  totalMicros: number;
  totalCents: number;
  lineCount: number;
  albums: {
    albumId: string;
    title: string;
    artist: string | null;
    artwork: string | null;
    unitsPressed: number;
    albumMicros: number;
    lines: {
      lineId: string;
      songId: string;
      songTitle: string;
      splitBp: number;
      owedMicros: number;
    }[];
  }[];
};

function rateLabel(rateMicros: number) {
  return `$${(rateMicros / 1_000_000).toFixed(3)}/unit`;
}

function PayoutStatusPill({ has, enabled }: { has: boolean; enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-ready)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-ready)]">
        <CheckCircle2 className="h-3 w-3" /> Ready to pay
      </span>
    );
  }
  if (has) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-warning)]">
        <Clock className="h-3 w-3" /> Onboarding
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-track)] px-2 py-0.5 text-xs font-medium text-[var(--apple-subink)]">
      <Clock className="h-3 w-3" /> Not onboarded
    </span>
  );
}

function InviteStatusBadge({ status }: { status: PayeeInviteStatus }) {
  if (status === "payout_ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-ready)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-ready)]">
        <CheckCircle2 className="h-3 w-3" /> Payout ready
      </span>
    );
  }
  if (status === "portal_active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-blue)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-blue)]">
        <CheckCircle2 className="h-3 w-3" /> Portal active
      </span>
    );
  }
  if (status === "invite_sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-warning)]">
        <Clock className="h-3 w-3" /> Invite sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-track)] px-2 py-0.5 text-xs font-medium text-[var(--apple-subink)]">
      Not invited
    </span>
  );
}

function Flag({ icon: Icon, count, label }: { icon: typeof AlertTriangle; count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-critical)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-critical)]"
      title={label}
    >
      <Icon className="h-3 w-3" /> {count} {label}
    </span>
  );
}

/** Link href to the payee detail page for a given key. */
function payeeHref(payeeKey: string) {
  return `/admin/publishing/payee?key=${encodeURIComponent(payeeKey)}`;
}

function CatalogList() {
  const { data, isLoading, isError, error, refetch } = useQuery<SettlementsList>({
    queryKey: ["/api/admin/publishing/settlements"],
    retry: false,
  });

  const [invitePayee, setInvitePayee] = useState<{ key: string; name: string } | null>(null);

  return (
    <AdminFrame active="publishing">
      <div className="space-y-5">
        <AdminPageHeader
          title="Publishing."
          subtitle="Mechanical-royalty settlements on pressed units — who is owed, whether they can be paid, and whether the splits are documented."
        />

        {isError && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load publishing settlements"
          />
        )}

        {!isError && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4" data-testid="stat-total-owed">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Total owed</div>
                <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]">
                  {data ? dollars(data.totalCents) : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4" data-testid="stat-payees">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Payees</div>
                <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]">
                  {data ? data.payeeCount : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4" data-testid="stat-albums">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Albums with splits</div>
                <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]">
                  {data ? data.albums.length : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4" data-testid="stat-rate">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Statutory rate</div>
                <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]">
                  {data ? rateLabel(data.rateMicros) : "—"}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Payees</h2>
                <p className="text-xs text-[var(--apple-subink)]">
                  Each payee is settled once across the catalog — the amount they're actually paid.
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[var(--apple-hairline)] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--apple-hairline)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
                      <th className="px-4 py-2.5 font-medium">Payee</th>
                      <th className="px-4 py-2.5 text-right font-medium">Lines</th>
                      <th className="px-4 py-2.5 text-right font-medium">Owed</th>
                      <th className="px-4 py-2.5 font-medium">Payout</th>
                      <th className="px-4 py-2.5 font-medium">Invite status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr>
                        <td className="px-4 py-6 text-[var(--apple-faint)]" colSpan={5}>
                          Loading…
                        </td>
                      </tr>
                    )}
                    {!isLoading && data && data.payees.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <AdminEmptyState>
                            No payees yet. Add publishing splits with non-zero shares to settle the catalog.
                          </AdminEmptyState>
                        </td>
                      </tr>
                    )}
                    {data?.payees.map((p) => (
                      <tr
                        key={p.payeeKey}
                        className="border-b border-[var(--apple-hairline)] last:border-0 hover:bg-[var(--apple-track)]"
                        data-testid={`row-catalog-payee-${p.payeeKey}`}
                      >
                        <td className="px-4 py-3">
                          <Link href={payeeHref(p.payeeKey)} className="block transition-colors hover:text-[color:var(--brand-blue)]" data-testid={`link-catalog-payee-${p.payeeKey}`}>
                            <div className="font-medium text-[var(--apple-ink)]">{p.displayName}</div>
                            {p.payToName && (
                              <div className="text-xs text-[var(--apple-subink)]">administered by {p.payToName}</div>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--apple-subink)]">{p.lineCount}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--apple-ink)]">
                          {dollars(p.amountCents)}
                        </td>
                        <td className="px-4 py-3">
                          <PayoutStatusPill has={p.hasPayoutAccount} enabled={p.payoutsEnabled} />
                        </td>
                        <td className="px-4 py-3" data-testid={`cell-invite-status-${p.payeeKey}`}>
                          <div className="flex items-center gap-2">
                            <InviteStatusBadge status={p.inviteStatus} />
                            {p.inviteStatus === "not_invited" && p.ownerKind !== null && (
                              <button
                                type="button"
                                onClick={() => setInvitePayee({ key: p.payeeKey, name: p.displayName })}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--apple-hairline)] bg-white px-2 py-1 text-xs font-medium text-[var(--apple-subink)] transition-colors hover:bg-[var(--apple-track)]"
                                data-testid={`button-invite-catalog-payee-${p.payeeKey}`}
                              >
                                <UserPlus className="h-3.5 w-3.5" /> Invite
                              </button>
                            )}
                            {p.inviteStatus === "not_invited" && p.ownerKind === null && (
                              <span
                                className="text-xs text-[var(--apple-faint)]"
                                title="Link this payee to a person or organization to enable invites"
                              >
                                no linked entity
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <InvitePublisherDialog
              open={invitePayee !== null}
              onClose={() => setInvitePayee(null)}
              payeeKey={invitePayee?.key ?? ""}
              displayName={invitePayee?.name ?? "this payee"}
            />

            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Releases</h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--apple-hairline)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--apple-hairline)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
                    <th className="px-4 py-2.5 font-medium">Release</th>
                    <th className="px-4 py-2.5 text-right font-medium">Units</th>
                    <th className="px-4 py-2.5 text-right font-medium">Owed</th>
                    <th className="px-4 py-2.5 text-center font-medium">Payees</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-6 text-[var(--apple-faint)]" colSpan={5}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && data && data.albums.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <AdminEmptyState>
                          No albums carry publishing splits yet. Add splits on a song's Splits panel to see them here.
                        </AdminEmptyState>
                      </td>
                    </tr>
                  )}
                  {data?.albums.map((a) => (
                    <tr
                      key={a.albumId}
                      className="border-b border-[var(--apple-hairline)] last:border-0 hover:bg-[var(--apple-track)]"
                      data-testid={`row-publishing-${a.albumId}`}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/publishing/albums/${a.albumId}`} className="flex items-center gap-3 text-[var(--apple-ink)] transition-colors hover:text-[color:var(--brand-blue)]" data-testid={`link-publishing-${a.albumId}`}>
                          {a.artwork ? (
                            <img
                              src={a.artwork}
                              alt=""
                              className="h-9 w-9 flex-none rounded object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 flex-none rounded bg-[var(--apple-track)]" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.title}</span>
                            {a.artist && (
                              <span className="block truncate text-xs text-[var(--apple-subink)]">{a.artist}</span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--apple-subink)]">
                        {a.unitsPressed.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--apple-ink)]">
                        {dollars(a.totalCents)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-[var(--apple-subink)]">{a.payeeCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Flag icon={AlertTriangle} count={a.allocationIssueCount} label="allocation" />
                          <Flag icon={FileWarning} count={a.missingSplitCount} label="missing" />
                          {a.unpaidPayees > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-warning)]">
                              <Clock className="h-3 w-3" /> {a.unpaidPayees} awaiting onboarding
                            </span>
                          )}
                          {a.allocationIssueCount === 0 &&
                            a.missingSplitCount === 0 &&
                            a.unpaidPayees === 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--apple-ready)]/10 px-2 py-0.5 text-xs font-medium text-[var(--apple-ready)]">
                                <CheckCircle2 className="h-3 w-3" /> Clean
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}

function AlbumDetail({ albumId }: { albumId: string }) {
  const [unitsOverride, setUnitsOverride] = useState<string>("");
  const qs = unitsOverride.trim() !== "" ? `?unitsPressed=${encodeURIComponent(unitsOverride.trim())}` : "";
  const { data, isLoading, isError, error, refetch } = useQuery<AlbumSettlement>({
    queryKey: [`/api/admin/publishing/albums/${albumId}/settlement${qs}`],
    retry: false,
  });

  const cleanCount = useMemo(
    () => (data ? data.payees.filter((p) => p.payoutsEnabled).length : 0),
    [data],
  );

  return (
    <AdminFrame active="publishing">
      <div className="space-y-5">
        <Link href="/admin/publishing" className="inline-flex items-center gap-1.5 text-sm text-[var(--apple-subink)] transition-colors hover:text-[color:var(--brand-blue)]" data-testid="link-back-publishing">
          <ArrowLeft className="h-4 w-4" /> Publishing
        </Link>

        {isError && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load this album's settlement"
          />
        )}

        {!isError && (
          <>
            <div className="flex items-start gap-4">
              {data?.album.artwork ? (
                <img src={data.album.artwork} alt="" className="h-16 w-16 flex-none rounded-lg object-cover" />
              ) : (
                <div className="h-16 w-16 flex-none rounded-lg bg-[var(--apple-track)]" />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]" data-testid="text-album-title">
                  {data?.album.title ?? "…"}
                </h1>
                {data?.album.artist && <p className="text-sm text-[var(--apple-subink)]">{data.album.artist}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Units pressed</div>
                <input
                  type="number"
                  min={0}
                  value={unitsOverride}
                  placeholder={data ? String(data.unitsPressed) : "0"}
                  onChange={(e) => setUnitsOverride(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--apple-hairline)] px-2 py-1 text-lg font-semibold tabular-nums text-[var(--apple-ink)] focus:border-[color:var(--brand-blue)] focus:outline-none"
                  data-testid="input-units-pressed"
                />
                <div className="mt-1 text-xs text-[var(--apple-faint)]">Defaults to approved pressing runs.</div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Rate</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--apple-ink)]">
                  {data ? rateLabel(data.rateMicros) : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Total owed</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--apple-ink)]" data-testid="text-total-owed">
                  {data ? dollars(data.totalCents) : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Ready to pay</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--apple-ink)]">
                  {data ? `${cleanCount} / ${data.payees.length}` : "—"}
                </div>
              </div>
            </div>

            {(data?.allocationIssues.length || data?.songsMissingSplits.length) ? (
              <div className="rounded-2xl border border-[var(--apple-critical)]/30 bg-[var(--apple-critical-wash)] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--apple-critical)]">
                  <AlertTriangle className="h-4 w-4" /> Data needs attention before paying
                </div>
                <ul className="mt-2 space-y-1 text-sm text-[var(--apple-ink)]">
                  {data?.allocationIssues.map((i) => (
                    <li key={`alloc-${i.songId}`} data-testid={`issue-alloc-${i.songId}`}>
                      <span className="font-medium">{i.title}</span> — shares sum to {(i.totalBp / 100).toFixed(2)}%, not 100%
                    </li>
                  ))}
                  {data?.songsMissingSplits.map((s) => (
                    <li key={`missing-${s.songId}`} data-testid={`issue-missing-${s.songId}`}>
                      <span className="font-medium">{s.title}</span> — no publishing splits documented
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-[var(--apple-hairline)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--apple-hairline)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
                    <th className="px-4 py-2.5 font-medium">Payee</th>
                    <th className="px-4 py-2.5 text-right font-medium">Lines</th>
                    <th className="px-4 py-2.5 text-right font-medium">Owed</th>
                    <th className="px-4 py-2.5 font-medium">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-6 text-[var(--apple-faint)]" colSpan={4}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && data && data.payees.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <AdminEmptyState>
                          No payees. Add publishing splits with non-zero shares to settle this release.
                        </AdminEmptyState>
                      </td>
                    </tr>
                  )}
                  {data?.payees.map((p) => (
                    <tr
                      key={p.payeeKey}
                      className="border-b border-[var(--apple-hairline)] last:border-0 hover:bg-[var(--apple-track)]"
                      data-testid={`row-payee-${p.payeeKey}`}
                    >
                      <td className="px-4 py-3">
                        <Link href={payeeHref(p.payeeKey)} className="block transition-colors hover:text-[color:var(--brand-blue)]" data-testid={`link-album-payee-${p.payeeKey}`}>
                          <div className="font-medium text-[var(--apple-ink)]">{p.displayName}</div>
                          {p.payToName && (
                            <div className="text-xs text-[var(--apple-subink)]">administered by {p.payToName}</div>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--apple-subink)]">{p.lineCount}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-[var(--apple-ink)]">
                        {dollars(p.amountCents)}
                      </td>
                      <td className="px-4 py-3">
                        <PayoutStatusPill has={p.hasPayoutAccount} enabled={p.payoutsEnabled} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}

/**
 * Distribute totalCents across lines using the largest-remainder method so
 * the displayed per-line cents sum exactly to the catalog total. This keeps
 * the "round once per payee" settlement basis intact while giving each row a
 * whole-cent value that adds up correctly.
 *
 * Keyed by `lineId` (split-row UUID) — never `songId` — so a song with
 * multiple split lines routing to the same payee is handled correctly.
 */
function buildReconciledCentsMap(
  albums: PayeeStatement["albums"],
  totalCents: number,
): Map<string, number> {
  const allLines: { lineId: string; owedMicros: number }[] = [];
  for (const album of albums) {
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

function InvitePublisherDialog({
  open,
  onClose,
  payeeKey,
  displayName,
}: {
  open: boolean;
  onClose: () => void;
  payeeKey: string;
  displayName: string;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const invite = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/publishing/payee/invite", { payeeKey, email }),
    onSuccess: () => {
      toast({ title: "Invite sent", description: `An invite has been sent to ${email}.` });
      setEmail("");
      onClose();
      // Refresh the catalog list so the payee's invite-status column flips to
      // "Invite sent" without a manual reload.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishing/settlements"] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't send invite",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent data-testid="dialog-invite-publisher" className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_20px_48px_rgba(0,0,0,0.18)]">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Invite publisher portal access</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--apple-subink)]">
          Send an invite link to <span className="font-medium text-[var(--apple-ink)]">{displayName}</span>.
          They'll create an account and see only their own mechanical-royalty statement.
        </p>
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="publisher@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-invite-email"
            disabled={invite.isPending}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => invite.mutate()}
            disabled={invite.isPending || !email.trim()}
            data-testid="button-send-invite"
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayeeDetail({ payeeKey }: { payeeKey: string }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery<PayeeStatement>({
    queryKey: ["/api/admin/publishing/payee/statement", payeeKey],
    queryFn: () =>
      fetch(`/api/admin/publishing/payee/statement?payeeKey=${encodeURIComponent(payeeKey)}`, {
        credentials: "include",
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    retry: false,
  });

  // Apply largest-remainder so per-line display cents sum exactly to totalCents.
  const reconciledCents = useMemo(
    () => (data ? buildReconciledCentsMap(data.albums, data.totalCents) : new Map<string, number>()),
    [data],
  );

  return (
    <AdminFrame active="publishing">
      <div className="space-y-5">
        <Link href="/admin/publishing" className="inline-flex items-center gap-1.5 text-sm text-[var(--apple-subink)] transition-colors hover:text-[color:var(--brand-blue)]" data-testid="link-back-publishing">
          <ArrowLeft className="h-4 w-4" /> Publishing
        </Link>

        {isError && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load this payee's statement"
          />
        )}

        {!isError && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1
                  className="truncate text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]"
                  data-testid="text-payee-name"
                >
                  {data?.displayName ?? "…"}
                </h1>
                {data?.payToName && (
                  <p className="mt-0.5 text-sm text-[var(--apple-subink)]">
                    administered by {data.payToName}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {data && (
                  <PayoutStatusPill has={data.hasPayoutAccount} enabled={data.payoutsEnabled} />
                )}
                {data && data.ownerKind !== null && (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--apple-hairline)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--apple-subink)] transition-colors hover:bg-[var(--apple-track)]"
                    data-testid="button-invite-publisher"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Invite publisher
                  </button>
                )}
                {data && data.ownerKind === null && (
                  <span className="text-xs text-[var(--apple-faint)]" title="Link this payee to a person or organization to enable invites">
                    No linked entity — can't invite
                  </span>
                )}
              </div>
            </div>
            <InvitePublisherDialog
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              payeeKey={payeeKey}
              displayName={data?.displayName ?? "this payee"}
            />

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Total owed</div>
                <div
                  className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]"
                  data-testid="text-payee-total"
                >
                  {data ? dollars(data.totalCents) : "—"}
                </div>
                <div className="mt-1 text-xs text-[var(--apple-faint)]">rounded once across catalog</div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Track lines</div>
                <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]">
                  {data ? data.lineCount : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">Releases</div>
                <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)]">
                  {data ? data.albums.length : "—"}
                </div>
              </div>
            </div>

            {/* Album → track breakdown */}
            <div className="space-y-4">
              {isLoading && (
                <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white px-4 py-6 text-sm text-[var(--apple-faint)]">
                  Loading…
                </div>
              )}
              {data?.albums.map((album) => {
                const albumLineCents = album.lines.reduce(
                  (s, l) => s + (reconciledCents.get(l.songId) ?? 0),
                  0,
                );
                return (
                  <div
                    key={album.albumId}
                    className="overflow-hidden rounded-2xl border border-[var(--apple-hairline)] bg-white"
                    data-testid={`section-album-${album.albumId}`}
                  >
                    {/* Album header row */}
                    <div className="flex items-center gap-3 border-b border-[var(--apple-hairline)] px-4 py-3">
                      {album.artwork ? (
                        <img
                          src={album.artwork}
                          alt=""
                          className="h-9 w-9 flex-none rounded object-cover"
                        />
                      ) : (
                        <div className="h-9 w-9 flex-none rounded bg-[var(--apple-track)]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/publishing/albums/${album.albumId}`} className="block truncate font-medium text-[var(--apple-ink)] transition-colors hover:text-[color:var(--brand-blue)]" data-testid={`link-payee-album-${album.albumId}`}>
                          {album.title}
                        </Link>
                        {album.artist && (
                          <div className="truncate text-xs text-[var(--apple-subink)]">{album.artist}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-[var(--apple-ink)]">
                          {dollars(albumLineCents)}
                        </div>
                        <div className="text-xs text-[var(--apple-subink)]">
                          {album.unitsPressed.toLocaleString()} units
                        </div>
                      </div>
                    </div>

                    {/* Per-track lines: units × split % = owed */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--apple-hairline)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
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
                            className="border-b border-[var(--apple-hairline)] last:border-0"
                            data-testid={`row-payee-line-${line.lineId}`}
                          >
                            <td className="px-4 py-2.5 text-[var(--apple-ink)]">{line.songTitle}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[var(--apple-subink)]">
                              {album.unitsPressed.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[var(--apple-subink)]">
                              {(line.splitBp / 100).toFixed(2)}%
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-[var(--apple-ink)]">
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
          </>
        )}
      </div>
    </AdminFrame>
  );
}

export function AdminPublishing() {
  const [matchPayee] = useRoute("/admin/publishing/payee");
  const [matchDetail, params] = useRoute("/admin/publishing/albums/:albumId");
  const search = useSearch();

  if (matchPayee) {
    const key = new URLSearchParams(search).get("key") ?? "";
    if (key) return <PayeeDetail payeeKey={key} />;
  }
  if (matchDetail && params?.albumId) {
    return <AlbumDetail albumId={params.albumId} />;
  }
  return <CatalogList />;
}
