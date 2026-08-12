// Press Components (Ruby handoff wiring) — one shared query + save hook for
// the four component surfaces (Vinyl / Center Labels / Stickers / Pricing).
// The GET returns every component config plus press identity in one payload,
// so all four tabs share a single cache entry.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type {
  PressComponentKey,
  VinylComponentConfig,
  JacketsComponentConfig,
  SleevesComponentConfig,
  InsertsComponentConfig,
  LabelsComponentConfig,
  StickersComponentConfig,
  PricingComponentConfig,
} from "@shared/pressComponents";

// Shared press-mark resolution: uploaded logo variants first (label/product
// logo, then square, main, light, identity icon), NEVER a hardcoded mock;
// null lets the surface fall back to a neutral initials chip. Every
// component page must render the same mark (Stickers set the precedent).
export function resolvePressMarkLogo(press: PressComponentsPayload["press"]): string | null {
  return (
    press.labelLogoUrl ||
    press.squareLogoUrl ||
    press.logoUrl ||
    press.lightLogoUrl ||
    press.identityIconUrl ||
    null
  );
}

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
  jackets: JacketsComponentConfig;
  sleeves: SleevesComponentConfig;
  labels: LabelsComponentConfig;
  inserts: InsertsComponentConfig;
  stickers: StickersComponentConfig;
  pricing: PricingComponentConfig;
};

// ── GoodDeed Certificates printing ladder (Ruby handoff, Task #3057) ──
// The press-facing batch ladder persists in the press's existing
// gooddeed_printing_json store ({ active, tiers: [{ qty, perUnitCents }] })
// via the press-manager-gated manufacturers GET/PUT (writes require
// pressUserCanEdit — staff stay view-only).
// Task #3073 — per-service ladders: `tiers` is the PRINT-ONLY ladder
// (legacy bundled rates map onto it unchanged); `finishing` is the optional
// hologram-application + shrinkwrap service with its own ladder;
// `shipToFulfillment` records whether the printer hands finished certs off
// to fulfillment. The GET normalizes older single-ladder rows to defaults.
export type GoodDeedPrintingConfig = {
  active: boolean;
  tiers: Array<{ qty: number; perUnitCents: number }>;
  finishing: {
    offered: boolean;
    tiers: Array<{ qty: number; perUnitCents: number }>;
  };
  shipToFulfillment: boolean;
};

export function useGoodDeedPrinting(pressId: string) {
  return useQuery<GoodDeedPrintingConfig>({
    queryKey: [`/api/admin/manufacturers/${pressId}/gooddeed-printing`],
  });
}

export function useSaveGoodDeedPrinting(pressId: string) {
  const qc = useQueryClient();
  const qk = [`/api/admin/manufacturers/${pressId}/gooddeed-printing`];
  return useMutation({
    mutationFn: async (config: GoodDeedPrintingConfig) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/manufacturers/${pressId}/gooddeed-printing`,
        config,
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
    // Surface failed saves instead of silently keeping optimistic local
    // state (the serial saver swallows rejections to keep its queue moving).
    onError: (err: any) => {
      toast({
        title: "Couldn't save changes",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

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
        | JacketsComponentConfig
        | SleevesComponentConfig
        | InsertsComponentConfig
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
    // Surface failed saves instead of silently keeping optimistic local
    // state — the serial saver swallows rejections to keep its queue moving,
    // so this is where the user learns a save didn't stick.
    onError: (err: any) => {
      toast({
        title: "Couldn't save changes",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
      qc.invalidateQueries({ queryKey: [`/api/press/${pressId}/components`] });
    },
  });
}
