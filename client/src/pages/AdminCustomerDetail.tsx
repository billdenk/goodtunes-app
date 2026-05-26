import { useEffect, useState, useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Mail, Phone, MapPin, ShoppingBag, Disc3, ListMusic, CheckCircle2, Plus, X, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)]"
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
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)] transition-colors"
          data-testid="link-back-to-customers"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Customers
        </Link>

        <AdminPageHeader
          title={name}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {c.email}
                {c.emailVerifiedAt ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
                    title={`Verified ${new Date(c.emailVerifiedAt as unknown as string).toLocaleDateString()}`}
                    data-testid="badge-email-verified"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
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
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
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
                      <div className="text-slate-900 text-sm font-medium truncate">
                        {o.albumTitle}
                        <span className="text-slate-400"> · </span>
                        <span className="text-slate-600">{o.albumArtist}</span>
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">
                        {formatDate(o.createdAt)}
                        {o.goodDeedNumber != null && <> · Good Deed #{o.goodDeedNumber}</>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-slate-900 text-sm font-medium tabular-nums">
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
        <Section
          title={`Collection (${collection.length})`}
          action={id ? <GrantAlbumGate customerId={id} ownedAlbumIds={collection.map((a) => a.albumId)} /> : null}
        >
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
                    <div className="text-slate-900 text-sm font-medium truncate">{a.albumTitle}</div>
                    <div className="text-slate-500 text-xs truncate">{a.albumArtist}</div>
                    <div className="text-slate-400 text-xs mt-1">
                      {a.certificateNumber != null ? `Cert #${a.certificateNumber} · ` : ""}
                      {formatDate(a.acquiredAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* Task #400 — Account-merge audit. Only renders rows for fans
            who absorbed another account via the customer-side merge
            flow ("These two accounts are me"). */}
        <MergeAuditSection customerId={customer.id} />

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
                    <div className="text-slate-900 text-sm font-medium truncate">{p.name}</div>
                    <div className="text-slate-500 text-xs">
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-900 text-[18px] font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// Task #400 — Account-merge audit. Renders nothing for fans who never
// absorbed another account; otherwise lists each merge with what moved
// and from where.
function MergeAuditSection({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery<{
    merges: Array<{
      id: string;
      losingId: string;
      losingEmail: string | null;
      losingLegacyGogoodsId: string | null;
      movedAlbums: number;
      movedOrders: number;
      movedPlaylists: number;
      mergedAt: string | null;
    }>;
  }>({
    queryKey: ["/api/admin/customers", customerId, "merges"],
  });
  if (isLoading || !data || data.merges.length === 0) return null;
  return (
    <Section title={`Account merges (${data.merges.length})`}>
      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
        {data.merges.map((m) => (
          <MergeRow key={m.id} customerId={customerId} merge={m} />
        ))}
      </div>
    </Section>
  );
}

function MergeRow({
  customerId,
  merge: m,
}: {
  customerId: string;
  merge: {
    id: string;
    losingId: string;
    losingEmail: string | null;
    losingLegacyGogoodsId: string | null;
    movedAlbums: number;
    movedOrders: number;
    movedPlaylists: number;
    mergedAt: string | null;
  };
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const undo = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/customers/${customerId}/merges/${m.id}/undo`);
      return r.json();
    },
    onSuccess: (res: { movedAlbums: number; movedOrders: number; movedPlaylists: number }) => {
      toast({
        title: "Merge reversed",
        description: `${res.movedAlbums} album${res.movedAlbums === 1 ? "" : "s"} · ${res.movedOrders} order${res.movedOrders === 1 ? "" : "s"} · ${res.movedPlaylists} playlist${res.movedPlaylists === 1 ? "" : "s"} moved back to ${m.losingEmail ?? "the other account"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId, "merges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId] });
      setConfirming(false);
      setTyped("");
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't reverse the merge", description: e.message, variant: "destructive" });
    },
  });
  const canSubmit = typed.trim().toLowerCase() === (m.losingEmail ?? "").toLowerCase() && !!m.losingEmail;
  return (
    <div className="px-4 py-3" data-testid={`row-merge-${m.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-slate-900 text-sm font-medium">
            Absorbed {m.losingEmail ?? "(unknown email)"}
            {m.losingLegacyGogoodsId && (
              <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                legacy gogoods
              </span>
            )}
          </div>
          <div className="text-slate-500 text-xs mt-0.5">
            Moved {m.movedAlbums} album{m.movedAlbums === 1 ? "" : "s"} · {m.movedOrders} order{m.movedOrders === 1 ? "" : "s"} · {m.movedPlaylists} playlist{m.movedPlaylists === 1 ? "" : "s"} · {formatDate(m.mergedAt)}
          </div>
        </div>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs font-medium text-rose-700 hover:text-rose-900 transition-colors flex-shrink-0"
            data-testid={`button-merge-undo-${m.id}`}
          >
            Undo merge…
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3" data-testid={`merge-undo-confirm-${m.id}`}>
          <p className="text-xs text-rose-900 leading-relaxed mb-2">
            This reparents every album, order, and playlist that moved from{" "}
            <strong>{m.losingEmail ?? "the absorbed account"}</strong> back to that account, and clears
            the soft-delete so it can sign in again. Type the absorbed account's email to confirm.
          </p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={m.losingEmail ?? ""}
            className="w-full rounded border border-rose-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-rose-500"
            data-testid={`input-merge-undo-confirm-${m.id}`}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => undo.mutate()}
              disabled={!canSubmit || undo.isPending}
              className="rounded-md bg-rose-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-40 transition-colors"
              data-testid={`button-merge-undo-confirm-${m.id}`}
            >
              {undo.isPending ? "Reversing…" : "Reverse this merge"}
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setTyped(""); }}
              disabled={undo.isPending}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              data-testid={`button-merge-undo-cancel-${m.id}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type AdminAlbumLite = { id: string; title: string; artist: string; artwork: string | null };

function GrantAlbumGate({ customerId, ownedAlbumIds }: { customerId: string; ownedAlbumIds: string[] }) {
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  if (roleInfo?.role !== "super_admin") return null;
  return <GrantAlbumButton customerId={customerId} ownedAlbumIds={ownedAlbumIds} />;
}

function GrantAlbumButton({ customerId, ownedAlbumIds }: { customerId: string; ownedAlbumIds: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
        data-testid="button-grant-album-open"
      >
        <Plus className="w-3.5 h-3.5" /> Grant album
      </button>
      {open && (
        <GrantAlbumDialog
          customerId={customerId}
          ownedAlbumIds={ownedAlbumIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function GrantAlbumDialog({
  customerId,
  ownedAlbumIds,
  onClose,
}: {
  customerId: string;
  ownedAlbumIds: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const owned = useMemo(() => new Set(ownedAlbumIds), [ownedAlbumIds]);
  const { data: allAlbums = [], isLoading } = useQuery<AdminAlbumLite[]>({
    queryKey: ["/api/albums"],
  });
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? allAlbums.filter(
          (a) =>
            a.title.toLowerCase().includes(needle) ||
            a.artist.toLowerCase().includes(needle),
        )
      : allAlbums;
    return list.slice(0, 80);
  }, [allAlbums, q]);

  const grant = useMutation({
    mutationFn: async (albumId: string) => {
      const r = await apiRequest(
        "POST",
        `/api/admin/customers/${customerId}/grant-album`,
        { albumId },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || `Failed (${r.status})`);
      }
    },
    onSuccess: (_, albumId) => {
      const a = allAlbums.find((x) => x.id === albumId);
      toast({ title: "Album granted", description: a ? `${a.title} — ${a.artist}` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId] });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't grant album", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dialog-grant-album"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div>
            <div className="text-slate-900 text-sm font-semibold">Grant album (demo)</div>
            <div className="text-slate-500 text-xs">Free comp — no payment, no order, super-admin only</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600"
            data-testid="button-grant-album-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search albums by title or artist…"
              autoFocus
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:border-[var(--brand-blue)] focus:outline-none"
              data-testid="input-grant-album-search"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-slate-500 text-sm">Loading albums…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">No albums match.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((a) => {
                const isOwned = owned.has(a.id);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                      {a.artwork && (
                        <img src={a.artwork} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-900 text-sm font-medium truncate">{a.title}</div>
                      <div className="text-slate-500 text-xs truncate">{a.artist}</div>
                    </div>
                    {isOwned ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Owned
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={grant.isPending}
                        onClick={() => grant.mutate(a.id)}
                        className="rounded-md bg-[var(--brand-blue)] text-white px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                        data-testid={`button-grant-album-${a.id}`}
                      >
                        Grant
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ icon: Icon, text }: { icon: React.ComponentType<any>; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
      <Icon className="w-6 h-6 mx-auto text-slate-300 mb-1.5" strokeWidth={1.5} />
      <div className="text-slate-500 text-sm">{text}</div>
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
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
        <MapPin className="w-3.5 h-3.5" /> {kind}
      </div>
      {fallback ? (
        <div className="text-slate-700 text-sm leading-snug">
          {snapshot?.name && <div className="font-medium text-slate-900">{snapshot.name}</div>}
          {snapshot?.line1 && <div>{snapshot.line1}</div>}
          {snapshot?.line2 && <div>{snapshot.line2}</div>}
          <div>
            {[snapshot?.city, snapshot?.state, snapshot?.postalCode].filter(Boolean).join(", ")}
          </div>
          {snapshot?.country && <div>{snapshot.country}</div>}
        </div>
      ) : (
        <div className="text-slate-400 text-sm">No {kind.toLowerCase()} address on file.</div>
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
