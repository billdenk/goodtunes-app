// ArtistShopifyTab (Task #2914) — the artist portal's Shopify section.
// Renders the SAME connect card as /admin/shopify (artist copy variant)
// plus the artist's own connected stores and pending install links, all
// scoped server-side to the session's artist person (super-admin passes
// ?personId= for god-view). No approval gate — artists are pre-vetted.
import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShopifyConnectCard } from "@/components/admin/ShopifyConnectCard";

type Overview = {
  configured: boolean;
  stores: Array<{ id: string; shopDomain: string; storeName: string | null; installedAt: string | null }>;
  pendingLinks: Array<{ id: string; shopDomain: string; lastGeneratedAt: string }>;
};

export function ArtistShopifyTab() {
  const { toast } = useToast();
  // Super-admin god-view passes ?personId= through, mirroring every other
  // artist-portal endpoint. Artists resolve from their own session.
  const personId = new URLSearchParams(window.location.search).get("personId");
  const suffix = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const overviewKey = `/api/artist/shopify/overview${suffix}`;

  const { data, isLoading } = useQuery<Overview>({ queryKey: [overviewKey] });

  // The OAuth callback redirects an in-portal "Install directly" flow of a
  // signed-in artist back here is not wired (link installs land on a
  // neutral confirmation page) — but ?installed= may still arrive via
  // admin-style redirects when a super-admin drives the flow. Toast + refresh.
  const justInstalledId =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("installed") : null;
  useEffect(() => {
    if (justInstalledId) {
      toast({ title: "Store connected" });
      queryClient.invalidateQueries({ queryKey: [overviewKey] });
    }
  }, [justInstalledId, toast, overviewKey]);

  const mintLink = useMutation({
    mutationFn: async (shopDomain: string) => {
      const res = await apiRequest("POST", `/api/artist/shopify/install-links${suffix}`, { shopDomain });
      return (await res.json()) as { id: string };
    },
  });

  const recordLink = async (domain: string): Promise<string | null> => {
    // Artist links are ALWAYS attributed — the returned id is the token
    // the install URL carries so an anonymous clicker still lands the
    // store on this artist. Failures throw so the card surfaces them.
    const row = await mintLink.mutateAsync(domain);
    queryClient.invalidateQueries({ queryKey: [overviewKey] });
    return row.id;
  };

  return (
    <div data-testid="artist-shopify-tab">
      <ShopifyConnectCard
        variant="artist"
        configured={!!data?.configured}
        recordLink={recordLink}
      />

      <section data-testid="artist-shopify-stores">
        <h2 className="text-[15px] font-semibold text-slate-900 mb-2">Connected stores</h2>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        )}
        {!isLoading && (data?.stores.length ?? 0) === 0 && (data?.pendingLinks.length ?? 0) === 0 && (
          <div
            className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-slate-400 text-[13px]"
            data-testid="artist-shopify-empty"
          >
            No store connected yet. Connect yours above — once it's live, you can map your products to your
            releases from each album's Shopify tab.
          </div>
        )}
        <div className="space-y-2">
          {(data?.stores ?? []).map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3"
              data-testid={`row-artist-store-${s.id}`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-slate-900 truncate">{s.storeName ?? s.shopDomain}</div>
                <div className="text-[12px] text-slate-500 truncate">
                  {s.shopDomain}
                  {s.installedAt && ` · Connected ${new Date(s.installedAt).toLocaleDateString()}`}
                </div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                Live
              </span>
            </div>
          ))}
          {(data?.pendingLinks ?? []).map((l) => (
            <div
              key={l.id}
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 flex items-center gap-3"
              data-testid={`row-artist-pending-${l.id}`}
            >
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-slate-700 truncate">{l.shopDomain}</div>
                <div className="text-[12px] text-slate-500">Waiting for install — link generated {new Date(l.lastGeneratedAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
