// Task #3258 — landing page for the makesvinyl.com / pressesvinyl.com
// white-label family.
//
// Known press subdomain (mrp.makesvinyl.com): a minimal press-branded card —
// logo/name, contact line, and a Sign in affordance. Nothing else is public
// on these hosts: estimates stay behind /e/:token, the builder behind auth.
//
// Ruby handoff b912fb6 — presses with the light MRP skin (brand.skin ===
// "mrp-light") get MRP's own stylesheet rules: white canvas, gold #D9C153,
// square corners, Poppins. Dark charcoal is GoodTunes admin canon, never a
// white-label client surface. Other presses keep the previous dark card.
//
// Unknown subdomain or the bare apexes: a deliberately NEUTRAL page (no
// GoodTunes branding, no press enumeration) — never an error screen.
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";
import { useLocation } from "wouter";

const MRP_FONT = "'Poppins', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MRP_GOLD = "#D9C153";
const MRP_INK = "#1d1d1f";
const MRP_SUBINK = "#6e6e73";

export default function WhitelabelLanding() {
  const { brand, isLoading } = useWhitelabelBrand();
  const [, navigate] = useLocation();

  const known = !!brand?.known;
  const mrpLight = brand?.skin === "mrp-light";
  const accent = brand?.accentColor || "#3b82f6";
  const rounded = (brand?.cornerStyle ?? "rounded") !== "square";
  const radius = rounded ? 9999 : 10;

  if (!isLoading && known && mrpLight) {
    // MRP light skin — white canvas, one filled gold action, square corners.
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-6" style={{ background: "#ffffff", fontFamily: MRP_FONT }} data-testid="whitelabel-landing">
        <div className="w-full max-w-sm text-center" data-testid="whitelabel-landing-known">
          {brand?.lightLogoUrl || brand?.logoUrl ? (
            <img src={brand.lightLogoUrl ?? brand.logoUrl ?? undefined} alt={brand?.pressName ?? "Logo"} className="mx-auto mb-6 max-h-16 max-w-[220px] object-contain" />
          ) : (
            <div className="text-2xl font-semibold mb-6" style={{ color: MRP_INK }}>{brand?.pressName}</div>
          )}
          <p className="text-[15px]" style={{ color: MRP_SUBINK }}>
            Estimates and invitations from {brand?.pressName ?? "this press"} live here.
            Open the link you were sent, or sign in.
          </p>
          <button
            type="button"
            // Clients sign in on the portal's own login (next-steps); press
            // partners still reach /admin/login from there if needed.
            onClick={() => navigate("/next-steps")}
            className="mt-8 inline-flex items-center justify-center px-8 h-11 text-[15px] font-semibold"
            style={{ background: MRP_GOLD, color: MRP_INK, borderRadius: 0 }}
            data-testid="button-whitelabel-signin"
          >
            Sign in
          </button>
          {brand?.contactLine ? (
            <p className="mt-10 text-[12.5px]" style={{ color: MRP_SUBINK }}>{brand.contactLine}</p>
          ) : null}
        </div>
      </div>
    );
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
