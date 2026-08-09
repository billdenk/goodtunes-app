import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ListMusic } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

// Task #338 — Admin playlist detail.
// Read-only view of any customer playlist. Surfaced from the global
// admin search; lets an operator open a playlist by name without
// having to first find its owner.

type PlaylistDetail = {
  id: string;
  name: string;
  createdAt: string | null;
  owner: { id: string; displayName: string; email: string } | null;
  songs: Array<{
    id: string;
    title: string;
    trackNumber: number;
    duration: number;
    position: number;
    album: { id: string; title: string; artist: string; artwork: string };
  }>;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AdminPlaylist() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/playlists/:id");
  const id = params?.id;

  const { data, isLoading, error } = useQuery<PlaylistDetail>({
    queryKey: ["/api/admin/playlists", id],
    enabled: !!user?.isAdmin && !!id,
  });

  if (authLoading) {
    return (
      <AdminFrame active="customers">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[color:var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-[var(--apple-track)] flex items-center justify-center p-8">
        <p className="text-[var(--apple-subink)] text-sm">Admin only.</p>
      </main>
    );
  }
  if (isLoading) {
    return (
      <AdminFrame active="customers">
        <div className="py-10 text-[var(--apple-subink)] text-sm">Loading…</div>
      </AdminFrame>
    );
  }
  if (error || !data) {
    return (
      <AdminFrame active="customers">
        <div className="space-y-4">
          <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-[var(--apple-subink)] hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid="link-back-to-customers">
            <ArrowLeft className="w-3.5 h-3.5" /> Customers
          </Link>
          <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white" data-testid="text-playlist-not-found">
            <AdminEmptyState>Playlist not found.</AdminEmptyState>
          </div>
        </div>
      </AdminFrame>
    );
  }

  // Task #2533 — stamp the playlist origin onto the owner link so the
  // customer page's back-crumb returns here instead of "← Customers".
  const ownerHref = data.owner
    ? `/admin/customers/${data.owner.id}?from=partner&backHref=${encodeURIComponent(`/admin/playlists/${id}`)}&backName=${encodeURIComponent(data.name)}`
    : "/admin/customers";

  return (
    <AdminFrame active="customers" contentWidth="wide">
      <div className="space-y-6" data-testid="page-admin-playlist">
        <Link href={ownerHref} className="inline-flex items-center gap-1.5 text-sm text-[var(--apple-subink)] hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid="link-back-to-owner">
          <ArrowLeft className="w-3.5 h-3.5" />
          {data.owner ? data.owner.displayName : "Customers"}
        </Link>

        {/* FLAGGED: detail page with icon/artwork header — h1 restyled in place
            to Apple-canon (30px semibold ink) instead of AdminPageHeader. */}
        <header className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-lg bg-[var(--apple-chip)] flex items-center justify-center flex-shrink-0">
            <ListMusic className="w-7 h-7 text-[var(--apple-faint)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)] truncate" data-testid="text-playlist-name">
              {data.name}
            </h1>
            <p className="text-[var(--apple-subink)] text-sm mt-0.5" data-testid="text-playlist-meta">
              {data.songs.length} song{data.songs.length === 1 ? "" : "s"}
              {" · "}created {formatDate(data.createdAt)}
              {data.owner && (
                <>
                  {" · by "}
                  <Link href={ownerHref} className="text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid="link-playlist-owner">
                    {data.owner.displayName}
                  </Link>
                </>
              )}
            </p>
          </div>
        </header>

        {data.songs.length === 0 ? (
          <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white" data-testid="state-playlist-empty">
            <AdminEmptyState>This playlist is empty.</AdminEmptyState>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white divide-y divide-[var(--apple-hairline)] overflow-hidden" data-testid="list-playlist-songs">
            {data.songs.map((s, idx) => (
              <Link key={s.id} href={`/admin/albums/${s.album.id}?track=${s.id}`} className="px-4 py-3 flex items-center gap-3 text-inherit hover:bg-[var(--apple-track)] transition-colors" data-testid={`row-playlist-song-${s.id}`}>
                <span className="w-6 text-right text-[var(--apple-faint)] text-xs tabular-nums flex-shrink-0">{idx + 1}</span>
                <img
                  src={s.album.artwork}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[var(--apple-ink)] text-sm font-medium truncate">{s.title}</div>
                  <div className="text-[var(--apple-subink)] text-xs truncate">
                    {s.album.artist} · {s.album.title}
                  </div>
                </div>
                <span className="text-[var(--apple-faint)] text-xs tabular-nums flex-shrink-0">
                  {formatDuration(s.duration)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
