import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ListMusic } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";

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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }
  if (isLoading) {
    return (
      <AdminFrame active="customers">
        <div className="py-10 text-slate-500 text-sm">Loading…</div>
      </AdminFrame>
    );
  }
  if (error || !data) {
    return (
      <AdminFrame active="customers">
        <div className="space-y-4">
          <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid="link-back-to-customers">
            <ArrowLeft className="w-3.5 h-3.5" /> Customers
          </Link>
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm" data-testid="text-playlist-not-found">
            Playlist not found.
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
        <Link href={ownerHref} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid="link-back-to-owner">
          <ArrowLeft className="w-3.5 h-3.5" />
          {data.owner ? data.owner.displayName : "Customers"}
        </Link>

        <header className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <ListMusic className="w-7 h-7 text-slate-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900 truncate" data-testid="text-playlist-name">
              {data.name}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5" data-testid="text-playlist-meta">
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
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm" data-testid="state-playlist-empty">
            This playlist is empty.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden" data-testid="list-playlist-songs">
            {data.songs.map((s, idx) => (
              <Link key={s.id} href={`/admin/albums/${s.album.id}?track=${s.id}`} className="px-4 py-3 flex items-center gap-3 text-inherit hover:bg-slate-50 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid={`row-playlist-song-${s.id}`}>
                <span className="w-6 text-right text-slate-400 text-xs tabular-nums flex-shrink-0">{idx + 1}</span>
                <img
                  src={s.album.artwork}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-900 text-sm font-medium truncate">{s.title}</div>
                  <div className="text-slate-500 text-xs truncate">
                    {s.album.artist} · {s.album.title}
                  </div>
                </div>
                <span className="text-slate-400 text-xs tabular-nums flex-shrink-0">
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
