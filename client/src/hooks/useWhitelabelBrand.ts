// Task #3258 — press white-label branding for the makesvinyl.com /
// pressesvinyl.com host family. When the SPA is served from a press
// subdomain (mrp.makesvinyl.com), the login / landing / invite surfaces
// skin themselves with that press's white-label brand. On every other host
// the hook is inert (no fetch, brand null).
import { useQuery } from "@tanstack/react-query";
import { onWhitelabelHost } from "@/hooks/useAuthKind";

export type WhitelabelBrand = {
  whitelabel: boolean;
  known: boolean;
  pressName?: string | null;
  logoUrl?: string | null;
  lightLogoUrl?: string | null;
  accentColor?: string | null;
  cornerStyle?: "rounded" | "square" | null;
  contactLine?: string | null;
};

export function useWhitelabelBrand(): {
  onWhitelabel: boolean;
  brand: WhitelabelBrand | null;
  isLoading: boolean;
} {
  const active = onWhitelabelHost();
  const { data, isLoading } = useQuery<WhitelabelBrand>({
    queryKey: ["/api/whitelabel/branding"],
    enabled: active,
    staleTime: 5 * 60 * 1000,
  });
  return { onWhitelabel: active, brand: active ? (data ?? null) : null, isLoading: active && isLoading };
}
