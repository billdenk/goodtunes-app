import { useQuery } from "@tanstack/react-query";

type LedgerAlbum = {
  albumId: string;
  title: string;
  coverUrl: string | null;
  artistId: string | null;
  artistName: string | null;
  perUnitCents: number | null;
  unitsSold: number;
  expectedCents: number;
  paidCents: number;
};

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function NpoAlbumLedger({ npoId }: { npoId: string }) {
  const q = useQuery<{ albums: LedgerAlbum[] }>({
    queryKey: ["/api/non-profit", npoId, "album-ledger"],
    queryFn: async () => {
      const r = await fetch(`/api/non-profit/${npoId}/album-ledger`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  if (q.isLoading) {
    return (
      <div className="text-sm text-white/55" data-testid="npo-ledger-loading">
        Loading album ledger…
      </div>
    );
  }

  const albums = q.data?.albums ?? [];
  if (albums.length === 0) {
    return (
      <div
        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/55"
        data-testid="npo-ledger-empty"
      >
        No albums are donating to your organization yet.
      </div>
    );
  }

  const totalExpected = albums.reduce((s, a) => s + a.expectedCents, 0);
  const totalPaid = albums.reduce((s, a) => s + a.paidCents, 0);

  return (
    <div className="space-y-3" data-testid="npo-ledger">
      <div className="flex flex-wrap gap-4 text-xs text-white/55">
        <span data-testid="text-ledger-total-expected">
          Pending: <span className="font-semibold text-white tabular-nums">{fmt(totalExpected)}</span>
        </span>
        <span data-testid="text-ledger-total-paid">
          Paid: <span className="font-semibold text-white tabular-nums">{fmt(totalPaid)}</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.04] text-left text-xs text-white/50">
              <th className="px-3 py-2 font-medium">Album</th>
              <th className="px-3 py-2 font-medium text-right">Per unit</th>
              <th className="px-3 py-2 font-medium text-right">Units</th>
              <th className="px-3 py-2 font-medium text-right">Pending</th>
              <th className="px-3 py-2 font-medium text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {albums.map((a) => (
              <tr
                key={a.albumId}
                className="border-t border-white/5"
                data-testid={`row-ledger-${a.albumId}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {a.coverUrl ? (
                      <img
                        src={a.coverUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded bg-white/10" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white" data-testid={`text-ledger-title-${a.albumId}`}>
                        {a.title}
                      </div>
                      {a.artistName && (
                        <div className="truncate text-xs text-white/50">{a.artistName}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">
                  {a.perUnitCents != null ? fmt(a.perUnitCents) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{a.unitsSold}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{fmt(a.expectedCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{fmt(a.paidCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default NpoAlbumLedger;
