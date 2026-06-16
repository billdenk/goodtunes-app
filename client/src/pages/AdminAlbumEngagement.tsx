// AdminAlbumEngagement — per-release dashboard (Task #49, step 8).
// Summarizes redemptions (paid/refunded, direct vs Shopify split), fans
// reached, plays-per-fan, and top played songs for one album.
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";

type Engagement = {
  redemptions: { paid: number; refunded: number; direct: number; shopify: number };
  fansReached: number;
  playsPerFan: number;
  topSongs: { songId: string; plays: number }[];
  recentBuyers: { email: string | null; createdAt: string | null }[];
};

type Album = { id: string; title: string; artist: string; artwork: string | null };
type Song = { id: string; title: string; albumId: string };

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{label}</div>
      <div className="text-3xl font-bold text-slate-900 mt-1">{value}</div>
      {sub && <div className="text-[12px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export function AdminAlbumEngagement() {
  return (
    <AdminErrorBoundary title="Engagement failed to render">
      <AdminAlbumEngagementInner />
    </AdminErrorBoundary>
  );
}

function AdminAlbumEngagementInner() {
  const [, params] = useRoute<{ id: string }>("/admin/albums/:id/engagement");
  const albumId = params?.id ?? "";

  const { data: album } = useQuery<Album>({ queryKey: ["/api/albums", albumId] });
  const { data: songs } = useQuery<Song[]>({ queryKey: ["/api/albums", albumId, "songs"] });
  const {
    data,
    isLoading,
    isError: engagementError,
    error: engagementErrorObj,
    refetch: refetchEngagement,
  } = useQuery<Engagement>({ queryKey: ["/api/admin/albums", albumId, "engagement"] });

  const songTitle = (id: string) => songs?.find((s) => s.id === id)?.title ?? id.slice(0, 8);

  return (
    <AdminFrame active="albums" contentWidth="narrow">
      <div data-testid="page-album-engagement">
        <Link href={`/admin/albums/${albumId}`} className="text-[12px] text-slate-500 hover:text-slate-700">
          ← Back to album
        </Link>
        <div className="flex items-center gap-4 mt-4 mb-8">
          {album?.artwork && <img src={album.artwork} alt={album.title} className="w-16 h-16 rounded-lg object-cover" />}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{album?.title ?? "Album"}</h1>
            <p className="text-slate-500 text-sm">{album?.artist}</p>
          </div>
        </div>

        {isLoading && <div className="text-slate-400 text-sm">Loading engagement…</div>}
        {engagementError && (
          <ErrorState
            error={engagementErrorObj}
            onRetry={() => refetchEngagement()}
            title="Couldn't load engagement"
            testId="album-engagement-error"
          />
        )}
        {data && !engagementError && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <Stat
                label="Redemptions"
                value={data.redemptions.paid}
                sub={`${data.redemptions.direct} direct · ${data.redemptions.shopify} Shopify`}
              />
              <Stat label="Fans reached" value={data.fansReached} />
              <Stat label="Plays per fan" value={data.playsPerFan} />
              <Stat label="Refunded" value={data.redemptions.refunded} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
              <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Top songs</h2>
              {data.topSongs.length === 0 && (
                <div className="text-slate-400 text-[13px] py-2">No plays yet.</div>
              )}
              <ol className="divide-y divide-slate-100">
                {data.topSongs.map((s, i) => (
                  <li key={s.songId} className="flex items-center gap-3 py-2.5" data-testid={`top-song-${s.songId}`}>
                    <div className="w-6 text-slate-400 text-[12px] font-mono text-right">{i + 1}</div>
                    <div className="flex-1 truncate text-[14px] text-slate-900">{songTitle(s.songId)}</div>
                    <div className="text-[12px] text-slate-500 tabular-nums">{s.plays.toLocaleString()} plays</div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[15px] font-semibold text-slate-900">Recent buyers</h2>
                <Link
                  href={`/admin/albums/${albumId}/buyers`}
                  className="text-xs font-medium hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                  data-testid="link-view-all-buyers"
                >
                  View all buyers →
                </Link>
              </div>
              {data.recentBuyers.length === 0 && (
                <div className="text-slate-400 text-[13px] py-2">No purchases yet.</div>
              )}
              <ol className="divide-y divide-slate-100">
                {data.recentBuyers.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <div className="flex-1 min-w-0 truncate text-slate-900">{b.email ?? "—"}</div>
                    <div className="text-[12px] text-slate-500">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : ""}</div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </AdminFrame>
  );
}
