// ShopifyConnectCard (Task #2914) — the shared "connect a store" card used
// by BOTH the super-admin /admin/shopify page and the artist portal's
// Shopify section. The `variant` drives heading, helper text, and the
// copy-link sub-label; behavior is identical: normalize the domain, mint a
// pending install-link record (which may carry owner attribution — the
// server decides), then copy the install link or start the install
// directly. When the mint returns a link id, both actions thread it via
// `?link=<id>` so the signed OAuth state carries the attribution even when
// an anonymous third party clicks the copied link.
import { useState, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Copy, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type ShopifyConnectVariant = "admin" | "artist";

// Accept either the bare subdomain or the full myshopify.com URL and
// normalize to the canonical `<sub>.myshopify.com`. Returns "" when the
// input can't be coerced into a valid shop domain. (A custom storefront
// domain like www.label.com can't be an install target — reject it rather
// than coercing to a bogus www.myshopify.com link.)
export function normalizeShopDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : "";
}

const COPY: Record<ShopifyConnectVariant, { heading: string; helper: string; copiedNote: string }> = {
  admin: {
    heading: "Connect a Shopify store",
    helper:
      "Enter the store's myshopify.com address. Install directly, or copy the install link and send it to the store owner to approve.",
    copiedNote:
      "Link copied. Send it to someone with admin access on the store — only a store admin can approve the install.",
  },
  artist: {
    heading: "Connect your Shopify store",
    helper:
      "Enter your store's myshopify.com address and click Install. You'll approve the connection on Shopify, then come back here to link your products.",
    copiedNote:
      "Link copied. Whoever opens it approves the install on Shopify — the store will show as connected here once they do.",
  },
};

export interface ShopifyConnectCardProps {
  variant: ShopifyConnectVariant;
  /** Whether SHOPIFY_API_KEY/SECRET are configured server-side. */
  configured: boolean;
  /**
   * Mint (or refresh) the pending install-link record for the domain.
   * Returns the link id when the install URL should carry `?link=<id>`
   * (attributed link), or null for a plain unattributed link. Throwing
   * aborts the copy/install with a toast — an attributed link that lost
   * its attribution silently would be worse than a visible failure.
   */
  recordLink: (domain: string) => Promise<string | null>;
  /** Extra content rendered between the helper text and the input row
   * (super-admin: not-configured warning, email snippet, owner picker). */
  children?: ReactNode;
}

export function ShopifyConnectCard({ variant, configured, recordLink, children }: ShopifyConnectCardProps) {
  const { toast } = useToast();
  const [shop, setShop] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedShop, setCopiedShop] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const copy = COPY[variant];

  const normalizedShop = normalizeShopDomain(shop);

  const buildInstallUrl = (domain: string, linkId: string | null, direct: boolean) => {
    const u = new URL("/api/shopify/install", window.location.origin);
    u.searchParams.set("shop", domain);
    if (linkId) u.searchParams.set("link", linkId);
    // Task #2918 — "Install directly" marks the initiating surface so the
    // OAuth return routes the user forward (admin Shopify page or the
    // artist portal's Shopify section) instead of the anonymous
    // close-this-tab page. Copied links never carry it.
    if (linkId && direct) u.searchParams.set("direct", variant === "artist" ? "portal" : "admin");
    return u.toString();
  };

  const copyInstallLink = async () => {
    if (!normalizedShop) return;
    let linkId: string | null = null;
    try {
      linkId = await recordLink(normalizedShop);
    } catch (e: any) {
      toast({ title: "Couldn't prepare the install link", description: e?.message, variant: "destructive" });
      return;
    }
    const url = buildInstallUrl(normalizedShop, linkId, false);
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setCopiedShop(normalizedShop);
      setCopiedLink(url);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Clipboard can be blocked — still show the readout below for
      // hand-copying.
      setCopiedShop(normalizedShop);
      setCopiedLink(url);
      toast({ title: "Couldn't copy", description: "Copy the link shown below by hand instead.", variant: "destructive" });
    }
  };

  const startInstall = async () => {
    if (!normalizedShop) return;
    let linkId: string | null = null;
    try {
      // Record first so an abandoned OAuth approval still leaves a
      // pending chip; the callback stamps it installed on completion.
      linkId = await recordLink(normalizedShop);
    } catch (e: any) {
      toast({ title: "Couldn't start the install", description: e?.message, variant: "destructive" });
      return;
    }
    window.location.href = buildInstallUrl(normalizedShop, linkId, true);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 mb-8" data-testid="shopify-connect-card">
      <h2 className="text-[15px] font-semibold text-slate-900 mb-1" data-testid="text-connect-heading">
        {copy.heading}
      </h2>
      <p className="text-[12.5px] text-slate-500 mb-3 leading-snug" data-testid="text-connect-helper">
        {copy.helper}
      </p>
      {children}
      <div className="flex gap-2">
        <input
          type="text"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="your-store.myshopify.com"
          className="flex-1 h-10 rounded-md border border-slate-300 px-3 text-[14px] focus:outline-none focus:border-[var(--brand-blue)]"
          data-testid="input-shopify-shop"
        />
        <div className="shrink-0 flex flex-col items-stretch">
          <button
            type="button"
            onClick={copyInstallLink}
            disabled={!configured || !normalizedShop}
            className="h-10 px-4 rounded-md bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-50"
            data-testid="button-shopify-copy-link"
          >
            <span className="inline-flex items-center gap-1.5">
              {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              {linkCopied ? "Copied" : "Copy install link"}
            </span>
          </button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={startInstall}
              disabled={!configured || !normalizedShop}
              className="h-10 px-4 rounded-md border border-slate-300 bg-white text-slate-700 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-50 shrink-0"
              data-testid="button-shopify-install"
            >
              <span className="inline-flex items-center gap-1.5">
                Install directly <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[240px]">
            {variant === "artist"
              ? "Use this if you're an admin on your own Shopify store."
              : "For stores you have admin access to, like a test store."}
          </TooltipContent>
        </Tooltip>
      </div>
      {variant === "artist" && (
        <p className="mt-1.5 text-[12px] text-slate-400" data-testid="text-copy-link-sublabel">
          Send this link to whoever manages your Shopify store.
        </p>
      )}
      {copiedShop && copiedShop === normalizedShop && (
        <p className="mt-2 text-[12.5px] text-emerald-700" data-testid="text-copy-install-confirmation">
          {copy.copiedNote}
        </p>
      )}
      {copiedShop && copiedShop === normalizedShop && copiedLink && (
        <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 px-3 py-2" data-testid="shopify-install-link-readout">
          <div className="text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Install link to send</div>
          <div className="font-mono text-[12.5px] text-slate-700 break-all" data-testid="text-shopify-install-link">{copiedLink}</div>
        </div>
      )}
    </section>
  );
}
