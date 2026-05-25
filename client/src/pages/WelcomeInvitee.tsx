import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function WelcomeInvitee() {
  const role = useQuery<{ role: string | null; roleScopeId: string | null; scopeName: string | null }>({
    queryKey: ["/api/me/role"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/me/role");
        return r.json();
      } catch {
        return { role: null, roleScopeId: null, scopeName: null };
      }
    },
    retry: false,
  });
  const scopeName = role.data?.scopeName || "your artist";
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8" data-testid="welcome-invitee">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to GoodTunes</h1>
        <p className="text-sm text-slate-600 mb-6">
          You're signed in for <span className="font-semibold">{scopeName}</span>. There's nothing waiting in the queue yet — here's where to start.
        </p>
        <div className="space-y-3">
          <Link href="/artist" className="block w-full text-center bg-[var(--brand-blue)] hover:opacity-90 text-white font-semibold rounded-lg py-2.5" data-testid="link-go-artist-dashboard">
            Open the artist dashboard
          </Link>
          <Link href="/admin/albums" className="block w-full text-center border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold rounded-lg py-2.5" data-testid="link-go-albums">
            Browse albums
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-500 text-center">
          When someone on the team starts an album draft, it'll show up on the dashboard for you to work on together.
        </p>
      </div>
    </main>
  );
}
