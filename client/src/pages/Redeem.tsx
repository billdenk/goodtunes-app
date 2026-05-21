// Redeem — fan-facing landing for a Shopify-minted redemption code
// (Task #49, step 6). The album was already unlocked at webhook time
// against the email on the Shopify order; this page just signs the fan
// into that customer_users row (or promotes the stub if it has no
// password yet) so they can drop into the player.
import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, setAuthToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

type Resolution = {
  code: string;
  redeemedAt: string | null;
  order: { id: string; goodDeedNumber: number | null; buyerName: string | null; buyerEmail: string | null };
  album: { id: string; title: string; artist: string; artwork: string | null } | null;
  customer: { email: string; displayName: string; hasPassword: boolean } | null;
  store: { id: string; name: string } | null;
};

export function Redeem() {
  const [, params] = useRoute<{ code: string }>("/redeem/:code");
  const [, navigate] = useLocation();
  const { user, login, isLoginPending } = useAuth();
  const { toast } = useToast();
  const code = params?.code ?? "";

  const { data, isLoading, error } = useQuery<Resolution>({
    queryKey: ["/api/shopify/redemption", code],
  });

  const [mode, setMode] = useState<"signin" | "create">("create");
  const [password, setPassword] = useState("");
  const [claimDone, setClaimDone] = useState(false);

  const claim = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/shopify/redemption/${code}/claim`);
      return r.json();
    },
    onSuccess: () => {
      setClaimDone(true);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-albums"] });
    },
    onError: (e: any) => toast({ title: "Couldn't claim", description: e?.message, variant: "destructive" }),
  });

  // Once the user is signed in, run claim automatically — they've already
  // proven identity, no extra tap required.
  useEffect(() => {
    if (user && data && !claim.isPending && !claim.isSuccess && !claimDone) {
      claim.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, data?.code]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin text-[#319ED8]" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-white text-2xl font-bold mb-2">Code not found</h1>
          <p className="text-white/60 text-sm mb-6">
            That redemption code is invalid, expired, or the order was refunded.
          </p>
          <Link href="/" className="inline-block px-5 py-2.5 rounded-full bg-[#319ED8] text-white text-sm font-medium">
            Back to GoodTunes
          </Link>
        </div>
      </main>
    );
  }

  const album = data.album;
  const prefilledEmail = data.customer?.email ?? data.order.buyerEmail ?? "";
  const prefilledName = data.customer?.displayName ?? data.order.buyerName ?? "";

  // Signed in + claim done → success card with a deep-link into the album.
  if (user && (claim.isSuccess || claimDone)) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center text-white" data-testid="redeem-success">
          {album?.artwork && (
            <img src={album.artwork} alt={album.title} className="w-40 h-40 mx-auto rounded-2xl shadow-2xl mb-5 object-cover" />
          )}
          <div className="flex items-center justify-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-[#4AFFCA]" />
            <span className="text-[#4AFFCA] text-[12px] uppercase tracking-wider font-bold">Unlocked</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">{album?.title}</h1>
          <p className="text-white/70 text-sm mb-3">{album?.artist}</p>
          {data.order.goodDeedNumber != null && (
            <p className="text-white/80 text-[13px] mb-6">
              GoodDeed <span className="font-mono font-bold text-[#4AFFCA]">#{data.order.goodDeedNumber}</span>
            </p>
          )}
          <button
            onClick={() => navigate(album ? `/album/${album.id}` : "/collection")}
            className="w-full h-12 rounded-full bg-gradient-to-br from-[#1D5E8F] to-[#319ED8] text-white font-semibold"
            data-testid="button-redeem-play"
          >
            Play now
          </button>
          <Link href="/collection" className="block mt-3 text-white/55 text-[13px]">
            Open your collection
          </Link>
        </div>
      </main>
    );
  }

  // Signed in, claim in flight → spinner.
  if (user) {
    return (
      <main className="min-h-screen bg-[#00062B] flex items-center justify-center text-white">
        <Loader2 className="w-6 h-6 animate-spin text-[#319ED8]" />
      </main>
    );
  }

  // Unauthenticated: present sign-in / create-password to claim. We use
  // the email Shopify gave us; the fan only types a password (or signs in
  // if the matched customer_users row already had one).
  // The reserved customer_users row is a stub when the webhook hasn't
  // yet been promoted — password is null. Routing through /api/register
  // would 409 on the duplicate email, so we go through a dedicated
  // /set-password endpoint that promotes the stub atomically using the
  // redemption code as proof.
  const needsExisting = !!data.customer?.hasPassword;
  const setStubPassword = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/shopify/redemption/${code}/set-password`, { password });
      return r.json() as Promise<{ token: string; user: { id: string; email: string; username: string; displayName: string } }>;
    },
    onSuccess: (resp) => {
      // Mirror useAuth's loginMutation onSuccess so the rest of the
      // page sees us as signed in — token in storage, /api/me primed.
      setAuthToken(resp.token);
      queryClient.setQueryData(["/api/me"], resp.user);
      queryClient.invalidateQueries();
    },
    onError: (e: any) => toast({ title: "Couldn't set password", description: e?.message, variant: "destructive" }),
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsExisting || mode === "signin") {
      await login({ username: prefilledEmail, password });
    } else {
      // Stub-promotion path. The endpoint sets the password, returns an
      // auth token, and the useEffect above then runs /claim.
      await setStubPassword.mutateAsync();
    }
  };

  return (
    <main className="min-h-screen bg-[#00062B] text-white px-6 py-10">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          {album?.artwork && (
            <img src={album.artwork} alt={album.title} className="w-32 h-32 mx-auto rounded-xl shadow-xl mb-4 object-cover" />
          )}
          <div className="text-[11px] uppercase tracking-wider text-[#4AFFCA] font-bold mb-1">
            {data.store?.name ? `From ${data.store.name}` : "Shopify redemption"}
          </div>
          <h1 className="text-2xl font-bold">{album?.title}</h1>
          <p className="text-white/70 text-sm">{album?.artist}</p>
        </div>

        <form onSubmit={submit} className="space-y-4" data-testid="form-redeem">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/55 font-semibold block mb-1">Email</label>
            <input
              type="email"
              value={prefilledEmail}
              readOnly
              className="w-full h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-[14px] text-white/85"
              data-testid="input-redeem-email"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/55 font-semibold block mb-1">
              {needsExisting || mode === "signin" ? "Your password" : "Pick a password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="w-full h-11 rounded-lg bg-white/5 border border-white/10 px-3 text-[14px] text-white focus:outline-none focus:border-[#319ED8]"
              data-testid="input-redeem-password"
            />
          </div>
          <button
            type="submit"
            disabled={isLoginPending || setStubPassword.isPending || !password}
            className="w-full h-12 rounded-full bg-gradient-to-br from-[#1D5E8F] to-[#319ED8] text-white font-semibold disabled:opacity-50"
            data-testid="button-redeem-submit"
          >
            {isLoginPending || setStubPassword.isPending ? "Unlocking…" : needsExisting || mode === "signin" ? "Sign in & unlock" : "Create account & unlock"}
          </button>
          {!needsExisting && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "create" : "signin")}
                className="text-white/55 text-[13px] underline-offset-2 hover:underline"
                data-testid="button-redeem-toggle"
              >
                {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
