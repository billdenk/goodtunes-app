// Task #3258 — press white-label branding for the makesvinyl.com /
// pressesvinyl.com host family. When the SPA is served from a press
// subdomain (mrp.makesvinyl.com), the login / landing / invite surfaces
// skin themselves with that press's white-label brand. On every other host
// the hook is inert (no fetch, brand null).
import { useQuery } from "@tanstack/react-query";
import { onWhitelabelHost, devWhitelabelSlug } from "@/hooks/useAuthKind";

export type WhitelabelBrand = {
  whitelabel: boolean;
  known: boolean;
  pressName?: string | null;
  logoUrl?: string | null;
  lightLogoUrl?: string | null;
  accentColor?: string | null;
  cornerStyle?: "rounded" | "square" | null;
  contactLine?: string | null;
  squareLogoUrl?: string | null;
  // Ruby handoff b912fb6 — presses with email branding skin their
  // customer-facing surfaces light ("mrp-light"); null = current defaults.
  skin?: string | null;
};

export function useWhitelabelBrand(): {
  onWhitelabel: boolean;
  brand: WhitelabelBrand | null;
  isLoading: boolean;
} {
  const active = onWhitelabelHost();
  // Dev-only ?gtwl= slug override rides to the server's own ?slug= fallback.
  const devSlug = devWhitelabelSlug();
  const { data, isLoading } = useQuery<WhitelabelBrand>({
    queryKey: [devSlug ? `/api/whitelabel/branding?slug=${devSlug}` : "/api/whitelabel/branding"],
    enabled: active,
    staleTime: 5 * 60 * 1000,
  });
  return { onWhitelabel: active, brand: active ? (data ?? null) : null, isLoading: active && isLoading };
}
