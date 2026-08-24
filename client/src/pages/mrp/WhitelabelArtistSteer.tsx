// Task #3331 — whitelabel-host guardrail. A press-homed ARTIST signed in on
// a skinned white-label host (memphis.makesvinyl.com) must never be stranded
// in GoodTunes chrome by a deep link or the back button: the GoodTunes
// portal entry paths (post-accept welcome, artist portal, admin album list)
// steer back into the white-label client portal. Deliberately narrow:
//   • Only fires when the host's press carries the mrp-light skin (same
//     data-driven rule as MrpSkinGate) — unskinned/unknown slugs keep the
//     neutral-page behavior, so there is no redirect loop with MrpSkinGate's
//     own "/" bounce.
//   • Only steers role === "artist" — operators, press-portal users, and
//     every other partner kind on the same host are untouched.
//   • Only these exact entry paths — album detail deep-links etc. stay.
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";

const STEERED_PATHS = new Set(["/welcome-invitee", "/artist", "/admin/albums"]);

export default function WhitelabelArtistSteer() {
  const [location, navigate] = useLocation();
  const { brand, isLoading } = useWhitelabelBrand();
  const skinned = !isLoading && !!brand?.known && brand.skin === "mrp-light";
  const shouldCheck = skinned && STEERED_PATHS.has(location);

  // Server-authoritative decision: /api/me/whitelabel-landing runs the SAME
  // shared resolver as the accept/login landings (artist role + homed to the
  // press this host's slug resolves to + skin active). A GoodTunes artist
  // homed to a different press (or none) gets { landing: null } and keeps
  // their normal workflow even on this host.
  const steer = useQuery<{ landing: string | null }>({
    queryKey: ["/api/me/whitelabel-landing"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/me/whitelabel-landing");
        return r.json();
      } catch {
        // Signed out / non-partner — never steer.
        return { landing: null };
      }
    },
    enabled: shouldCheck,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (shouldCheck && steer.data?.landing) {
      navigate(steer.data.landing, { replace: true });
    }
  }, [shouldCheck, steer.data?.landing, location, navigate]);

  return null;
}
