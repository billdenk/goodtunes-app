import { useEffect, useRef, useState, useMemo } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Mail, Phone, MapPin, ShoppingBag, Disc3, ListMusic, CheckCircle2, Plus, X, Search, Link2, AlertTriangle, ArrowLeftRight, Users, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSmartBackCrumb } from "@/hooks/useSmartBackCrumb";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { OrderDetailSheet, originBadge } from "@/components/admin/OrderDetailSheet";
import { AdminEditCustomerDialog } from "@/components/admin/AdminEditCustomerDialog";
import type { CustomerUser, StripeAddressSnapshot } from "@shared/schema";
import { checkoutFailureReasonLabel } from "@shared/checkoutFailures";

/**
 * Admin · Customer detail (Task #131).
 *
 * Read-only fan profile. The single payload returns customer + orders +
 * collection + playlists so the page can render everything in one
 * round-trip. Stripe customer ID, when present, deep-links into the
 * live Stripe dashboard so finance can pull receipts / chargebacks
 * without bouncing through the order list.
 */

/**
 * Task #1342 (#6) — honest join-date resolution.
 *
 * Imported goGoods fans were inserted at import time, so their `createdAt` is
 * a migration artifact, NOT a real join date — it must never surface as
 * "Joined …". The honest signals, in order:
 *   - legacy fan WITH orders → the earliest order date (a true lower bound on
 *     when they joined), labelled with an "imported from goGoods" note.
 *   - legacy fan with NO orders → no honest date exists, so render
 *     "Imported from goGoods" with no date rather than lying.
 *   - native fan → plain `createdAt`.
 * Pure + exported so the regression guard can pin it without rendering the
 * whole page.
 */
export type JoinedDisplay =
  | { kind: "imported-no-date" }
  | { kind: "joined"; iso: string | null; importedNote: boolean };

export function resolveJoinedDisplay(opts: {
  legacyGogoodsId: string | null | undefined;
  createdAt: string | null;
  earliestOrderAt: string | null;
}): JoinedDisplay {
  const { legacyGogoodsId, createdAt, earliestOrderAt } = opts;
  const isLegacy = Boolean(legacyGogoodsId);
  if (isLegacy && !earliestOrderAt) return { kind: "imported-no-date" };
  return {
    kind: "joined",
    iso: isLegacy && earliestOrderAt ? earliestOrderAt : createdAt,
    importedNote: isLegacy && Boolean(earliestOrderAt),
  };
}

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
    paymentCardBrand: string | null;
    paymentCardLast4: string | null;
    paymentWalletType: string | null;
    receiptUrl: string | null;
    origin: string | null;
  }>;
  // Task #2993 — failed/abandoned checkout attempts from the Stripe
  // webhook (checkout_failure_events). Never orders; audit trail only.
  failedCheckouts: Array<{
    id: string;
    kind: string;
    failureCode: string | null;
    failureMessage: string | null;
    albumId: string | null;
    albumTitle: string | null;
    albumArtist: string | null;
    skuFormat: string | null;
    quantity: number | null;
    amountCents: number | null;
    buyerEmail: string | null;
    occurredAt: string | null;
  }>;
  collection: Array<{
    id: string;
    albumId: string;
    albumTitle: string;
    albumArtist: string;
    albumArtwork: string;
    certificateNumber: number | null;
    grantNumber: number | null;
    acquiredAt: string | null;
    // Task #909 — admin-granted preview state. A preview is NOT ownership:
    // it counts toward nothing and shows a Demo chip + expiry instead of a
    // cert number. The admin sees expired previews too (so they can extend
    // or clear them).
    isPreview?: boolean;
    previewExpiresAt?: string | null;
  }>;
  playlists: Array<{ id: string; name: string; songCount: number; createdAt: string | null }>;
  // Task #1342 — address fallback for imported/legacy fans with no
  // customer-level Stripe snapshot. The server pulls the most recent order's
  // shipping/billing address; the AddressCard renders it with a quiet "from
  // latest order" note so the operator knows it isn't an on-file address.
  fallbackShippingAddress: StripeAddressSnapshot | null;
  fallbackBillingAddress: StripeAddressSnapshot | null;
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
// Display labels for the payment-instrument snapshot captured from Stripe.
const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover",
  diners: "Diners", jcb: "JCB", unionpay: "UnionPay", cartes_bancaires: "Cartes Bancaires",
};
const WALLET_LABELS: Record<string, string> = {
  apple_pay: "Apple Pay", google_pay: "Google Pay", samsung_pay: "Samsung Pay", link: "Link",
};
function formatPaymentMethod(o: {
  paymentCardBrand: string | null;
  paymentCardLast4: string | null;
  paymentWalletType: string | null;
}): string | null {
  const brand = o.paymentCardBrand ? CARD_BRAND_LABELS[o.paymentCardBrand] ?? o.paymentCardBrand : null;
  const card = brand ? `${brand}${o.paymentCardLast4 ? ` •••• ${o.paymentCardLast4}` : ""}` : null;
  const wallet = o.paymentWalletType ? WALLET_LABELS[o.paymentWalletType] ?? o.paymentWalletType.replace(/_/g, " ") : null;
  return [card, wallet].filter(Boolean).join(" · ") || null;
}

export function AdminCustomerDetail() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute<{ id: string }>("/admin/customers/:id");
  const id = params?.id;
  // Task #2533 — smart back crumb: when the operator arrived here via a
  // deep link that stamped its origin (`?from=…`), the back-link points at
  // that origin (the album, order list, playlist, …) instead of the
  // generic Customers list. Falls back to "← Customers" for direct visits.
  const backCrumb = useSmartBackCrumb();

  const { data, isLoading, error } = useQuery<Profile>({
    queryKey: ["/api/admin/customers", id],
    enabled: !!user?.isAdmin && !!id,
  });

  // Task #1342 (#1) — open the shared order Sheet inline instead of bouncing
  // to the un-drillable /admin/orders?orderId= list.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // Task #2488 — client-side filter for the Orders section. A fan can have
  // dozens of orders (Bill D has 68); this filters by album title, artist,
  // GoodDeed number, and formatted payment method without any server call.
  const [orderSearch, setOrderSearch] = useState("");
  // Task #2493 — matching client-side filters for the Collection and
  // Playlists sections, so the whole page is consistently searchable.
  const [collectionSearch, setCollectionSearch] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");

  // Task #2455 — the top stat cards jump to their matching detail section
  // and briefly highlight it so the operator sees where they landed.
  const [highlightSection, setHighlightSection] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);
  const jumpToSection = (key: "orders" | "collection" | "playlists") => {
    document
      .getElementById(`section-${key}`)
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    setHighlightSection(key);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightSection(null), 1600);
  };

  // Task #1342 (#5) — quiet "Make admin…" action, super_admin only.
  const { data: meRole } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = meRole?.role === "super_admin";
  // Per Bill (2026-08-10) — customers are never promoted to admin from this
  // page, so the "Make admin…" action is hidden (server route kept for the
  // rare deliberate operator flow via API).
  // Per Bill (2026-08-10) — operators can correct a fan's mailing address
  // when they move. Which card is being edited ('shipping' | 'billing').
  const [addressEdit, setAddressEdit] = useState<"shipping" | "billing" | null>(null);
  // Task #2218 — edit a fan's core identity (super_admin only). The trigger
  // is a hover-revealed pencil beside the name in the header, matching the
  // other admin edit affordances (AdminLabel / AdminPerson), not a standalone
  // button in the action cluster.
  const [editOpen, setEditOpen] = useState(false);

  // Operator escape hatch — when a fan can't get in (email landed in spam, a
  // dead/typo'd address, an already-used welcome-back link) mint a fresh
  // single-use sign-in link and hand it to them directly. super_admin only
  // (account-takeover power); the server re-checks the role.
  const [signInLink, setSignInLink] = useState<string | null>(null);
  const signInLinkMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/customers/${id}/signin-link`);
      return (await r.json()) as { url: string; expiresAt: string };
    },
    onSuccess: async (res) => {
      setSignInLink(res.url);
      try {
        await navigator.clipboard.writeText(res.url);
        toast({
          title: "Sign-in link copied",
          description: "Paste it to the fan — it works once and expires in 30 days.",
        });
      } catch {
        toast({
          title: "Sign-in link ready",
          description: "Copy it from the box below and send it to the fan.",
        });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't generate a sign-in link", description: e.message, variant: "destructive" }),
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
          {backCrumb ? (
            <Link
              href={backCrumb.href}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)]"
              data-testid={backCrumb.testId}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {backCrumb.name}
            </Link>
          ) : (
            <Link
              href="/admin/customers"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)]"
              data-testid="link-back-to-customers"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Customers
            </Link>
          )}
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
            Customer not found.
          </div>
        </div>
      </AdminFrame>
    );
  }

  const { customer: c, orders, collection, playlists } = data;
  const failedCheckouts = data.failedCheckouts ?? [];
  // Task #909 — a preview counts toward nothing, so the Collection stat and
  // section header count only real owned/comp rows. Previews still render in
  // the grid (flagged as Demo), just below the owned ones.
  const ownedCollectionCount = collection.filter((a) => !a.isPreview).length;
  const name = c.realName || c.displayName;
  // Task #1342 (#2) — resolve each address to the customer's on-file snapshot,
  // falling back to the most recent order's address for imported/legacy fans.
  const shippingResolved = c.shippingAddress ?? data.fallbackShippingAddress;
  const billingResolved = c.billingAddress ?? data.fallbackBillingAddress;
  const shippingFromOrder = !c.shippingAddress && !!data.fallbackShippingAddress;
  const billingFromOrder = !c.billingAddress && !!data.fallbackBillingAddress;
  const REVENUE_STATUSES = new Set(["paid", "shipped", "complete", "completed"]);
  const lifetime = orders
    .filter((o) => REVENUE_STATUSES.has(o.status))
    .reduce((sum, o) => sum + o.totalCents, 0);
  // Task #2488 — filter the loaded orders client-side. Matches album title,
  // artist, GoodDeed number, and the formatted payment method (card brand /
  // last-4 / wallet), case-insensitive, partial. Not a hook so it stays below
  // the loading/not-found guards above.
  const orderQuery = orderSearch.trim().toLowerCase();
  const filteredOrders = orderQuery
    ? orders.filter((o) => {
        const haystack = [
          o.albumTitle,
          o.albumArtist,
          o.goodDeedNumber != null ? `#${o.goodDeedNumber}` : "",
          o.goodDeedNumber != null ? String(o.goodDeedNumber) : "",
          formatPaymentMethod(o) ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(orderQuery);
      })
    : orders;
  const orderCountLabel = orderQuery
    ? `Orders (${filteredOrders.length} of ${orders.length})`
    : `Orders (${orders.length})`;
  // Task #2493 — Collection filter: album title + artist, case-insensitive /
  // partial. Previews still render (flagged Demo); the header count keeps
  // tracking owned rows only, so it shows the filtered owned count.
  const collectionQuery = collectionSearch.trim().toLowerCase();
  const filteredCollection = collectionQuery
    ? collection.filter((a) =>
        `${a.albumTitle} ${a.albumArtist}`.toLowerCase().includes(collectionQuery),
      )
    : collection;
  const filteredOwnedCollectionCount = filteredCollection.filter((a) => !a.isPreview).length;
  const collectionCountLabel = collectionQuery
    ? `Collection (${filteredOwnedCollectionCount} of ${ownedCollectionCount})`
    : `Collection (${ownedCollectionCount})`;
  // Task #2493 — Playlists filter: playlist name, case-insensitive / partial.
  const playlistQuery = playlistSearch.trim().toLowerCase();
  const filteredPlaylists = playlistQuery
    ? playlists.filter((p) => p.name.toLowerCase().includes(playlistQuery))
    : playlists;
  const playlistCountLabel = playlistQuery
    ? `Playlists (${filteredPlaylists.length} of ${playlists.length})`
    : `Playlists (${playlists.length})`;
  // Task #1342 (#6) — honest join date. Orders are sorted newest-first, so the
  // last row is the oldest. See resolveJoinedDisplay for the full rationale.
  const earliestOrderAt =
    orders.length > 0 ? orders[orders.length - 1].createdAt : null;
  const joined = resolveJoinedDisplay({
    legacyGogoodsId: c.legacyGogoodsId,
    createdAt: c.createdAt as unknown as string | null,
    earliestOrderAt,
  });

  return (
    <AdminFrame active="customers" contentWidth="wide">
      <div className="space-y-6">
        {backCrumb ? (
          <Link
            href={backCrumb.href}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)] transition-colors"
            data-testid={backCrumb.testId}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {backCrumb.name}
          </Link>
        ) : (
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)] transition-colors"
            data-testid="link-back-to-customers"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Customers
          </Link>
        )}

        <AdminPageHeader
          title={
            <span className="group inline-flex items-center gap-2">
              <span>{name}</span>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label="Edit customer identity"
                  title="Edit identity"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
                  data-testid="button-edit-customer-identity"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </span>
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {c.email}
                {c.emailVerifiedAt ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--apple-ready)] bg-[var(--apple-ready-wash)] px-1.5 py-0.5 rounded"
                    title={`Verified ${new Date(c.emailVerifiedAt as unknown as string).toLocaleDateString()}`}
                    data-testid="badge-email-verified"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-[var(--apple-subink)] bg-[var(--apple-chip)] px-1.5 py-0.5 rounded"
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
              {/* Task #538 — Phone verification state. Lives next to email
                  verification so partner-onboarding/payouts review can see
                  at a glance whether this fan has cleared the SMS gate. */}
              {(c as any).phoneE164 && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> {(c as any).phoneE164}
                  {(c as any).phoneVerifiedAt ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--apple-ready)] bg-[var(--apple-ready-wash)] px-1.5 py-0.5 rounded"
                      title={`Verified ${new Date((c as any).phoneVerifiedAt).toLocaleDateString()}`}
                      data-testid="badge-phone-verified"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Verified
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center text-xs font-semibold uppercase tracking-wide text-[var(--apple-subink)] bg-[var(--apple-chip)] px-1.5 py-0.5 rounded"
                      data-testid="badge-phone-unverified"
                    >
                      Unverified
                    </span>
                  )}
                </span>
              )}
              <span data-testid="text-joined">
                {joined.kind === "imported-no-date" ? (
                  <span className="text-slate-400">Imported from GoGoods®</span>
                ) : (
                  <>
                    Joined {formatDate(joined.iso)}
                    {joined.importedNote ? (
                      <span className="text-slate-400"> · imported from GoGoods®</span>
                    ) : null}
                  </>
                )}
              </span>
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => signInLinkMutation.mutate()}
                  disabled={signInLinkMutation.isPending}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors disabled:opacity-50"
                  data-testid="button-signin-link"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {signInLinkMutation.isPending ? "Generating…" : "Sign-in link"}
                </button>
              )}
              {c.stripeCustomerId ? (
                <a
                  href={`https://dashboard.stripe.com/customers/${c.stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
                  data-testid="link-stripe-customer"
                >
                  Stripe
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : null}
            </div>
          }
        />

        {signInLink && (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
            data-testid="panel-signin-link"
          >
            <p className="text-xs text-slate-600">
              One-tap sign-in link for {name}. Send it directly to the fan — it works once and
              expires in 30 days.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={signInLink}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700"
                data-testid="input-signin-link"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(signInLink);
                    toast({ title: "Copied" });
                  } catch {
                    /* clipboard blocked — the field is selectable as a fallback */
                  }
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors flex-shrink-0"
                data-testid="button-copy-signin-link"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Top stat strip — keeps the most-asked numbers visible without
            making the operator count rows in each section. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Orders" value={String(orders.length)} testId="stat-orders" onClick={() => jumpToSection("orders")} />
          <Stat label="Lifetime" value={formatMoney(lifetime)} testId="stat-lifetime" onClick={() => jumpToSection("orders")} />
          <Stat label="Collection" value={String(ownedCollectionCount)} testId="stat-collection" onClick={() => jumpToSection("collection")} />
          <Stat label="Playlists" value={String(playlists.length)} testId="stat-playlists" onClick={() => jumpToSection("playlists")} />
        </div>

        {/* Addresses */}
        <Section title="Addresses">
          <div className="grid sm:grid-cols-2 gap-3">
            <AddressCard
              kind="Shipping"
              snapshot={shippingResolved}
              fromOrder={shippingFromOrder}
              testId="card-shipping-address"
              onEdit={isSuperAdmin ? () => setAddressEdit("shipping") : undefined}
            />
            <AddressCard
              kind="Billing"
              snapshot={billingResolved}
              fromOrder={billingFromOrder}
              testId="card-billing-address"
              onEdit={isSuperAdmin ? () => setAddressEdit("billing") : undefined}
            />
          </div>
        </Section>

        {/* Orders */}
        <Section
          id="section-orders"
          highlighted={highlightSection === "orders"}
          title={orderCountLabel}
          action={
            orders.length > 0 ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 shadow-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  className="w-40 bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
                  placeholder="Filter orders…"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOrderSearch("");
                  }}
                  data-testid="input-search-orders"
                />
                {orderSearch && (
                  <button
                    type="button"
                    onClick={() => setOrderSearch("")}
                    className="text-slate-400 hover:text-slate-700"
                    data-testid="button-clear-order-search"
                    aria-label="Clear order search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : undefined
          }
        >
          {orders.length === 0 ? (
            <EmptyRow icon={ShoppingBag} text="No orders yet." />
          ) : filteredOrders.length === 0 ? (
            <EmptyRow icon={Search} text="No orders match your search." />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {filteredOrders.map((o) => {
                const payment = formatPaymentMethod(o);
                return (
                <div
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--apple-track)] transition-colors"
                  data-testid={`row-order-${o.id}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenOrderId(o.id)}
                    className="flex-1 min-w-0 block text-left"
                    data-testid={`button-open-order-${o.id}`}
                  >
                    <div className="text-slate-900 text-sm font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">
                        {o.albumTitle}
                        <span className="text-slate-400"> · </span>
                        <span className="text-slate-600">{o.albumArtist}</span>
                      </span>
                      {originBadge(o.origin ?? undefined)}
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5">
                      {formatDate(o.createdAt)}
                      {o.goodDeedNumber != null && <> · Good Deed #{o.goodDeedNumber}</>}
                      {payment && <> · {payment}</>}
                    </div>
                  </button>
                  <div className="text-right flex-shrink-0">
                    <div className="text-slate-900 text-sm font-medium tabular-nums">
                      {formatMoney(o.totalCents)}
                    </div>
                    <StatusPill status={o.status} />
                    {o.receiptUrl && (
                      <a
                        href={o.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                        data-testid={`link-receipt-${o.id}`}
                      >
                        Receipt
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Task #2993 — Failed checkout attempts (card declines / expired
            sessions) from the Stripe webhook, so support can confirm a
            fan's "my order didn't go through" story without opening the
            Stripe dashboard. Hidden entirely when there are none. */}
        {failedCheckouts.length > 0 && (
          <Section
            id="section-failed-checkouts"
            title={`Failed checkout attempts (${failedCheckouts.length})`}
          >
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {failedCheckouts.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 px-4 py-3"
                  data-testid={`row-failed-checkout-${f.id}`}
                >
                  <AlertTriangle className="w-4 h-4 text-[var(--apple-warning)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900 text-sm font-medium truncate">
                      {f.albumTitle ? (
                        <>
                          {f.albumTitle}
                          {f.albumArtist && (
                            <>
                              <span className="text-slate-400"> · </span>
                              <span className="text-slate-600">{f.albumArtist}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">Unknown album</span>
                      )}
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5">
                      {formatDate(f.occurredAt)}
                      {f.skuFormat && <> · {f.skuFormat}</>}
                      {f.quantity != null && f.quantity > 1 && <> · ×{f.quantity}</>}
                      {f.buyerEmail && f.buyerEmail !== c.email?.toLowerCase() && <> · {f.buyerEmail}</>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-slate-900 text-sm font-medium tabular-nums">
                      {f.amountCents != null ? formatMoney(f.amountCents) : "—"}
                    </div>
                    <span
                      className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                        f.kind === "session_expired"
                          ? "text-[var(--apple-subink)] bg-[var(--apple-chip)]"
                          : "text-[var(--apple-warning)] bg-[var(--apple-warning-wash)]"
                      }`}
                      data-testid={`badge-failed-reason-${f.id}`}
                    >
                      {checkoutFailureReasonLabel(f.kind, f.failureCode, f.failureMessage)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              These attempts never became orders — they're kept so support can confirm a
              fan's payment story. A later successful purchase appears under Orders as usual.
            </p>
          </Section>
        )}

        {/* Collection */}
        <Section
          id="section-collection"
          highlighted={highlightSection === "collection"}
          title={collectionCountLabel}
          action={
            <div className="flex items-center gap-2">
              {collection.length > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 shadow-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <input
                    className="w-40 bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
                    placeholder="Filter collection…"
                    value={collectionSearch}
                    onChange={(e) => setCollectionSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setCollectionSearch("");
                    }}
                    data-testid="input-search-collection"
                  />
                  {collectionSearch && (
                    <button
                      type="button"
                      onClick={() => setCollectionSearch("")}
                      className="text-slate-400 hover:text-slate-700"
                      data-testid="button-clear-collection-search"
                      aria-label="Clear collection search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {id ? (
                <GrantAlbumGate
                  customerId={id}
                  ownedAlbumIds={collection.filter((a) => !a.isPreview).map((a) => a.albumId)}
                  previewAlbumIds={collection.filter((a) => a.isPreview).map((a) => a.albumId)}
                />
              ) : null}
            </div>
          }
        >
          {collection.length === 0 ? (
            <EmptyRow icon={Disc3} text="No albums in this fan's collection yet." />
          ) : filteredCollection.length === 0 ? (
            <EmptyRow icon={Search} text="No albums match your search." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredCollection.map((a) =>
                a.isPreview && id ? (
                  <PreviewCollectionCard key={a.id} customerId={id} item={a} />
                ) : (
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
                        {a.certificateNumber != null
                          ? `Cert #${a.certificateNumber} · `
                          : a.grantNumber != null
                            ? `GR ${String(a.grantNumber).padStart(2, "0")} · `
                            : ""}
                        {formatDate(a.acquiredAt)}
                      </div>
                    </div>
                  </Link>
                ),
              )}
            </div>
          )}
        </Section>

        {/* Operator "Combine accounts" tool (super_admin only). Folds a
            duplicate fan account into this one — the classic case being a
            legacy fan who re-authed via Sign in with Apple and landed on a
            fresh, empty row. */}
        {isSuperAdmin && <CombineAccountsPanel anchorId={c.id} anchorName={name} />}

        {/* Task #400 — Account-merge audit. Only renders rows for fans
            who absorbed another account via the customer-side merge
            flow ("These two accounts are me"). */}
        <MergeAuditSection customerId={c.id} />

        {/* Playlists */}
        <Section
          id="section-playlists"
          highlighted={highlightSection === "playlists"}
          title={playlistCountLabel}
          action={
            playlists.length > 0 ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 shadow-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  className="w-40 bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
                  placeholder="Filter playlists…"
                  value={playlistSearch}
                  onChange={(e) => setPlaylistSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setPlaylistSearch("");
                  }}
                  data-testid="input-search-playlists"
                />
                {playlistSearch && (
                  <button
                    type="button"
                    onClick={() => setPlaylistSearch("")}
                    className="text-slate-400 hover:text-slate-700"
                    data-testid="button-clear-playlist-search"
                    aria-label="Clear playlist search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : undefined
          }
        >
          {playlists.length === 0 ? (
            <EmptyRow icon={ListMusic} text="No playlists yet." />
          ) : filteredPlaylists.length === 0 ? (
            <EmptyRow icon={Search} text="No playlists match your search." />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {filteredPlaylists.map((p) => (
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

      {/* Task #1342 (#1) — shared order detail Sheet, opened from an order row. */}
      <OrderDetailSheet orderId={openOrderId} onClose={() => setOpenOrderId(null)} />

      {/* Task #2218 — edit-identity dialog (super_admin only). */}
      {isSuperAdmin && (
        <AdminEditCustomerDialog open={editOpen} onOpenChange={setEditOpen} customer={c} />
      )}

      {/* Per Bill (2026-08-10) — edit a mailing address (super_admin only). */}
      {isSuperAdmin && addressEdit && (
        <EditAddressDialog
          kind={addressEdit}
          customerId={c.id}
          initial={addressEdit === "shipping" ? shippingResolved : billingResolved}
          onClose={() => setAddressEdit(null)}
        />
      )}
    </AdminFrame>
  );
}

function Stat({
  label,
  value,
  testId,
  onClick,
}: {
  label: string;
  value: string;
  testId?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-900 text-[18px] font-semibold tabular-nums mt-0.5">{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-lg border border-[var(--apple-hairline)] bg-white px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--apple-track)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        data-testid={testId}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3" data-testid={testId}>
      {body}
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
              className="rounded-md border border-[var(--apple-hairline)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
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

// ─── Combine accounts (super_admin) ────────────────────────────────
//
// One human, one account. When a fan ends up with two customer rows
// (classic case: a legacy fan re-auths via Sign in with Apple after a
// forced update and lands on a fresh, empty OAuth row while their library
// lives on the original row), the operator folds one into the other from
// here. The merge does NOT move OAuth links, so the SURVIVING account must
// be the one the fan signs in with — the server recommends that survivor
// and this panel surfaces sign-in methods + warns before anything that
// would break a working sign-in. Reversible from the merge history below.

type MergeCandidate = {
  id: string;
  displayName: string | null;
  email: string | null;
  contactEmail: string | null;
  hasPassword: boolean;
  isLegacy: boolean;
  providers: string[];
  albumCount: number;
  orderCount: number;
  playlistCount: number;
};
type MergePreviewAccount = {
  id: string;
  displayName: string | null;
  email: string | null;
  contactEmail: string | null;
  providers: string[];
  hasPassword: boolean;
  isLegacy: boolean;
};
type MergePreview = {
  a: MergePreviewAccount;
  b: MergePreviewAccount;
  recommendedSurvivingId: string;
  survivingId: string;
  losingId: string;
  willMove: { albums: number; orders: number; playlists: number };
  losingSignInMethods: { providers: string[]; hasPassword: boolean };
  losingHasAdminLink: boolean;
};

function providerLabel(p: string): string {
  const x = p.toLowerCase();
  if (x === "apple") return "Apple";
  if (x === "google") return "Google";
  return p.charAt(0).toUpperCase() + p.slice(1);
}
function signInSummary(providers: string[]): string {
  const labels = providers.map(providerLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
function SignInChips({ providers, hasPassword, isLegacy }: { providers: string[]; hasPassword: boolean; isLegacy: boolean }) {
  const chips: string[] = providers.map(providerLabel);
  if (hasPassword) chips.push("Password");
  if (isLegacy) chips.push("GoGoods®");
  if (chips.length === 0) {
    return <span className="text-xs text-slate-400">No sign-in method</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((cc) => (
        <span key={cc} className="text-xs font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
          {cc}
        </span>
      ))}
    </span>
  );
}
function accountTitle(a: { displayName: string | null; email: string | null; contactEmail: string | null }): string {
  return a.displayName?.trim() || a.email || a.contactEmail || "Unnamed account";
}
function accountSub(a: { displayName: string | null; email: string | null; contactEmail: string | null }): string | null {
  const title = accountTitle(a);
  const sub = a.email || a.contactEmail || null;
  return sub && sub !== title ? sub : null;
}

function CombineAccountsPanel({ anchorId, anchorName }: { anchorId: string; anchorName: string }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  // Reset the downstream confirm + acknowledgement whenever the pick or
  // direction changes, so a stale ack can't carry into a different merge.
  useEffect(() => {
    setAck(false);
    setConfirming(false);
  }, [pickedId, override]);

  const candidatesQuery = useQuery<{ candidates: MergeCandidate[] }>({
    queryKey: ["/api/admin/customers", anchorId, "merge-candidates", debouncedQ],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/customers/${anchorId}/merge-candidates?q=${encodeURIComponent(debouncedQ)}`,
      );
      return r.json();
    },
    enabled: open && debouncedQ.length >= 2 && !pickedId,
  });

  const previewQuery = useQuery<MergePreview>({
    queryKey: ["/api/admin/customers", anchorId, "merge-preview", pickedId ?? "", override ?? "auto"],
    queryFn: async () => {
      const params = new URLSearchParams({ otherId: pickedId! });
      if (override) params.set("surviving", override);
      const r = await apiRequest(
        "GET",
        `/api/admin/customers/${anchorId}/merge-preview?${params.toString()}`,
      );
      return r.json();
    },
    enabled: open && !!pickedId,
  });
  const preview = previewQuery.data;

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const p = preview!;
      const r = await apiRequest("POST", `/api/admin/customers/${p.survivingId}/merge`, {
        losingId: p.losingId,
        acknowledgeLostSignInMethods: ack,
      });
      return (await r.json()) as { ok: boolean; moved: { albums: number; orders: number; playlists: number } };
    },
    onSuccess: (res) => {
      const p = preview!;
      const m = res.moved;
      toast({
        title: "Accounts combined",
        description: `Moved ${m.albums} album${m.albums === 1 ? "" : "s"} · ${m.orders} order${m.orders === 1 ? "" : "s"} · ${m.playlists} playlist${m.playlists === 1 ? "" : "s"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", anchorId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", anchorId, "merges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", p.survivingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", p.survivingId, "merges"] });
      const survivor = p.survivingId;
      setConfirming(false);
      setAck(false);
      setPickedId(null);
      setOverride(null);
      setQ("");
      setDebouncedQ("");
      setOpen(false);
      // If the account on THIS page was the one absorbed, it's now soft-
      // deleted — hop to the survivor's page so the operator lands on a
      // live account.
      if (survivor !== anchorId) setLocation(`/admin/customers/${survivor}`);
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't combine the accounts", description: e.message, variant: "destructive" });
    },
  });

  const resetPick = () => {
    setPickedId(null);
    setOverride(null);
    setAck(false);
    setConfirming(false);
  };

  const surv = preview ? (preview.survivingId === preview.a.id ? preview.a : preview.b) : null;
  const lose = preview ? (preview.losingId === preview.a.id ? preview.a : preview.b) : null;
  const losesSignIn = !!preview && preview.losingSignInMethods.providers.length > 0;
  const blocked = !!preview?.losingHasAdminLink;
  const confirmDisabled = !preview || blocked || (losesSignIn && !ack) || mergeMutation.isPending;

  return (
    <Section title="Combine accounts">
      {!open ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Folds a duplicate fan account into {anchorName}. Use this when someone ended up with two
            accounts — for example a returning fan who signed in with Apple and landed on a fresh,
            empty account. Their orders, albums, and playlists move to the account that keeps their
            sign-in.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-sm font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
            data-testid="button-combine-open"
          >
            <Users className="w-3.5 h-3.5" />
            Find an account to combine…
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3" data-testid="panel-combine-accounts">
          {!pickedId ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name, email, or GoGoods ID…"
                    autoFocus
                    className="w-full h-9 pl-8 pr-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-[var(--brand-blue)]"
                    data-testid="input-merge-search"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                    setDebouncedQ("");
                  }}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[var(--apple-hairline)] bg-white text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors flex-shrink-0"
                  data-testid="button-combine-close"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {debouncedQ.length < 2 ? (
                <p className="text-xs text-slate-400">Type at least 2 characters to search.</p>
              ) : candidatesQuery.isLoading ? (
                <p className="text-xs text-slate-400">Searching…</p>
              ) : (candidatesQuery.data?.candidates.length ?? 0) === 0 ? (
                <p className="text-xs text-slate-400">No other accounts match “{debouncedQ}”.</p>
              ) : (
                <div className="rounded-md border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {candidatesQuery.data!.candidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => setPickedId(cand.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[var(--apple-track)] transition-colors flex items-start justify-between gap-3"
                      data-testid={`button-merge-candidate-${cand.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{accountTitle(cand)}</div>
                        {accountSub(cand) && (
                          <div className="text-xs text-slate-500 truncate">{accountSub(cand)}</div>
                        )}
                        <div className="mt-1">
                          <SignInChips providers={cand.providers} hasPassword={cand.hasPassword} isLegacy={cand.isLegacy} />
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 text-right flex-shrink-0 tabular-nums">
                        {cand.albumCount} album{cand.albumCount === 1 ? "" : "s"}
                        <br />
                        {cand.orderCount} order{cand.orderCount === 1 ? "" : "s"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : previewQuery.isLoading || !preview || !surv || !lose ? (
            <p className="text-xs text-slate-400">Building merge preview…</p>
          ) : (
            <>
              <button
                type="button"
                onClick={resetPick}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[var(--brand-blue)] transition-colors"
                data-testid="button-merge-back"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Choose a different account
              </button>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-md border border-[var(--apple-ready)]/30 bg-[var(--apple-ready-wash)] p-3" data-testid="card-merge-survivor">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--apple-ready)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Keep
                    {preview.survivingId === preview.recommendedSurvivingId && (
                      <span className="font-medium normal-case tracking-normal text-[var(--apple-ready)]">· recommended</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900 truncate">{accountTitle(surv)}</div>
                  {accountSub(surv) && <div className="text-xs text-slate-500 truncate">{accountSub(surv)}</div>}
                  <div className="mt-1.5">
                    <SignInChips providers={surv.providers} hasPassword={surv.hasPassword} isLegacy={surv.isLegacy} />
                  </div>
                </div>
                <div className="rounded-md border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3" data-testid="card-merge-loser">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--apple-subink)]">Close & absorb</div>
                  <div className="mt-1 text-sm font-medium text-slate-900 truncate">{accountTitle(lose)}</div>
                  {accountSub(lose) && <div className="text-xs text-slate-500 truncate">{accountSub(lose)}</div>}
                  <div className="mt-1.5">
                    <SignInChips providers={lose.providers} hasPassword={lose.hasPassword} isLegacy={lose.isLegacy} />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOverride(preview.losingId)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[var(--brand-blue)] transition-colors"
                data-testid="button-merge-swap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Swap — keep {accountTitle(lose)} instead
              </button>

              <p className="text-sm text-slate-600">
                Moves{" "}
                <strong className="text-slate-900 tabular-nums">{preview.willMove.albums}</strong> album
                {preview.willMove.albums === 1 ? "" : "s"} ·{" "}
                <strong className="text-slate-900 tabular-nums">{preview.willMove.orders}</strong> order
                {preview.willMove.orders === 1 ? "" : "s"} ·{" "}
                <strong className="text-slate-900 tabular-nums">{preview.willMove.playlists}</strong> playlist
                {preview.willMove.playlists === 1 ? "" : "s"} into <strong>{accountTitle(surv)}</strong>.
              </p>

              {blocked ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 flex items-start gap-2" data-testid="warn-merge-admin-link">
                  <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-900 leading-relaxed">
                    The account you’re absorbing is linked to an admin sign-in. Unlink it from the
                    admin account before combining, or pick a different direction.
                  </p>
                </div>
              ) : losesSignIn ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2" data-testid="warn-merge-lost-signin">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 leading-relaxed">
                      {accountTitle(lose)} can sign in with{" "}
                      <strong>{signInSummary(preview.losingSignInMethods.providers)}</strong>. That sign-in
                      will stop working after combining — make sure {accountTitle(surv)} is the account they
                      use going forward.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      className="rounded border-amber-300"
                      data-testid="checkbox-merge-ack"
                    />
                    I understand that sign-in will stop working.
                  </label>
                </div>
              ) : null}

              {!confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={confirmDisabled}
                  className="inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-3 h-9 text-sm font-medium text-white hover:bg-rose-800 disabled:opacity-40 transition-colors"
                  data-testid="button-combine-accounts"
                >
                  Combine accounts
                </button>
              ) : (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 space-y-2" data-testid="merge-combine-confirm">
                  <p className="text-xs text-rose-900 leading-relaxed">
                    Combine <strong>{accountTitle(lose)}</strong> into <strong>{accountTitle(surv)}</strong>?{" "}
                    {accountTitle(surv)} keeps everything; {accountTitle(lose)} is closed. You can undo this
                    from the merge history below.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => mergeMutation.mutate()}
                      disabled={confirmDisabled}
                      className="rounded-md bg-rose-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-800 disabled:opacity-40 transition-colors"
                      data-testid="button-combine-confirm"
                    >
                      {mergeMutation.isPending ? "Combining…" : "Yes, combine"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={mergeMutation.isPending}
                      className="rounded-md border border-[var(--apple-hairline)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
                      data-testid="button-combine-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Section>
  );
}

function Section({
  title,
  children,
  action,
  id,
  highlighted,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  highlighted?: boolean;
}) {
  return (
    <section
      id={id}
      className={`space-y-2 scroll-mt-20 rounded-lg transition-shadow duration-500 ${
        highlighted
          ? "ring-2 ring-[var(--brand-blue)] ring-offset-4 ring-offset-slate-50"
          : "ring-0"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type AdminAlbumLite = { id: string; title: string; artist: string; artwork: string | null };

function GrantAlbumGate({ customerId, ownedAlbumIds, previewAlbumIds }: { customerId: string; ownedAlbumIds: string[]; previewAlbumIds: string[] }) {
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  if (roleInfo?.role !== "super_admin") return null;
  return <GrantAlbumButton customerId={customerId} ownedAlbumIds={ownedAlbumIds} previewAlbumIds={previewAlbumIds} />;
}

function GrantAlbumButton({ customerId, ownedAlbumIds, previewAlbumIds }: { customerId: string; ownedAlbumIds: string[]; previewAlbumIds: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--apple-hairline)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)] transition-colors"
        data-testid="button-grant-album-open"
      >
        <Plus className="w-3.5 h-3.5" /> Grant album
      </button>
      {open && (
        <GrantAlbumDialog
          customerId={customerId}
          ownedAlbumIds={ownedAlbumIds}
          previewAlbumIds={previewAlbumIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Task #909 — human-friendly "expires in / expired N ago" for a preview
// deadline. Admin-facing, so it stays terse.
function formatExpiry(iso: string | null | undefined): { label: string; expired: boolean } {
  if (!iso) return { label: "No expiry", expired: false };
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return { label: "—", expired: false };
  const diff = ms - Date.now();
  const expired = diff <= 0;
  const mins = Math.round(Math.abs(diff) / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const span = days >= 1 ? `${days}d` : hrs >= 1 ? `${hrs}h` : `${mins}m`;
  return { label: expired ? `Expired ${span} ago` : `Expires in ${span}`, expired };
}

// datetime-local needs a `YYYY-MM-DDTHH:mm` string in LOCAL time.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Task #909 — one previewed album in the fan's collection. Shows the Demo
// chip + expiry and gives super-admin inline Extend + Remove controls.
function PreviewCollectionCard({
  customerId,
  item,
}: {
  customerId: string;
  item: Profile["collection"][number];
}) {
  const { toast } = useToast();
  const [extending, setExtending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const base = item.previewExpiresAt ? new Date(item.previewExpiresAt) : new Date(Date.now() + 24 * 3600 * 1000);
  const [when, setWhen] = useState(() => toLocalInputValue(base.getTime() > Date.now() ? base : new Date(Date.now() + 24 * 3600 * 1000)));
  const expiry = formatExpiry(item.previewExpiresAt);

  const extend = useMutation({
    mutationFn: async () => {
      const expiresAt = new Date(when);
      if (Number.isNaN(expiresAt.getTime())) throw new Error("Pick a valid date & time");
      const r = await apiRequest("POST", `/api/admin/customers/${customerId}/extend-preview`, {
        albumId: item.albumId,
        expiresAt: expiresAt.toISOString(),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || `Failed (${r.status})`);
      }
    },
    onSuccess: () => {
      toast({ title: "Preview updated", description: `${item.albumTitle} — new expiry saved.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId] });
      setExtending(false);
    },
    onError: (e: Error) => toast({ title: "Couldn't update preview", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/customers/${customerId}/revoke-album`, {
        albumId: item.albumId,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || `Failed (${r.status})`);
      }
    },
    onSuccess: () => {
      toast({ title: "Preview revoked", description: `${item.albumTitle} removed from this fan.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId] });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke preview", description: e.message, variant: "destructive" }),
  });

  return (
    <div
      className="rounded-2xl border border-[var(--apple-hairline)] bg-white overflow-hidden"
      data-testid={`card-collection-preview-${item.id}`}
    >
      <Link href={`/admin/albums/${item.albumId}`} className="block hover:opacity-95 transition-opacity">
        <div className="relative aspect-square bg-slate-100">
          {item.albumArtwork && <img src={item.albumArtwork} alt="" className="w-full h-full object-cover" />}
          <span
            className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-900/70 text-white"
            data-testid={`badge-collection-demo-${item.id}`}
          >
            Demo
          </span>
        </div>
      </Link>
      <div className="p-3">
        <div className="text-slate-900 text-sm font-medium truncate">{item.albumTitle}</div>
        <div className="text-slate-500 text-xs truncate">{item.albumArtist}</div>
        <div
          className={`text-xs mt-1 font-medium ${expiry.expired ? "text-rose-600" : "text-amber-600"}`}
          data-testid={`text-preview-expiry-${item.id}`}
        >
          {expiry.label}
        </div>

        {extending ? (
          <div className="mt-2 space-y-2">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid={`input-preview-expiry-${item.id}`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => extend.mutate()}
                disabled={extend.isPending}
                className="rounded-md bg-[var(--brand-blue)] text-white px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                data-testid={`button-preview-extend-save-${item.id}`}
              >
                {extend.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setExtending(false)}
                className="rounded-md border border-[var(--apple-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)]"
                data-testid={`button-preview-extend-cancel-${item.id}`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : removing ? (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2">
            <p className="text-xs text-rose-900 leading-snug mb-1.5">Revoke this preview now?</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="rounded-md bg-rose-700 text-white px-2.5 py-1 text-xs font-medium hover:bg-rose-800 disabled:opacity-50"
                data-testid={`button-preview-remove-confirm-${item.id}`}
              >
                {remove.isPending ? "Removing…" : "Revoke"}
              </button>
              <button
                type="button"
                onClick={() => setRemoving(false)}
                className="rounded-md border border-[var(--apple-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--apple-subink)] hover:bg-[var(--apple-track)]"
                data-testid={`button-preview-remove-cancel-${item.id}`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => setExtending(true)}
              className="text-xs font-medium text-[var(--brand-blue)] hover:underline"
              data-testid={`button-preview-extend-${item.id}`}
            >
              Extend
            </button>
            <button
              type="button"
              onClick={() => setRemoving(true)}
              className="text-xs font-medium text-rose-700 hover:text-rose-900"
              data-testid={`button-preview-remove-${item.id}`}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GrantAlbumDialog({
  customerId,
  ownedAlbumIds,
  previewAlbumIds,
  onClose,
}: {
  customerId: string;
  ownedAlbumIds: string[];
  previewAlbumIds: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  // Task #1189 — operator picks the demo expiry up front. Default 24h.
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 24 * 3600 * 1000)));
  const owned = useMemo(() => new Set(ownedAlbumIds), [ownedAlbumIds]);
  const previewing = useMemo(() => new Set(previewAlbumIds), [previewAlbumIds]);
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
    mutationFn: async (vars: { albumId: string; preview: boolean }) => {
      let body: Record<string, unknown> = { albumId: vars.albumId };
      if (vars.preview) {
        // Task #1189 — send the operator-chosen expiry up front. Fall back
        // to the server's 24h default if the field is somehow empty/invalid.
        const expiresAt = new Date(when);
        body = Number.isNaN(expiresAt.getTime())
          ? { albumId: vars.albumId, preview: true }
          : { albumId: vars.albumId, preview: true, expiresAt: expiresAt.toISOString() };
      }
      const r = await apiRequest(
        "POST",
        `/api/admin/customers/${customerId}/grant-album`,
        body,
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || `Failed (${r.status})`);
      }
    },
    onSuccess: (_, vars) => {
      const a = allAlbums.find((x) => x.id === vars.albumId);
      const expiry = formatExpiry(vars.preview ? new Date(when).toISOString() : null);
      toast({
        title: vars.preview ? `Demo granted — ${expiry.label.toLowerCase()}` : "Album granted",
        description: a ? `${a.title} — ${a.artist}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId] });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't grant album", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dialog-grant-album"
    >
      <div
        className="bg-white rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-[0_24px_60px_rgba(0,0,0,0.24)] w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--apple-hairline)]">
          <div>
            <div className="text-[var(--apple-ink)] text-[17px] font-semibold">Grant album (demo)</div>
            <div className="text-[var(--apple-subink)] text-xs">Preview = time-boxed full-playback, no order/number · Grant = permanent comp · super-admin only</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--apple-faint)] hover:text-[var(--apple-subink)]"
            data-testid="button-grant-album-close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100 space-y-2.5">
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
          {/* Task #1189 — pick the demo's expiry up front; applies to every
              Preview grant in this dialog. Defaults to 24h from now. */}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="whitespace-nowrap font-medium">Demo expires</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-grant-preview-expiry"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-[var(--apple-faint)] text-sm">Loading albums…</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState>No albums match.</AdminEmptyState>
          ) : (
            <ul className="divide-y divide-[var(--apple-hairline)]">
              {filtered.map((a) => {
                const isOwned = owned.has(a.id);
                const isPreviewing = previewing.has(a.id);
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
                      <span className="inline-flex items-center gap-1 text-[var(--apple-ready)] text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Owned
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isPreviewing && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                            data-testid={`badge-grant-demo-${a.id}`}
                          >
                            Demo
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={grant.isPending}
                          onClick={() => grant.mutate({ albumId: a.id, preview: true })}
                          className="rounded-md border border-[var(--brand-blue)] text-[var(--brand-blue)] px-2.5 py-1 text-xs font-medium hover:bg-blue-50 disabled:opacity-50"
                          data-testid={`button-preview-album-${a.id}`}
                          title="Time-boxed full-playback demo — expires at the time chosen above, no order, no GoodDeed number"
                        >
                          {isPreviewing ? "Renew preview" : "Preview"}
                        </button>
                        <button
                          type="button"
                          disabled={grant.isPending}
                          onClick={() => grant.mutate({ albumId: a.id, preview: false })}
                          className="rounded-md bg-[var(--brand-blue)] text-white px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          data-testid={`button-grant-album-${a.id}`}
                          title="Permanent free comp — mints a GoodDeed number"
                        >
                          Grant
                        </button>
                      </div>
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

function EmptyRow({ text }: { icon?: React.ComponentType<any>; text: string }) {
  return (
    <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white">
      <AdminEmptyState>{text}</AdminEmptyState>
    </div>
  );
}

function AddressCard({
  kind,
  snapshot,
  fromOrder,
  testId,
  onEdit,
}: {
  kind: string;
  snapshot: StripeAddressSnapshot | null | undefined;
  fromOrder?: boolean;
  testId?: string;
  onEdit?: () => void;
}) {
  // Task #1342 (#2) — render whatever address we resolved (customer snapshot,
  // or the latest order's address as a fallback). A row is "present" when any
  // line is filled; only show "No address on file" when truly empty.
  const lines = snapshot
    ? [
        snapshot.line1,
        snapshot.line2,
        [snapshot.city, snapshot.state, snapshot.postalCode].filter(Boolean).join(", "),
        snapshot.country,
      ].filter(Boolean)
    : [];
  // A name-only snapshot (all address lines null) means the Basil API migration
  // dropped the actual address — treat it as absent so we don't render a
  // floating name with no street. Guard on specific meaningful fields, not
  // lines.length, so a line2-only snapshot can't slip through either.
  const hasAddress =
    !!snapshot &&
    !!(snapshot.line1 || snapshot.city || snapshot.state || snapshot.postalCode || snapshot.country);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
        <MapPin className="w-3.5 h-3.5" /> {kind}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal font-medium text-slate-400 hover:text-[var(--brand-blue)] transition-colors"
            data-testid={`${testId}-edit`}
            title={`Edit ${kind.toLowerCase()} address`}
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      {hasAddress ? (
        <div className="text-slate-700 text-sm leading-snug">
          {snapshot?.name && <div className="font-medium text-slate-900">{snapshot.name}</div>}
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          {fromOrder && (
            <div className="mt-1 text-xs text-slate-400" data-testid={`${testId}-from-order`}>
              from latest order
            </div>
          )}
        </div>
      ) : (
        <div className="text-slate-400 text-sm">No {kind.toLowerCase()} address on file.</div>
      )}
    </div>
  );
}

// Per Bill (2026-08-10) — edit a fan's shipping/billing address (they moved).
// Writes the customer-level snapshot; for shipping, optionally re-points OPEN
// orders (paid, not yet shipped or handed to fulfillment) so the next label
// uses the new address.
function EditAddressDialog({
  kind,
  customerId,
  initial,
  onClose,
}: {
  kind: "shipping" | "billing";
  customerId: string;
  initial: StripeAddressSnapshot | null | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "",
  });
  // Off by default — rewriting existing orders' shipping snapshots is an
  // explicit opt-in, not a side effect of correcting the on-file address.
  const [applyToOpenOrders, setApplyToOpenOrders] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PATCH", `/api/admin/customers/${customerId}/address`, {
        kind,
        address: form,
        applyToOpenOrders: kind === "shipping" ? applyToOpenOrders : false,
      });
      return (await r.json()) as { updatedOrders?: number };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/customers/${customerId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId] });
      const n = res.updatedOrders ?? 0;
      toast({
        title: "Address updated",
        description:
          kind === "shipping"
            ? n > 0
              ? `Also applied to ${n} open order${n === 1 ? "" : "s"}.`
              : "No open orders needed updating."
            : undefined,
      });
      onClose();
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't update the address", description: e.message, variant: "destructive" }),
  });

  const field = (label: string, key: keyof typeof form, span2 = false) => (
    <label className={`block ${span2 ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      <input
        value={form[key]}
        onChange={set(key)}
        className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30 focus:border-[var(--brand-blue)]"
        data-testid={`input-address-${key}`}
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      data-testid="dialog-edit-address"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Edit {kind} address
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Updates the address on file for this customer.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {field("Full name", "name", true)}
          {field("Street address", "line1", true)}
          {field("Apt / suite / unit", "line2", true)}
          {field("City", "city")}
          {field("State / region", "state")}
          {field("ZIP / postal code", "postalCode")}
          {field("Country", "country")}
        </div>
        {kind === "shipping" && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={applyToOpenOrders}
              onChange={(e) => setApplyToOpenOrders(e.target.checked)}
              className="mt-0.5"
              data-testid="checkbox-apply-open-orders"
            />
            <span>
              Also update open orders
              <span className="block text-xs text-slate-500">
                Applies to paid orders not yet shipped or sent to fulfillment, so the
                next shipping label uses the new address.
              </span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50"
            data-testid="button-cancel-address"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (!form.line1.trim() && !form.city.trim())}
            className="h-9 px-4 rounded-md bg-[var(--brand-blue)] text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            data-testid="button-save-address"
          >
            {mutation.isPending ? "Saving…" : "Save address"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-[var(--apple-ready-wash)] text-[var(--apple-ready)]",
    shipped: "bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]",
    complete: "bg-[var(--apple-ready-wash)] text-[var(--apple-ready)]",
    completed: "bg-[var(--apple-ready-wash)] text-[var(--apple-ready)]",
    refunded: "bg-[var(--apple-critical-wash)] text-[var(--apple-critical)]",
    pending: "bg-[var(--apple-warning-wash)] text-[var(--apple-warning)]",
    cancelled: "bg-[var(--apple-chip)] text-[var(--apple-subink)]",
  };
  const cls = map[status] ?? "bg-[var(--apple-chip)] text-[var(--apple-subink)]";
  return (
    <span className={`inline-block mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  );
}
