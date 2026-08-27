// Task #3258 — landing page for the makesvinyl.com / pressesvinyl.com
// white-label family.
//
// Task #3423 — a press that carries a client-portal skin (Memphis, PMP,
// Cinq, Hellbender) renders its OWN client entrance directly at the bare
// domain: the press-branded sign-in gate (or the portal when a session /
// emailed link token is present). No interstitial "button page".
//
// Known press subdomain WITHOUT a skin: a minimal press-branded card —
// logo/name and contact line. No GoodTunes branding, and the admin login is
// never the front door here (it stays the press's back door at /admin/login).
//
// Unknown subdomain or the bare apexes: a deliberately NEUTRAL page (no
// GoodTunes branding, no press enumeration) — never an error screen.
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";
import { SKIN_COMPONENTS } from "@/pages/PressClientNextStepsBySkin";

export default function WhitelabelLanding() {
  const { brand, isLoading } = useWhitelabelBrand();

  const known = !!brand?.known;
  const SkinEntrance = brand?.skin ? SKIN_COMPONENTS[brand.skin] : undefined;

  // Skinned press — the bare domain IS the client entrance (Task #3423).
  if (!isLoading && known && SkinEntrance) {
    return <SkinEntrance />;
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6" style={{ background: "#101014" }} data-testid="whitelabel-landing">
      {isLoading ? null : known ? (
        <div className="w-full max-w-sm text-center" data-testid="whitelabel-landing-known">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt={brand?.pressName ?? "Logo"} className="mx-auto mb-6 max-h-16 max-w-[220px] object-contain" />
          ) : (
            <div className="text-2xl font-semibold text-white mb-6">{brand?.pressName}</div>
          )}
          <p className="text-[15px]" style={{ color: "#a1a1a6" }}>
            Estimates and invitations from {brand?.pressName ?? "this press"} live here.
            Open the link you were sent.
          </p>
          {brand?.contactLine ? (
            <p className="mt-10 text-[12.5px]" style={{ color: "#6e6e73" }}>{brand.contactLine}</p>
          ) : null}
        </div>
      ) : (
        <div className="w-full max-w-sm text-center" data-testid="whitelabel-landing-neutral">
          <p className="text-[15px]" style={{ color: "#a1a1a6" }}>
            There's nothing at this address yet.
          </p>
          <p className="mt-3 text-[13px]" style={{ color: "#6e6e73" }}>
            If you followed a link from an email, check the address and try again.
          </p>
        </div>
      )}
    </div>
  );
}
