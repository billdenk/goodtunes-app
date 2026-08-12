// Press Components (Ruby handoff wiring) — one shared query + save hook for
// the four component surfaces (Vinyl / Center Labels / Stickers / Pricing).
// The GET returns every component config plus press identity in one payload,
// so all four tabs share a single cache entry.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  PressComponentKey,
  VinylComponentConfig,
  LabelsComponentConfig,
  StickersComponentConfig,
  PricingComponentConfig,
} from "@shared/pressComponents";

export type PressComponentsPayload = {
  canEdit: boolean;
  press: {
    id: string;
    name: string;
    logoUrl: string | null;
    lightLogoUrl: string | null;
    squareLogoUrl: string | null;
    identityIconUrl: string | null;
    labelLogoUrl: string | null;
  };
  vinyl: VinylComponentConfig;
  labels: LabelsComponentConfig;
  stickers: StickersComponentConfig;
  pricing: PricingComponentConfig;
};

export function usePressComponents(pressId: string) {
  return useQuery<PressComponentsPayload>({
    queryKey: [`/api/press/${pressId}/components`],
  });
}

/** Atomic whole-config save for ONE component (same jsonb-merge pattern as
 * the CD/cassette catalog PUT). Invalidates the shared payload on success. */
export function useSavePressComponent(pressId: string, key: PressComponentKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      config:
        | VinylComponentConfig
        | LabelsComponentConfig
        | StickersComponentConfig
        | PricingComponentConfig,
    ) => {
      const res = await apiRequest("PUT", `/api/press/${pressId}/components/${key}`, { config });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/press/${pressId}/components`] });
    },
  });
}
