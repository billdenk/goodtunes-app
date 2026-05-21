// Orders — the fan-facing list of every album bundle they've bought
// (Task #44, step 11). Reads /api/orders, joins items+album server-side.
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { track } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";

// Task #46 — gift block on each row exposes the buyer's self-serve
// gifting controls (copy share link, resend, change recipient within
// 24h). Without these, a buyer who closes the post-checkout Welcome tab
// loses their only way to manage a gift they sent.
type GiftInfo = {
  id: string;
  buyerUserId: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  claimToken: string | null;
  claimed: boolean;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  resendCount: number;
  isBuyer: boolean;
};

type OrderRow = {
  id: string;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  status: string;
  totalCents: number;
  goodDeedNumber: number | null;
  shippedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  // Task #49 — order origin. "direct" = bought on goodtunes.music,
  // "shopify:<storeId>" = arrived via a label's Shopify webhook.
  origin?: string;
  items: { id: string; kind: string; sku: string; label: string; unitPriceCents: number; quantity: number }[];
  gift: GiftInfo | null;
};

// Origin label rendered next to the status pill. Direct orders stay
// unbadged (it's the default); Shopify-sourced orders surface a small
// "Shopify" tag so a fan can tell where they came from at a glance.
function OriginBadge({ origin }: { origin: string | undefined }) {
  if (!origin || origin === "direct") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#95BF47]/15 text-[#95BF47] text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5"
      data-testid="badge-origin-shopify"
      title="Bundled with a label's Shopify order"
    >
      Shopify
    </span>
  );
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-[#4AFFCA]/15 text-[#4AFFCA]" },
  shipped: { label: "Shipped", cls: "bg-[#319ED8]/15 text-[#319ED8]" },
  refunded: { label: "Refunded", cls: "bg-rose-500/15 text-rose-300" },
  pending: { label: "Pending", cls: "bg-white/10 text-white/55" },
};

const RECIPIENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function Orders() {
  const { data: orders, isLoading } = useQuery<OrderRow[]>({ queryKey: ["/api/orders"] });
  const { toast } = useToast();

  const resendGift = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await apiRequest("POST", `/api/orders/${orderId}/gift/resend`, {});
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Gift link refreshed", description: "Copied to clipboard — send it to your recipient." });
      } catch {
        toast({ title: "Gift link refreshed", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't refresh link", description: e?.message, variant: "destructive" }),
  });

  const patchGift = useMutation({
    mutationFn: async (args: { orderId: string; body: { firstName: string; lastName: string; email: string | null; phone: string | null } }) => {
      const r = await apiRequest("PATCH", `/api/orders/${args.orderId}/gift`, args.body);
      return (await r.json()) as { shareUrl: string };
    },
    onSuccess: async (res, vars) => {
      // First buyer-initiated recipient set/change on this order — this is
      // the moment a paid order actually becomes a gift to a real person.
      track("gift_initiated", { orderId: vars.orderId });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      try {
        await navigator.clipboard.writeText(res.shareUrl);
        toast({ title: "Recipient updated · new link copied" });
      } catch {
        toast({ title: "Recipient updated", description: res.shareUrl });
      }
    },
    onError: (e: any) => toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  async function copyLink(g: GiftInfo) {
    if (!g.claimToken) return;
    const url = `${window.location.origin}/gift/${g.claimToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Gift link copied" });
    } catch {
      toast({ title: "Gift link", description: url });
    }
  }

  function promptChangeRecipient(o: OrderRow) {
    if (!o.gift) return;
    const firstName = window.prompt("Recipient first name", o.gift.recipientFirstName)?.trim();
    if (!firstName) return;
    const lastName = window.prompt("Recipient last name", o.gift.recipientLastName)?.trim();
    if (!lastName) return;
    const email = window.prompt("Recipient email (blank to skip)", o.gift.recipientEmail ?? "")?.trim() || null;
    const phone = email ? null : window.prompt("Recipient phone (required if no email)", o.gift.recipientPhone ?? "")?.trim() || null;
    patchGift.mutate({ orderId: o.id, body: { firstName, lastName, email, phone } });
  }

  return (
    <main className="min-h-screen bg-[#00062B] text-white pb-24" data-testid="page-orders">
      <div className="max-w-[440px] mx-auto px-5 pt-8">
        <h1 className="text-[28px] font-bold mb-1">Your orders</h1>
        <p className="text-white/55 text-[13px] mb-6">Records, certificates, and digital access you own.</p>

        {isLoading && <div className="text-white/55 text-sm" data-testid="orders-loading">Loading…</div>}
        {!isLoading && orders && orders.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center" data-testid="orders-empty">
            <div className="text-white/85 font-medium">No orders yet</div>
            <div className="text-white/55 text-[13px] mt-1">
              When you buy a record, it shows up here.
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {orders?.map((o) => {
            const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.pending;
            const g = o.gift;
            const gExpired = g ? new Date(g.expiresAt).getTime() < Date.now() : false;
            const gEditable = g ? Date.now() - new Date(g.createdAt).getTime() < RECIPIENT_EDIT_WINDOW_MS : false;
            const giftPill: { label: string; cls: string } | null = !g
              ? null
              : g.claimed
              ? { label: "Gift · Claimed", cls: "bg-violet-500/20 text-violet-300" }
              : gExpired
              ? { label: "Gift · Expired", cls: "bg-rose-500/15 text-rose-300" }
              : g.resendCount > 0
              ? { label: `Gift · Resent ×${g.resendCount}`, cls: "bg-amber-400/15 text-amber-200" }
              : { label: "Gift · Sent", cls: "bg-fuchsia-500/20 text-fuchsia-300" };
            return (
              <div
                key={o.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
                data-testid={`row-order-${o.id}`}
              >
                <Link href={`/album/${o.albumId}`} className="block active:scale-[0.99] transition-transform">
                  <div className="flex gap-3">
                    {o.albumArtwork && (
                      <img src={o.albumArtwork} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${st.cls}`}>
                          {st.label}
                        </span>
                        <OriginBadge origin={o.origin} />
                        {giftPill && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${giftPill.cls}`} data-testid={`pill-gift-${o.id}`}>
                            {giftPill.label}
                          </span>
                        )}
                        {o.goodDeedNumber !== null && (
                          <span className="text-[11px] text-white/40">#{o.goodDeedNumber}</span>
                        )}
                      </div>
                      <div className="text-[15px] font-semibold truncate mt-1">{o.albumTitle}</div>
                      <div className="text-[13px] text-white/55 truncate">{o.albumArtist}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-semibold">{dollars(o.totalCents)}</div>
                      <div className="text-[11px] text-white/40 mt-1">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.items.map((it) => (
                      <span key={it.id} className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/70">
                        {it.label}
                      </span>
                    ))}
                  </div>
                </Link>

                {g && g.isBuyer && (
                  <div className="mt-3 pt-3 border-t border-white/10" data-testid={`gift-controls-${o.id}`}>
                    <div className="text-[12px] text-white/65 leading-snug">
                      Gift to{" "}
                      <span className="text-white font-medium">
                        {g.recipientFirstName} {g.recipientLastName}
                      </span>
                      {g.recipientEmail && <> · <span className="text-white/55">{g.recipientEmail}</span></>}
                      {g.recipientPhone && <> · <span className="text-white/55">{g.recipientPhone}</span></>}
                    </div>
                    {!g.claimed && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {g.claimToken && !gExpired && (
                          <button
                            type="button"
                            onClick={() => copyLink(g)}
                            className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-white/10 text-white hover:bg-white/15"
                            data-testid={`button-copy-link-${o.id}`}
                          >
                            Copy link
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => resendGift.mutate(o.id)}
                          disabled={resendGift.isPending}
                          className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-[#FF5470]/20 text-[#FF5470] hover:bg-[#FF5470]/30 disabled:opacity-50"
                          data-testid={`button-resend-gift-${o.id}`}
                        >
                          {gExpired ? "Recover expired link" : "Resend link"}
                        </button>
                        {gEditable && (
                          <button
                            type="button"
                            onClick={() => promptChangeRecipient(o)}
                            disabled={patchGift.isPending}
                            className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-[#7F10A7]/30 text-[#c89dff] hover:bg-[#7F10A7]/40 disabled:opacity-50"
                            data-testid={`button-change-recipient-${o.id}`}
                          >
                            Change recipient
                          </button>
                        )}
                      </div>
                    )}
                    {g.claimed && g.claimedAt && (
                      <div className="mt-1.5 text-[11.5px] text-[#4AFFCA]">
                        Claimed {new Date(g.claimedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
