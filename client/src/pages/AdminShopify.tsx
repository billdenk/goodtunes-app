// AdminShopify — operator install guide + connected stores list
// (Task #49, step 10). Surfaces the one-step install link the operator
// pastes in front of a label during a pitch, plus a list of stores that
// have already installed.
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, CheckCircle2, FlaskConical, Copy, Check, Pencil, ShieldAlert, ChevronDown, ChevronUp, TriangleAlert, X, Info } from "lucide-react";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { ShopifyConnectCard } from "@/components/admin/ShopifyConnectCard";
import { PersonPicker, type PersonLite } from "@/components/admin/AddPeopleMenu";
import { Skeleton } from "@/components/ui/skeleton";

type Store = {
  id: string;
  shopDomain: string;
  storeName: string | null;
  scopes: string | null;
  installedAt: string | null;
  uninstalledAt: string | null;
  digitalUnitFeeCents: number | null;
};

type AlbumLite = { id: string; title: string; artist: string };

type GdprRequest = {
  id: string;
  shopDomain: string;
  customerEmail: string;
  shopifyCustomerId: string | null;
  compiledData: unknown;
  requestedAt: string;
  fulfilledAt: string | null;
};

// Task #2892 — a generated-but-not-yet-approved install link. Server
// returns only pending entries (installed/dismissed/live-store domains
// are filtered out), so every row here renders a "Waiting for install"
// chip under Connected stores.
type InstallLink = {
  id: string;
  shopDomain: string;
  createdAt: string;
  lastGeneratedAt: string;
};

export function AdminShopify() {
  return (
    <AdminErrorBoundary title="Shopify admin failed to render">
      <AdminShopifyInner />
    </AdminErrorBoundary>
  );
}

function AdminShopifyInner() {
  const { toast } = useToast();
  // Task #2914 — optional "Store owner" attribution for the connect card.
  // Picking an artist (or label) stamps the install-link record so the
  // eventual store row lands attributed; blank keeps today's
  // unattributed behavior. Mutually exclusive: picking one clears the other.
  const [ownerPerson, setOwnerPerson] = useState<PersonLite | null>(null);
  const [ownerLabelId, setOwnerLabelId] = useState("");
  const { data: labelsList } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/labels"],
  });

  const { data: cfg } = useQuery<{ configured: boolean; apiKey: string | null; scopes: string }>({
    queryKey: ["/api/admin/shopify/config"],
  });

  const { data: gdprRequests } = useQuery<GdprRequest[]>({
    queryKey: ["/api/admin/shopify/gdpr-requests"],
  });

  const [expandedGdprId, setExpandedGdprId] = useState<string | null>(null);

  const fulfill = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("POST", `/api/admin/shopify/gdpr-requests/${id}/fulfill`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/gdpr-requests"] });
      toast({ title: "Request marked fulfilled" });
    },
    onError: (e: any) => toast({ title: "Couldn't mark fulfilled", description: e?.message, variant: "destructive" }),
  });

  const OVERDUE_DAYS = 25;
  const overdueRequests = (gdprRequests ?? []).filter((r) => {
    if (r.fulfilledAt) return false;
    const age = (Date.now() - new Date(r.requestedAt).getTime()) / (1000 * 60 * 60 * 24);
    return age >= OVERDUE_DAYS;
  });
  const {
    data: stores,
    isLoading,
    isError: storesError,
    error: storesErrorObj,
    refetch: refetchStores,
  } = useQuery<Store[]>({ queryKey: ["/api/admin/shopify/stores"] });

  // Highlight the just-installed store via the ?installed=<id> param the
  // OAuth callback redirects with.
  const justInstalledId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("installed") : null;
  useEffect(() => {
    if (justInstalledId) {
      toast({ title: "Store connected", description: "Webhooks + redemption button installed." });
      // The callback stamped the pending install-link row — drop its
      // "Waiting for install" chip now that the store row is Live.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/install-links"] });
    }
  }, [justInstalledId, toast]);

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/shopify/stores/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/stores"] }),
  });

  // Task #2892 — pending install links ("Waiting for install" chips).
  const { data: pendingInstalls } = useQuery<InstallLink[]>({
    queryKey: ["/api/admin/shopify/install-links"],
  });
  const dismissInstall = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/shopify/install-links/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/install-links"] }),
    onError: (e: any) => toast({ title: "Couldn't dismiss", description: e?.message, variant: "destructive" }),
  });
  // Record that an install link was generated for a shop, so the pending
  // chip survives reload and shows for other admins too. When a store
  // owner is picked the link becomes ATTRIBUTED — the returned id rides
  // the install URL as `?link=` and failures surface (a silently
  // unattributed link would be worse); unattributed mints stay
  // best-effort like before (the chip is a convenience, not the install).
  const recordInstallLink = async (domain: string): Promise<string | null> => {
    const attributed = !!(ownerPerson || ownerLabelId);
    try {
      const res = await apiRequest("POST", "/api/admin/shopify/install-links", {
        shopDomain: domain,
        personId: ownerPerson?.id || undefined,
        labelId: !ownerPerson && ownerLabelId ? ownerLabelId : undefined,
      });
      const row = (await res.json()) as { id: string };
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/install-links"] });
      return attributed ? row.id : null;
    } catch (e) {
      if (attributed) throw e;
      return null;
    }
  };

  // Per-store digital unit fee inline edit state
  const [editingFeeStoreId, setEditingFeeStoreId] = useState<string | null>(null);
  const [feeInputValue, setFeeInputValue] = useState("");
  const feeInputRef = useRef<HTMLInputElement>(null);
  const saveFee = useMutation({
    mutationFn: async ({ storeId, cents }: { storeId: string; cents: number }) =>
      apiRequest("PATCH", `/api/admin/shopify/stores/${storeId}`, { digitalUnitFeeCents: cents }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/stores"] });
      setEditingFeeStoreId(null);
      toast({ title: "Digital unit fee saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save fee", description: e?.message, variant: "destructive" }),
  });

  // Dev-only mint affordance. The /api/admin/shopify/dev-mint endpoint
  // 403s in production, so the panel is harmless to leave mounted —
  // the button just won't work if anyone tries it on a deployed build.
  const isDev = typeof window !== "undefined" && (window.location.hostname.includes("replit") || window.location.hostname === "localhost" || window.location.hostname.endsWith(".replit.dev"));
  const { data: albumsList } = useQuery<AlbumLite[]>({
    queryKey: ["/api/albums"],
    enabled: isDev,
  });
  const [mintAlbumId, setMintAlbumId] = useState("");
  const [mintEmail, setMintEmail] = useState("");
  const [mintName, setMintName] = useState("");
  const [mintedCode, setMintedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mint = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/shopify/dev-mint", {
        albumId: mintAlbumId,
        buyerEmail: mintEmail,
        buyerName: mintName || undefined,
      });
      return res.json() as Promise<{ code: string; reused: boolean }>;
    },
    onSuccess: (j) => {
      setMintedCode(j.code);
      toast({ title: j.reused ? "Existing code returned" : "Code minted", description: `Open /redeem/${j.code}` });
    },
    onError: (e: any) => toast({ title: "Mint failed", description: e.message, variant: "destructive" }),
  });
  const mintedUrl = mintedCode ? `${window.location.origin}/redeem/${mintedCode}` : "";

  return (
    <AdminFrame active="shopify" contentWidth="wide">
      <div data-testid="page-admin-shopify">
        <div className="mb-8">
          <AdminPageHeader
            title="Shopify"
            subtitle={`Connect a label's Shopify store. Their physical orders flow into GoodTunes and bundled fans land on a "Get your music" CTA.`}
          />
        </div>

        {/* Connect card (shared with the artist portal — Task #2914) */}
        <ShopifyConnectCard variant="admin" configured={!!cfg?.configured} recordLink={recordInstallLink}>
          {cfg && !cfg.configured && (
            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[12.5px] text-rose-700 mb-4">
              <strong>Not configured yet.</strong> Set <code>SHOPIFY_API_KEY</code> and <code>SHOPIFY_API_SECRET</code> in
              Replit Secrets first (Shopify Partners → Apps → API credentials). Shopify isn't in Replit's connector
              catalog, so credentials live in Secrets rather than an OAuth connection. Optionally also set{" "}
              <code>SHOPIFY_TOKEN_KEY</code> (32-byte random) to envelope-encrypt offline access tokens at rest;
              omitted = derives from <code>SESSION_SECRET</code>.
            </div>
          )}
          <details className="text-[12.5px] text-slate-600 mb-3" data-testid="shopify-email-snippet">
            {/* Task #2914 — Info glyph instead of the native disclosure
                triangle, which read as a play button next to "Get your
                music now". list-none + marker:hidden kills the triangle
                in both Firefox and WebKit; the details/summary toggle
                behavior is unchanged. */}
            <summary className="cursor-pointer text-slate-700 font-medium list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Add the "Get your music now" button to the label's order-confirmation email
            </summary>
            <p className="mt-2 text-slate-500">
              After install, every paid order is stamped with a <code>note_attribute</code> called{" "}
              <code>GoodTunes redemption URL</code>. In Shopify admin → Settings → Notifications →{" "}
              <strong>Order confirmation</strong>, paste this Liquid block just above the order-summary table:
            </p>
            <pre className="mt-2 text-[11.5px] bg-slate-100 text-slate-800 border border-slate-200 p-3 rounded-md overflow-x-auto leading-relaxed">{`{% for a in note_attributes %}{% if a.name == 'GoodTunes redemption URL' %}
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#319ED8;border-radius:999px;">
<a href="{{ a.value }}" style="display:inline-block;padding:12px 24px;color:#fff;text-decoration:none;font-weight:600;">
Get your music now
</a></td></tr></table>
{% endif %}{% endfor %}`}</pre>
            <p className="mt-2 text-slate-500">
              The order-status page already shows the same CTA automatically — no template edit needed for that.
            </p>
          </details>

          {/* Task #2914 — optional owner attribution. Picking an artist or
              label stamps the install-link record so the connected store
              lands attributed; blank = today's unattributed connect. */}
          <div className="mb-4" data-testid="shopify-store-owner-picker">
            <div className="text-[12px] font-medium text-slate-600 mb-1.5">Store owner (optional)</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <PersonPicker
                  value={ownerPerson}
                  onChange={(p) => {
                    setOwnerPerson(p);
                    if (p) setOwnerLabelId("");
                  }}
                  excludeIds={new Set()}
                  testIdPrefix="store-owner"
                  hidePaste
                />
              </div>
              <select
                value={ownerLabelId}
                onChange={(e) => {
                  setOwnerLabelId(e.target.value);
                  if (e.target.value) setOwnerPerson(null);
                }}
                className="h-10 rounded-md border border-slate-300 px-2 text-[13px] bg-white"
                data-testid="select-store-owner-label"
              >
                <option value="">…or a label</option>
                {(labelsList ?? []).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            {(ownerPerson || ownerLabelId) && (
              <p className="mt-1.5 text-[12px] text-slate-500" data-testid="text-store-owner-note">
                The copied install link carries this owner — the store shows up in their portal once installed.
              </p>
            )}
          </div>
        </ShopifyConnectCard>

        {/* Dev-only test mint */}
        {isDev && (
          <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-6 mb-8" data-testid="shopify-dev-mint">
            <h2 className="text-[15px] font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-amber-600" />
              Test the redemption UX (dev only)
            </h2>
            <p className="text-[12.5px] text-slate-600 mb-4">
              Skip the Shopify install. Pick an album, type any email, mint a redemption code, and open the fan-side <code>/redeem/&lt;code&gt;</code> page. Production builds reject this endpoint.
            </p>
            <div className="grid sm:grid-cols-3 gap-2 mb-3">
              <select
                value={mintAlbumId}
                onChange={(e) => setMintAlbumId(e.target.value)}
                className="h-10 rounded-md border border-slate-300 px-2 text-[13px] bg-white"
                data-testid="select-mint-album"
              >
                <option value="">Choose an album…</option>
                {(albumsList ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.title} — {a.artist}</option>
                ))}
              </select>
              <input
                type="email"
                value={mintEmail}
                onChange={(e) => setMintEmail(e.target.value)}
                placeholder="fan@example.com"
                className="h-10 rounded-md border border-slate-300 px-3 text-[13px] bg-white"
                data-testid="input-mint-email"
              />
              <input
                type="text"
                value={mintName}
                onChange={(e) => setMintName(e.target.value)}
                placeholder="Fan name (optional)"
                className="h-10 rounded-md border border-slate-300 px-3 text-[13px] bg-white"
                data-testid="input-mint-name"
              />
            </div>
            <button
              type="button"
              onClick={() => mint.mutate()}
              disabled={!mintAlbumId || !mintEmail.includes("@") || mint.isPending}
              className="h-10 px-4 rounded-full bg-[var(--apple-blue)] text-white text-[13px] font-semibold hover:brightness-110 transition disabled:opacity-50"
              data-testid="button-mint-code"
            >
              {mint.isPending ? "Minting…" : "Mint test code"}
            </button>
            {mintedCode && (
              <div className="mt-4 rounded-md bg-white border border-emerald-200 px-3 py-3" data-testid="mint-result">
                <div className="text-[11.5px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">Redemption link</div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/redeem/${mintedCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[12.5px] text-[var(--brand-blue)] truncate hover:underline"
                    data-testid="link-mint-redeem"
                  >
                    {mintedUrl}
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(mintedUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="text-slate-500 hover:text-slate-800 p-1"
                    aria-label="Copy link"
                    data-testid="button-copy-mint"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* GDPR data requests */}
        {overdueRequests.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3 mb-6" data-testid="gdpr-overdue-banner">
            <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[13px] text-amber-800">
              <strong>{overdueRequests.length} GDPR data {overdueRequests.length === 1 ? "request is" : "requests are"} overdue</strong> — Shopify requires you to return customer data within 30 days of receiving the request. Reply to the customer and click <strong>Mark fulfilled</strong> below.
            </div>
          </div>
        )}

        <section className="mb-8" data-testid="gdpr-requests-section">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-slate-500" />
            GDPR data requests
          </h2>
          {(gdprRequests === undefined) && (
            <div className="space-y-2" data-testid="gdpr-requests-loading">
              {[0].map((i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-52" />
                    <Skeleton className="h-3 w-72" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              ))}
            </div>
          )}

          {gdprRequests !== undefined && gdprRequests.length === 0 && (
            <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white">
              <AdminEmptyState testId="gdpr-requests-empty">
                No requests received. When a customer requests their data through Shopify, it appears here — you have 30 days to fulfill it.
              </AdminEmptyState>
            </div>
          )}

          {gdprRequests !== undefined && gdprRequests.length > 0 && (
            <div className="space-y-2">
              {gdprRequests.map((r) => {
                const ageMs = Date.now() - new Date(r.requestedAt).getTime();
                const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
                const isOverdue = !r.fulfilledAt && ageDays >= OVERDUE_DAYS;
                const isExpanded = expandedGdprId === r.id;
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border bg-white ${isOverdue ? "border-amber-300" : r.fulfilledAt ? "border-slate-200 opacity-60" : "border-slate-200"}`}
                    data-testid={`row-gdpr-request-${r.id}`}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-slate-900 flex items-center gap-2">
                          {r.customerEmail}
                          {isOverdue && (
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Overdue
                            </span>
                          )}
                          {r.fulfilledAt && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Fulfilled
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-slate-500">
                          {r.shopDomain} · Received {new Date(r.requestedAt).toLocaleDateString()}
                          {!r.fulfilledAt && ` · ${ageDays}d old`}
                          {r.fulfilledAt && ` · Fulfilled ${new Date(r.fulfilledAt).toLocaleDateString()}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedGdprId(isExpanded ? null : r.id)}
                        className="text-[12px] text-slate-500 hover:text-slate-900 flex items-center gap-1 shrink-0"
                        data-testid={`button-gdpr-expand-${r.id}`}
                        aria-label={isExpanded ? "Collapse compiled data" : "View compiled data"}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Data
                      </button>
                      {!r.fulfilledAt && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Mark data request for ${r.customerEmail} as fulfilled? This confirms you've returned their data.`)) {
                              fulfill.mutate(r.id);
                            }
                          }}
                          disabled={fulfill.isPending}
                          className="shrink-0 h-8 px-3 rounded-md bg-emerald-600 text-white text-[12.5px] font-medium hover:bg-emerald-700 disabled:opacity-50"
                          data-testid={`button-gdpr-fulfill-${r.id}`}
                        >
                          Mark fulfilled
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="border-t border-[var(--apple-hairline)] px-4 py-3" data-testid={`gdpr-data-${r.id}`}>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Compiled personal data</div>
                        <pre className="text-[11.5px] bg-slate-50 border border-slate-200 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-80 overflow-y-auto text-slate-700">
                          {JSON.stringify(r.compiledData, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Connected stores */}
        <section data-testid="shopify-stores-list">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Connected stores</h2>
          {isLoading && (
            <div className="space-y-2" data-testid="shopify-stores-loading">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {storesError && (
            <ErrorState
              error={storesErrorObj}
              onRetry={() => refetchStores()}
              title="Couldn't load connected stores"
              testId="shopify-stores-error"
            />
          )}
          {!isLoading && !storesError && (stores?.length ?? 0) === 0 && (pendingInstalls?.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white">
              <AdminEmptyState>No stores connected yet.</AdminEmptyState>
            </div>
          )}
          <div className="space-y-2">
            {/* Task #2892 — generated-but-unapproved install links. Server
                returns only pending entries; the OAuth callback stamps the
                row so the chip flips to the Live store row on approval. */}
            {(pendingInstalls ?? []).map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 flex items-center gap-3"
                data-testid={`row-pending-install-${p.id}`}
              >
                <div className="w-9 h-9 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center text-[13px] font-bold shrink-0">
                  {p.shopDomain.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-slate-900 truncate flex items-center gap-2">
                    {p.shopDomain}
                    <span
                      className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded shrink-0"
                      data-testid={`chip-waiting-install-${p.id}`}
                    >
                      Waiting for install
                    </span>
                  </div>
                  <div className="text-[12px] text-slate-500 truncate">
                    Install link generated {new Date(p.lastGeneratedAt).toLocaleDateString()} — flips to Live once a
                    store admin approves it.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissInstall.mutate(p.id)}
                  disabled={dismissInstall.isPending}
                  className="text-slate-400 hover:text-slate-700 p-1.5 shrink-0"
                  aria-label={`Dismiss pending install for ${p.shopDomain}`}
                  data-testid={`button-dismiss-install-${p.id}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {(stores ?? []).map((s) => {
              const live = !s.uninstalledAt;
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border bg-white px-4 py-3 flex items-center gap-3 ${
                    s.id === justInstalledId ? "border-[var(--brand-mint)] bg-emerald-50/40" : "border-slate-200"
                  }`}
                  data-testid={`row-shopify-store-${s.id}`}
                >
                  <div className="w-9 h-9 rounded-md bg-[#319ED8] text-white flex items-center justify-center text-[13px] font-bold shrink-0">
                    {(s.storeName ?? s.shopDomain).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-slate-900 truncate flex items-center gap-1.5">
                      {s.storeName ?? s.shopDomain}
                      {live && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    </div>
                    <div className="text-[12px] text-slate-500 truncate">
                      {s.shopDomain} · {live ? "Live" : "Uninstalled"}
                      {s.installedAt ? ` · ${new Date(s.installedAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  {/* Digital unit fee inline edit */}
                  <div className="flex items-center gap-1 shrink-0">
                    {editingFeeStoreId === s.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const val = Number.parseFloat(feeInputValue.replace(/[^0-9.]/g, ""));
                          if (!Number.isFinite(val) || val < 0) return;
                          saveFee.mutate({ storeId: s.id, cents: Math.round(val * 100) });
                        }}
                        className="flex items-center gap-1"
                      >
                        <input
                          ref={feeInputRef}
                          type="text"
                          value={feeInputValue}
                          onChange={(e) => setFeeInputValue(e.target.value)}
                          onBlur={() => setEditingFeeStoreId(null)}
                          className="w-16 h-6 border border-slate-300 rounded px-1.5 text-xs focus:outline-none focus:border-[var(--brand-blue)]"
                          data-testid={`input-digital-fee-${s.id}`}
                          autoFocus
                        />
                        <button type="submit" className="text-emerald-600 hover:text-emerald-700 text-xs font-medium" data-testid={`button-save-fee-${s.id}`}>
                          Save
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const current = s.digitalUnitFeeCents ?? 350;
                          setFeeInputValue((current / 100).toFixed(2));
                          setEditingFeeStoreId(s.id);
                          setTimeout(() => feeInputRef.current?.focus(), 50);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 group"
                        title="Edit digital unit fee"
                        data-testid={`button-edit-fee-${s.id}`}
                      >
                        ${((s.digitalUnitFeeCents ?? 350) / 100).toFixed(2)}/unit
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove ${s.shopDomain}? Their mappings and the OAuth token are deleted.`)) {
                        remove.mutate(s.id);
                      }
                    }}
                    className="text-slate-400 hover:text-rose-600 p-1.5"
                    aria-label="Remove store"
                    data-testid={`button-remove-store-${s.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AdminFrame>
  );
}
