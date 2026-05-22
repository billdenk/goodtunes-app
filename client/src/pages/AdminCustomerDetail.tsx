import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Mail, Phone, MapPin, ShoppingBag, Disc3, ListMusic, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { CustomerUser, StripeAddressSnapshot } from "@shared/schema";

/**
 * Admin · Customer detail (Task #131).
 *
 * Read-only fan profile. The single payload returns customer + orders +
 * collection + playlists so the page can render everything in one
 * round-trip. Stripe customer ID, when present, deep-links into the
 * live Stripe dashboard so finance can pull receipts / chargebacks
 * without bouncing through the order list.
 */

type Profile = {
  customer: CustomerUser;
  orders: Array<{
    id: string;
    albumId: string;
    albumTitle: string;
    albumArtist: string;
    totalCents: number;
    status: string;
    goodDeedNumber: number | null;
    createdAt: string | null;
    shippedAt: string | null;
  }>;
  collection: Array<{
    id: string;
    albumId: string;
    albumTitle: string;
    albumArtist: string;
    albumArtwork: string;
    certificateNumber: number | null;
    acquiredAt: string | null;
  }>;
  playlists: Array<{ id: string; name: string; songCount: number; createdAt: string | null }>;
};

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatAddress(a: StripeAddressSnapshot | null | undefined): string | null {
  if (!a) return null;
  const parts = [a.line1, a.line2, a.city, a.state, a.postalCode, a.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function AdminCustomerDetail() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/customers/:id");
  const id = params?.id;

  const { data, isLoading, error } = useQuery<Profile>({
    queryKey: ["/api/admin/customers", id],
    enabled: !!user?.isAdmin && !!id,
  });

  if (authLoading) {
    return (
      <AdminFrame active="customers">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
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
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-[var(--brand-blue)]"
            data-testid="link-back-to-customers"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Customers
          </Link>
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
            Customer not found.
          </div>
        </div>
      </AdminFrame>
    );
  }

  const { customer: c, orders, collection, playlists } = data;
  const name = c.realName || c.displayName;
  const ship = formatAddress(c.shippingAddress);
  const bill = formatAddress(c.billingAddress);
  const lifetime = orders
    .filter((o) => o.status === "paid" || o.status === "shipped")
    .reduce((sum, o) => sum + o.totalCents, 0);

  return (
    <AdminFrame active="customers" contentWidth="narrow">
      <div className="space-y-6">
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-[var(--brand-blue)] transition-colors"
          data-testid="link-back-to-customers"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Customers
        </Link>

        <AdminPageHeader
          title={name}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {c.email}
                {c.emailVerifiedAt ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
                    title={`Verified ${new Date(c.emailVerifiedAt as unknown as string).toLocaleDateString()}`}
                    data-testid="badge-email-verified"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
                    data-testid="badge-email-unverified"
                  >
                    Unverified
                  </span>
                )}
              </span>
              {c.username && c.username !== c.email && <span>@{c.username}</span>}
              {c.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> {c.phone}
                </span>
              )}
              <span>Joined {formatDate(c.createdAt as unknown as string | null)}</span>
            </span>
          }
          actions={
            c.stripeCustomerId ? (
              <a
                href={`https://dashboard.stripe.com/customers/${c.stripeCustomerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid="link-stripe-customer"
              >
                Stripe
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : null
          }
        />

        {/* Top stat strip — keeps the most-asked numbers visible without
            making the operator count rows in each section. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Orders" value={String(orders.length)} testId="stat-orders" />
          <Stat label="Lifetime" value={formatMoney(lifetime)} testId="stat-lifetime" />
          <Stat label="Collection" value={String(collection.length)} testId="stat-collection" />
          <Stat label="Playlists" value={String(playlists.length)} testId="stat-playlists" />
        </div>

        {/* Addresses */}
        <Section title="Addresses">
          <div className="grid sm:grid-cols-2 gap-3">
            <AddressCard
              kind="Shipping"
              snapshot={c.shippingAddress}
              fallback={ship}
              testId="card-shipping-address"
            />
            <AddressCard
              kind="Billing"
              snapshot={c.billingAddress}
              fallback={bill}
              testId="card-billing-address"
            />
          </div>
        </Section>

        {/* Orders */}
        <Section title={`Orders (${orders.length})`}>
          {orders.length === 0 ? (
            <EmptyRow icon={ShoppingBag} text="No orders yet." />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {orders.map((o) => (
                <Link
                  key={o.id}
                  href={`/admin/orders?orderId=${o.id}`}
                  className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                  data-testid={`row-order-${o.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-900 text-[14px] font-medium truncate">
                        {o.albumTitle}
                        <span className="text-slate-400"> · </span>
                        <span className="text-slate-600">{o.albumArtist}</span>
                      </div>
                      <div className="text-slate-500 text-[12px] mt-0.5">
                        {formatDate(o.createdAt)}
                        {o.goodDeedNumber != null && <> · Good Deed #{o.goodDeedNumber}</>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-slate-900 text-[14px] font-medium tabular-nums">
                        {formatMoney(o.totalCents)}
                      </div>
                      <StatusPill status={o.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* Collection */}
        <Section title={`Collection (${collection.length})`}>
          {collection.length === 0 ? (
            <EmptyRow icon={Disc3} text="No albums in this fan's collection yet." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {collection.map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/albums/${a.albumId}`}
                  className="block rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-slate-300 transition-colors"
                  data-testid={`card-collection-${a.id}`}
                >
                  <div className="aspect-square bg-slate-100">
                    {a.albumArtwork && (
                      <img src={a.albumArtwork} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-slate-900 text-[13px] font-medium truncate">{a.albumTitle}</div>
                    <div className="text-slate-500 text-[12px] truncate">{a.albumArtist}</div>
                    <div className="text-slate-400 text-[11px] mt-1">
                      {a.certificateNumber != null ? `Cert #${a.certificateNumber} · ` : ""}
                      {formatDate(a.acquiredAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* Playlists */}
        <Section title={`Playlists (${playlists.length})`}>
          {playlists.length === 0 ? (
            <EmptyRow icon={ListMusic} text="No playlists yet." />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {playlists.map((p) => (
                <div
                  key={p.id}
                  className="px-4 py-3 flex items-center gap-3"
                  data-testid={`row-playlist-${p.id}`}
                >
                  <ListMusic className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900 text-[14px] font-medium truncate">{p.name}</div>
                    <div className="text-slate-500 text-[12px]">
                      {p.songCount} song{p.songCount === 1 ? "" : "s"} · created {formatDate(p.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AdminFrame>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3" data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-900 text-[18px] font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function EmptyRow({ icon: Icon, text }: { icon: React.ComponentType<any>; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
      <Icon className="w-6 h-6 mx-auto text-slate-300 mb-1.5" strokeWidth={1.5} />
      <div className="text-slate-500 text-[13px]">{text}</div>
    </div>
  );
}

function AddressCard({
  kind,
  snapshot,
  fallback,
  testId,
}: {
  kind: string;
  snapshot: StripeAddressSnapshot | null | undefined;
  fallback: string | null;
  testId?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
        <MapPin className="w-3.5 h-3.5" /> {kind}
      </div>
      {fallback ? (
        <div className="text-slate-700 text-[13px] leading-snug">
          {snapshot?.name && <div className="font-medium text-slate-900">{snapshot.name}</div>}
          {snapshot?.line1 && <div>{snapshot.line1}</div>}
          {snapshot?.line2 && <div>{snapshot.line2}</div>}
          <div>
            {[snapshot?.city, snapshot?.state, snapshot?.postalCode].filter(Boolean).join(", ")}
          </div>
          {snapshot?.country && <div>{snapshot.country}</div>}
        </div>
      ) : (
        <div className="text-slate-400 text-[13px]">No {kind.toLowerCase()} address on file.</div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700",
    shipped: "bg-blue-50 text-blue-700",
    refunded: "bg-rose-50 text-rose-700",
    pending: "bg-amber-50 text-amber-700",
    cancelled: "bg-slate-100 text-slate-600",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  );
}
