// Orders — the fan-facing list of every album bundle they've bought
// (Task #44, step 11). Reads /api/orders, joins items+album server-side.
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

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
  items: { id: string; kind: string; sku: string; label: string; unitPriceCents: number; quantity: number }[];
};

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-[#4AFFCA]/15 text-[#4AFFCA]" },
  shipped: { label: "Shipped", cls: "bg-[#319ED8]/15 text-[#319ED8]" },
  refunded: { label: "Refunded", cls: "bg-rose-500/15 text-rose-300" },
  pending: { label: "Pending", cls: "bg-white/10 text-white/55" },
};

export function Orders() {
  const { data: orders, isLoading } = useQuery<OrderRow[]>({ queryKey: ["/api/orders"] });

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
            return (
              <Link
                key={o.id}
                href={`/album/${o.albumId}`}
                className="block rounded-2xl border border-white/10 bg-white/5 p-4 active:scale-[0.99] transition-transform"
                data-testid={`row-order-${o.id}`}
              >
                <div className="flex gap-3">
                  {o.albumArtwork && (
                    <img src={o.albumArtwork} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${st.cls}`}>
                        {st.label}
                      </span>
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
            );
          })}
        </div>
      </div>
    </main>
  );
}
