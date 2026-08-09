// AdminAlbumEngagement — per-release dashboard (Task #49, step 8).
// Summarizes redemptions (paid/refunded, direct vs Shopify split), fans
// reached, plays-per-fan, and top played songs for one album.
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

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
    <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">{label}</div>
      <div className="text-[28px] font-semibold tabular-nums tracking-tight text-[var(--apple-ink)] mt-1">{value}</div>
      {sub && <div className="text-[12px] text-[var(--apple-subink)] mt-1">{sub}</div>}
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
    <AdminFrame active="albums" contentWidth="wide">
      <div data-testid="page-album-engagement">
        <Link href={`/admin/albums/${albumId}`} className="text-[12px] text-[var(--apple-subink)] hover:text-[var(--brand-blue)] hover:underline">
          ← Back to album
        </Link>
        {/* FLAGGED: detail page with artwork header — h1 restyled in place to
            Apple-canon (30px semibold ink) rather than AdminPageHeader, which
            is for index pages without adjacent artwork. */}
        <div className="flex items-center gap-4 mt-4 mb-8">
          {album?.artwork && <img src={album.artwork} alt={album.title} className="w-16 h-16 rounded-lg object-cover" />}
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]">{album?.title ?? "Album"}</h1>
            <p className="text-[var(--apple-subink)] text-sm">{album?.artist}</p>
          </div>
        </div>

        {isLoading && <div className="text-[var(--apple-faint)] text-sm">Loading engagement…</div>}
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

            <section className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-5 mb-6">
              <h2 className="text-[15px] font-semibold text-[var(--apple-ink)] mb-3">Top songs</h2>
              {data.topSongs.length === 0 && (
                <AdminEmptyState>No plays yet.</AdminEmptyState>
              )}
              <ol className="divide-y divide-[var(--apple-hairline)]">
                {data.topSongs.map((s, i) => (
                  <li key={s.songId} className="flex items-center gap-3 py-2.5" data-testid={`top-song-${s.songId}`}>
                    <div className="w-6 text-[var(--apple-faint)] text-[12px] font-mono text-right">{i + 1}</div>
                    <div className="flex-1 truncate text-[14px] text-[var(--apple-ink)]">{songTitle(s.songId)}</div>
                    <div className="text-[12px] text-[var(--apple-subink)] tabular-nums">{s.plays.toLocaleString()} plays</div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[15px] font-semibold text-[var(--apple-ink)]">Recent buyers</h2>
                <Link
                  href={`/admin/albums/${albumId}/buyers`}
                  className="text-xs font-medium hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                  data-testid="link-view-all-buyers"
                >
                  View all buyers →
                </Link>
              </div>
              {data.recentBuyers.length === 0 && (
                <AdminEmptyState>No purchases yet.</AdminEmptyState>
              )}
              <ol className="divide-y divide-[var(--apple-hairline)]">
                {data.recentBuyers.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <div className="flex-1 min-w-0 truncate text-[var(--apple-ink)]">{b.email ?? "—"}</div>
                    <div className="text-[12px] text-[var(--apple-subink)]">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : ""}</div>
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
