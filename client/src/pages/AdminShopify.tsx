// AdminShopify — operator install guide + connected stores list
// (Task #49, step 10). Surfaces the one-step install link the operator
// pastes in front of a label during a pitch, plus a list of stores that
// have already installed.
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Trash2, CheckCircle2, FlaskConical, Copy, Check } from "lucide-react";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";

type Store = {
  id: string;
  shopDomain: string;
  storeName: string | null;
  scopes: string | null;
  installedAt: string | null;
  uninstalledAt: string | null;
};

type AlbumLite = { id: string; title: string; artist: string };

export function AdminShopify() {
  return (
    <AdminErrorBoundary title="Shopify admin failed to render">
      <AdminShopifyInner />
    </AdminErrorBoundary>
  );
}

function AdminShopifyInner() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [shop, setShop] = useState("");

  const { data: cfg } = useQuery<{ configured: boolean; apiKey: string | null; scopes: string }>({
    queryKey: ["/api/admin/shopify/config"],
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
    if (justInstalledId) toast({ title: "Store connected", description: "Webhooks + redemption button installed." });
  }, [justInstalledId, toast]);

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/shopify/stores/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/shopify/stores"] }),
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

  const startInstall = () => {
    let s = shop.trim().toLowerCase();
    if (!s) return;
    // Accept either the bare subdomain or the full myshopify.com URL.
    s = s.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!s.endsWith(".myshopify.com")) s = `${s.split(".")[0]}.myshopify.com`;
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(s)}`;
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8" data-testid="page-admin-shopify">
        <div className="mb-6">
          <button onClick={() => navigate("/admin")} className="text-[12px] text-slate-500 hover:text-slate-700">
            ← Back to admin
          </button>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Shopify</h1>
        <p className="text-slate-500 text-sm mb-8">
          Connect a label's Shopify store. Their physical orders flow into GoodTunes and bundled fans land on a "Get your music" CTA.
        </p>

        {/* Install guide */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 mb-8" data-testid="shopify-install-guide">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Install on a label's store</h2>
          <ol className="text-[13.5px] text-slate-700 space-y-2 list-decimal list-inside mb-4">
            <li>Ask the label for their Shopify store URL (e.g. <code className="font-mono text-[12px] bg-slate-100 px-1.5 py-0.5 rounded">tim-snider-records.myshopify.com</code>).</li>
            <li>Paste it below — we'll redirect you to Shopify for the approval click.</li>
            <li>Label clicks "Install" on the Shopify approval screen. That's the whole label-side setup.</li>
            <li>You land back here with the store listed. Open any album's <strong>Shopify</strong> tab to map a product.</li>
          </ol>
          {cfg && !cfg.configured && (
            <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[12.5px] text-rose-700 mb-4">
              <strong>Not configured yet.</strong> Set <code>SHOPIFY_API_KEY</code> and <code>SHOPIFY_API_SECRET</code> in
              Replit Secrets first (Shopify Partners → Apps → API credentials). Shopify isn't in Replit's connector
              catalog, so credentials live in Secrets rather than an OAuth connection. Optionally also set{" "}
              <code>SHOPIFY_TOKEN_KEY</code> (32-byte random) to envelope-encrypt offline access tokens at rest;
              omitted = derives from <code>SESSION_SECRET</code>.
            </div>
          )}
          <details className="text-[12.5px] text-slate-600 mb-2" data-testid="shopify-email-snippet">
            <summary className="cursor-pointer text-slate-700 font-medium">
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

          <div className="flex gap-2">
            <input
              type="text"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="example.myshopify.com"
              className="flex-1 h-10 rounded-md border border-slate-300 px-3 text-[14px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-shopify-shop"
            />
            <button
              type="button"
              onClick={startInstall}
              disabled={!cfg?.configured || !shop.trim()}
              className="h-10 px-4 rounded-md bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-50"
              data-testid="button-shopify-install"
            >
              <span className="inline-flex items-center gap-1.5">
                Install <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </button>
          </div>
        </section>

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
              className="h-10 px-4 rounded-md bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-50"
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

        {/* Connected stores */}
        <section data-testid="shopify-stores-list">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Connected stores</h2>
          {isLoading && <div className="text-slate-400 text-sm">Loading…</div>}
          {storesError && (
            <ErrorState
              error={storesErrorObj}
              onRetry={() => refetchStores()}
              title="Couldn't load connected stores"
              testId="shopify-stores-error"
            />
          )}
          {!isLoading && !storesError && (stores?.length ?? 0) === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-slate-400 text-[13.5px]">
              No stores connected yet.
            </div>
          )}
          <div className="space-y-2">
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
    </main>
  );
}
