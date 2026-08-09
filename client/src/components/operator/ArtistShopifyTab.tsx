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
import { ShopifyDisconnectButton } from "@/components/admin/ShopifyDisconnectButton";

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

  // Task #2918 — an in-portal "Install directly" flow now round-trips: the
  // OAuth callback redirects the signed-in artist back here with
  // ?installed=<storeId> (delegated copied links still land on the neutral
  // confirmation page). Toast + refresh so the new store shows as Live.
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
        <h2 className="text-[15px] font-semibold text-[color:var(--apple-ink)] mb-2">Connected stores</h2>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        )}
        {!isLoading && (data?.stores.length ?? 0) === 0 && (data?.pendingLinks.length ?? 0) === 0 && (
          <div
            className="rounded-lg border border-[color:var(--apple-hairline)] bg-white px-4 py-6 text-center text-[color:var(--apple-faint)] text-[13px]"
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
              className="rounded-lg border border-[color:var(--apple-hairline)] bg-white px-4 py-3 flex items-center gap-3"
              data-testid={`row-artist-store-${s.id}`}
            >
              <CheckCircle2 className="w-4 h-4 text-[color:var(--apple-ready)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-[color:var(--apple-ink)] truncate">{s.storeName ?? s.shopDomain}</div>
                <div className="text-[12px] text-[color:var(--apple-subink)] truncate">
                  {s.shopDomain}
                  {s.installedAt && ` · Connected ${new Date(s.installedAt).toLocaleDateString()}`}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--apple-subink)] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--apple-ready)]" aria-hidden />
                Live
              </span>
              <ShopifyDisconnectButton shopDomain={s.shopDomain} testId={`button-disconnect-artist-store-${s.id}`} />
            </div>
          ))}
          {(data?.pendingLinks ?? []).map((l) => (
            <div
              key={l.id}
              className="rounded-lg border border-dashed border-[color:var(--apple-hairline)] bg-[color:var(--apple-tile)] px-4 py-3 flex items-center gap-3"
              data-testid={`row-artist-pending-${l.id}`}
            >
              <Clock className="w-4 h-4 text-[color:var(--apple-faint)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-[color:var(--apple-ink)] truncate">{l.shopDomain}</div>
                <div className="text-[12px] text-[color:var(--apple-subink)]">Waiting for install — link generated {new Date(l.lastGeneratedAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
