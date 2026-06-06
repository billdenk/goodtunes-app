// GiftClaim — public landing page for /gift/:token (Task #46).
//
// The buyer shares this URL with the recipient via copy/paste or
// (eventually) email/SMS. The page:
//   1. Fetches a sanitized projection of the gift via GET /api/gifts/:token
//      (no recipient contact details leak out).
//   2. If the visitor is signed in as a customer, shows a "Claim my gift"
//      CTA that POSTs the claim — backend reassigns the order +
//      user_albums entitlement so the certificate prints in the
//      claimer's verified name.
//   3. If not signed in, sends them through /login?next=/gift/:token so
//      they come straight back here after auth and can claim.
import { useEffect, useState } from "react";
import { useLocation, useParams, useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type GiftPublic = {
  token: string;
  album: { id: string; title: string; artist: string; artwork: string };
  buyerName: string | null;
  recipientFirstName: string;
  recipientLastName: string;
  // Task #550 — optional gift-card message + scheduled delivery state.
  // `delivered` is true when there's no schedule OR the deliver-on
  // date has arrived; the claim button stays disabled when false.
  message: string | null;
  deliverOn: string | null;
  delivered: boolean;
  deliveredAt: string | null;
  reverted: boolean;
  claimed: boolean;
  claimedAt: string | null;
  expired: boolean;
  expiresAt: string;
};

export function GiftClaim() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<GiftPublic>({
    queryKey: ["/api/gifts", token],
  });

  const claim = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/gifts/${token}/claim`, {});
      return (await r.json()) as { albumId: string | null };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast({ title: "Gift claimed", description: "Your album is in your library — and the certificate is in your name." });
      if (res.albumId) navigate(`/album/${res.albumId}`);
      else navigate("/home");
    },
    onError: (e: any) => toast({ title: "Couldn't claim", description: e?.message, variant: "destructive" }),
  });

  // Stash the deep link target so post-auth /login can bounce us back.
  useEffect(() => {
    try {
      sessionStorage.setItem("gt:postAuthNext", `/gift/${token}`);
    } catch {}
  }, [token]);

  if (isLoading || authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#00062B] text-white px-6" data-testid="gift-claim-loading">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-[#319ED8] animate-spin" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#00062B] text-white px-6">
        <div className="text-center max-w-sm" data-testid="gift-claim-invalid">
          <div className="text-[40px] mb-2">🎁</div>
          <div className="text-lg font-semibold mb-1">This gift link isn't valid</div>
          <div className="text-white/55 text-sm mb-4">
            It may have been replaced by a newer link, or the buyer cancelled it. Ask them to resend.
          </div>
          <Link href="/" className="text-[#319ED8] text-sm underline underline-offset-2">Back to GoodTunes</Link>
        </div>
      </main>
    );
  }

  const recipientName = `${data.recipientFirstName} ${data.recipientLastName}`.trim();

  return (
    <main className="min-h-screen flex justify-center bg-[#00062B] text-white px-6 py-12" data-testid="page-gift-claim">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-6">
          <div className="text-[44px] mb-2">🎁</div>
          <div className="text-[#FF5470] text-[11px] uppercase tracking-wider font-semibold">A gift for {recipientName || "you"}</div>
          <h1 className="text-[24px] font-bold leading-tight mt-1" data-testid="text-gift-headline">
            You've been gifted GoodTunes
          </h1>
          {data.buyerName && (
            <p className="text-white/55 text-[14px] mt-1" data-testid="text-gift-buyer">
              From <span className="text-white">{data.buyerName}</span>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-5 flex items-center gap-4">
          <img
            src={data.album.artwork}
            alt={data.album.title}
            className="w-20 h-20 rounded-xl object-cover bg-white/10"
            data-testid="img-gift-album"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold truncate" data-testid="text-gift-album-title">{data.album.title}</div>
            <div className="text-white/60 text-[13px] truncate" data-testid="text-gift-album-artist">{data.album.artist}</div>
            <div className="text-white/40 text-[11px] mt-1">Full album · Lossless · Your GoodDeed certificate</div>
          </div>
        </div>

        {data.message && (
          <div
            className="rounded-2xl border p-5 mb-5"
            style={{ borderColor: "color-mix(in srgb, var(--brand-heart) 25%, transparent)", background: "color-mix(in srgb, var(--brand-heart) 6%, transparent)" }}
            data-testid="text-gift-message"
          >
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--brand-heart)" }}>Message</div>
            <p className="text-white/85 text-sm leading-snug whitespace-pre-wrap">{data.message}</p>
          </div>
        )}

        {data.claimed ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center" data-testid="gift-claim-already">
            <div className="text-emerald-300 text-[12px] uppercase tracking-wider font-semibold mb-1">Already claimed</div>
            <div className="text-white/75 text-[13px]">
              This gift was claimed on {data.claimedAt ? new Date(data.claimedAt).toLocaleDateString() : "an earlier date"}.
            </div>
          </div>
        ) : !data.delivered ? (
          <div
            className="rounded-2xl border p-5 text-center"
            style={{ borderColor: "color-mix(in srgb, var(--brand-blue) 30%, transparent)", background: "color-mix(in srgb, var(--brand-blue) 10%, transparent)" }}
            data-testid="gift-claim-scheduled"
          >
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--brand-blue)" }}>Unlocks {data.deliverOn}</div>
            <div className="text-white/75 text-sm">
              Come back on {data.deliverOn ? new Date(`${data.deliverOn}T00:00:00Z`).toLocaleDateString() : "the scheduled date"} to claim — we'll keep the link safe until then.
            </div>
          </div>
        ) : data.expired ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5 text-center" data-testid="gift-claim-expired">
            <div className="text-rose-300 text-[12px] uppercase tracking-wider font-semibold mb-1">Link expired</div>
            <div className="text-white/75 text-[13px]">
              Ask the buyer to resend — they can do it from their order list in one tap.
            </div>
          </div>
        ) : !user ? (
          <button
            type="button"
            onClick={() => navigate(`/login?next=/gift/${token}`)}
            className="w-full py-4 rounded-2xl font-semibold text-base text-white transition-all active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #7F10A7, #319ED8)" }}
            data-testid="button-gift-signin"
          >
            Sign in or sign up to claim
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => claim.mutate()}
              disabled={claim.isPending}
              className="w-full py-4 rounded-2xl font-semibold text-base text-white disabled:opacity-50 transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #7F10A7, #319ED8)" }}
              data-testid="button-gift-claim"
            >
              {claim.isPending ? "Claiming…" : "Claim my gift"}
            </button>
            <p className="text-white/40 text-[11px] mt-3 text-center leading-snug">
              The album + GoodDeed certificate move into <span className="text-white/70">{user.realName || user.displayName || user.username || user.email}</span>'s name.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
