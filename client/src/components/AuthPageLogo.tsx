// Task #3329 — one logo slot for the standalone auth pages (ForgotPassword,
// ResetPassword) so a white-label host never shows a bare GoodTunes mark
// mid-flow. Mirrors LoginBrandMark in Login.tsx: on a known press white-label
// host the press mark renders (light chrome prefers the light-background
// logo, dark chrome the dark-background one — same convention as the login
// page); everywhere else the GoodTunes logo renders exactly as before.
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";
import { GoodTunesLogo } from "@/components/GoodTunesLogo";
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";

export function AuthPageLogo({ chrome, center = false }: { chrome: "light" | "dark"; center?: boolean }) {
  const { onWhitelabel, brand } = useWhitelabelBrand();
  if (onWhitelabel && brand?.known) {
    const logo =
      chrome === "light"
        ? brand.lightLogoUrl ?? brand.logoUrl
        : brand.logoUrl ?? brand.lightLogoUrl;
    if (logo) {
      return (
        <img
          src={logo}
          alt={brand.pressName ?? "Logo"}
          className={`h-10 max-w-[200px] w-auto mb-6 object-contain ${center ? "mx-auto" : ""}`}
          data-testid="img-whitelabel-auth-logo"
        />
      );
    }
    return (
      <div
        className={`text-xl font-semibold mb-6 ${chrome === "light" ? "text-slate-900" : "text-white"} ${center ? "text-center" : ""}`}
        data-testid="text-whitelabel-auth-name"
      >
        {brand.pressName}
      </div>
    );
  }
  return chrome === "light" ? (
    <img src={gtLogo} alt="GoodTunes" className={`h-10 w-auto mb-6 ${center ? "mx-auto" : ""}`} />
  ) : (
    <GoodTunesLogo size="lg" variant="white" />
  );
}
