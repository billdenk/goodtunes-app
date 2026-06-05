// Publishing — mechanical-settlement section.
//
// Two surfaces, branched by route:
//   /admin/publishing                       catalog-wide roll-up (this list)
//   /admin/publishing/albums/:albumId       per-payee breakdown for one album
//
// The mechanical settlement pays each publisher/writer on the basis Bill
// confirmed: statutoryRate ($0.127/unit) × unitsPressed × split%. This
// section is the transparency surface — a publisher can see exactly what
// they're owed and whether they've onboarded to be paid, and the operator
// can see, per song, whether the splits are documented and sum to 100%.
//
// Engine: server/publishingSettlement.ts. API: server/publishingSettlementRoutes.ts.
import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileWarning,
} from "lucide-react";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type SettlementsList = {
  rateMicros: number;
  totalCents: number;
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

function rateLabel(rateMicros: number) {
  return `$${(rateMicros / 1_000_000).toFixed(3)}/unit`;
}

function PayoutStatusPill({ has, enabled }: { has: boolean; enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Ready to pay
      </span>
    );
  }
  if (has) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Clock className="h-3 w-3" /> Onboarding
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      <Clock className="h-3 w-3" /> Not onboarded
    </span>
  );
}

function Flag({ icon: Icon, count, label }: { icon: typeof AlertTriangle; count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
      title={label}
    >
      <Icon className="h-3 w-3" /> {count} {label}
    </span>
  );
}

function CatalogList() {
  const { data, isLoading, isError, error, refetch } = useQuery<SettlementsList>({
    queryKey: ["/api/admin/publishing/settlements"],
    retry: false,
  });

  return (
    <AdminFrame active="publishing">
      <div className="space-y-5">
        <AdminPageHeader
          title="Publishing"
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="stat-total-owed">
                <div className="text-xs uppercase tracking-wide text-slate-500">Total owed</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {data ? dollars(data.totalCents) : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="stat-albums">
                <div className="text-xs uppercase tracking-wide text-slate-500">Albums with splits</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {data ? data.albums.length : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="stat-rate">
                <div className="text-xs uppercase tracking-wide text-slate-500">Statutory rate</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {data ? rateLabel(data.rateMicros) : "—"}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
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
                      <td className="px-4 py-6 text-slate-400" colSpan={5}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && data && data.albums.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={5}>
                        No albums carry publishing splits yet. Add splits on a song's Splits panel to see them here.
                      </td>
                    </tr>
                  )}
                  {data?.albums.map((a) => (
                    <tr
                      key={a.albumId}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      data-testid={`row-publishing-${a.albumId}`}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/admin/publishing/albums/${a.albumId}`} className="flex items-center gap-3 text-slate-900 transition-colors hover:text-[color:var(--brand-blue)]" data-testid={`link-publishing-${a.albumId}`}>
                          {a.artwork ? (
                            <img
                              src={a.artwork}
                              alt=""
                              className="h-9 w-9 flex-none rounded object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 flex-none rounded bg-slate-100" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.title}</span>
                            {a.artist && (
                              <span className="block truncate text-xs text-slate-500">{a.artist}</span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {a.unitsPressed.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {dollars(a.totalCents)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-700">{a.payeeCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Flag icon={AlertTriangle} count={a.allocationIssueCount} label="allocation" />
                          <Flag icon={FileWarning} count={a.missingSplitCount} label="missing" />
                          {a.unpaidPayees > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              <Clock className="h-3 w-3" /> {a.unpaidPayees} awaiting onboarding
                            </span>
                          )}
                          {a.allocationIssueCount === 0 &&
                            a.missingSplitCount === 0 &&
                            a.unpaidPayees === 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
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
        <Link href="/admin/publishing" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-[color:var(--brand-blue)]" data-testid="link-back-publishing">
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
                <div className="h-16 w-16 flex-none rounded-lg bg-slate-100" />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-900" data-testid="text-album-title">
                  {data?.album.title ?? "…"}
                </h1>
                {data?.album.artist && <p className="text-sm text-slate-500">{data.album.artist}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Units pressed</div>
                <input
                  type="number"
                  min={0}
                  value={unitsOverride}
                  placeholder={data ? String(data.unitsPressed) : "0"}
                  onChange={(e) => setUnitsOverride(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-lg font-semibold tabular-nums text-slate-900 focus:border-[color:var(--brand-blue)] focus:outline-none"
                  data-testid="input-units-pressed"
                />
                <div className="mt-1 text-xs text-slate-400">Defaults to approved pressing runs.</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Rate</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {data ? rateLabel(data.rateMicros) : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Total owed</div>
                <div className="mt-1 text-lg font-semibold text-slate-900" data-testid="text-total-owed">
                  {data ? dollars(data.totalCents) : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">Ready to pay</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {data ? `${cleanCount} / ${data.payees.length}` : "—"}
                </div>
              </div>
            </div>

            {(data?.allocationIssues.length || data?.songsMissingSplits.length) ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-rose-800">
                  <AlertTriangle className="h-4 w-4" /> Data needs attention before paying
                </div>
                <ul className="mt-2 space-y-1 text-sm text-rose-700">
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

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Payee</th>
                    <th className="px-4 py-2.5 text-right font-medium">Lines</th>
                    <th className="px-4 py-2.5 text-right font-medium">Owed</th>
                    <th className="px-4 py-2.5 font-medium">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={4}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && data && data.payees.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={4}>
                        No payees. Add publishing splits with non-zero shares to settle this release.
                      </td>
                    </tr>
                  )}
                  {data?.payees.map((p) => (
                    <tr
                      key={p.payeeKey}
                      className="border-b border-slate-100 last:border-0"
                      data-testid={`row-payee-${p.payeeKey}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{p.displayName}</div>
                        {p.payToName && (
                          <div className="text-xs text-slate-500">administered by {p.payToName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{p.lineCount}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
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

export function AdminPublishing() {
  const [matchDetail, params] = useRoute("/admin/publishing/albums/:albumId");
  if (matchDetail && params?.albumId) {
    return <AlbumDetail albumId={params.albumId} />;
  }
  return <CatalogList />;
}
