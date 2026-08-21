// Task #3258 — landing page for the makesvinyl.com / pressesvinyl.com
// white-label family.
//
// Known press subdomain (mrp.makesvinyl.com): a minimal press-branded card —
// logo/name, contact line, and a Sign in affordance. Nothing else is public
// on these hosts: estimates stay behind /e/:token, the builder behind auth.
//
// Unknown subdomain or the bare apexes: a deliberately NEUTRAL page (no
// GoodTunes branding, no press enumeration) — never an error screen.
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";
import { useLocation } from "wouter";

export default function WhitelabelLanding() {
  const { brand, isLoading } = useWhitelabelBrand();
  const [, navigate] = useLocation();

  const known = !!brand?.known;
  const accent = brand?.accentColor || "#3b82f6";
  const rounded = (brand?.cornerStyle ?? "rounded") !== "square";
  const radius = rounded ? 9999 : 10;

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
            Open the link you were sent, or sign in.
          </p>
          <button
            type="button"
            // Press-invited partners are admin-kind accounts; /admin/login
            // resolves admin auth on this flexible host (path-based kind).
            onClick={() => navigate("/admin/login")}
            className="mt-8 inline-flex items-center justify-center px-8 h-11 text-[15px] font-semibold text-white"
            style={{ background: accent, borderRadius: radius }}
            data-testid="button-whitelabel-signin"
          >
            Sign in
          </button>
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
