import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Factory, HeartHandshake, Star, Building2, Music2, ArrowRight } from "lucide-react";
import { useWhitelabelBrand } from "@/hooks/useWhitelabelBrand";

type RoleInfo = {
  role: string | null;
  roleScopeId: string | null;
  scopeName: string | null;
  welcomeNote: string | null;
};

// Task #933 — role-aware first-visit welcome. AcceptInvite drops a new
// partner here right after sign-up (unless an album draft is waiting),
// so the copy + next-step CTAs are tailored to what each partner type
// actually does. The inviter's welcome note renders above the actions.
type WelcomeVariant = {
  Icon: typeof Factory;
  blurb: (scope: string) => string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
  footnote: string;
};

const VARIANTS: Record<string, WelcomeVariant> = {
  manufacturer: {
    Icon: Factory,
    blurb: (s) =>
      `${s} is set up as a pressing partner. Your jobs, pricing, and payouts all live in your press dashboard.`,
    primary: { href: "/vendor", label: "Open your press dashboard" },
    footnote:
      "When an album is routed to you, the pressing job shows up on your dashboard with everything you need to quote and fulfil it.",
  },
  non_profit: {
    Icon: HeartHandshake,
    blurb: (s) =>
      `${s} is set up as a non-profit partner. Invite the artists you work with and track the support they raise from your dashboard.`,
    primary: { href: "/non-profit", label: "Open your non-profit dashboard" },
    secondary: { href: "/admin/reports", label: "See your reports" },
    footnote:
      "Every artist you refer is attributed to you, so the impact you drive rolls up in one place.",
  },
  artist: {
    Icon: Star,
    blurb: (s) =>
      `You're set up to manage releases for ${s}. Start a release and build a vinyl quote whenever you're ready.`,
    primary: { href: "/admin/albums", label: "Go to your releases" },
    footnote:
      "Your releases and quote builder live here — nothing is shared with other artists.",
  },
  label: {
    Icon: Building2,
    blurb: (s) =>
      `${s} is set up as a label partner. Your roster's releases and reports live in your label dashboard.`,
    primary: { href: "/label", label: "Open your label dashboard" },
    secondary: { href: "/admin/reports", label: "See your reports" },
    footnote:
      "Releases across your roster roll up here so you can see everything in one place.",
  },
  publisher: {
    Icon: Music2,
    blurb: (s) =>
      `You're set up as a publishing account for ${s}. Your mechanical-royalty statement and payout onboarding live in your publisher portal.`,
    primary: { href: "/publisher", label: "Open your publisher portal" },
    footnote:
      "Your statement shows per-track royalties based on units pressed. You can set up direct payouts from the portal.",
  },
};

const DEFAULT_VARIANT: WelcomeVariant = {
  Icon: Building2,
  blurb: () => "You're all set. Head to your dashboard to get started.",
  primary: { href: "/admin", label: "Open the dashboard" },
  footnote: "",
};

export function WelcomeInvitee() {
  // Task #3331 — press-branded welcome on white-label hosts. Data-driven
  // off the sanitized /api/whitelabel/branding payload (never a press-name
  // check); on every other host the hook is inert and the GoodTunes copy
  // below renders exactly as before.
  const { onWhitelabel, brand } = useWhitelabelBrand();
  const wl = onWhitelabel && brand?.known ? brand : null;
  const role = useQuery<RoleInfo>({
    queryKey: ["/api/me/role"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/me/role");
        return r.json();
      } catch {
        return { role: null, roleScopeId: null, scopeName: null, welcomeNote: null };
      }
    },
    retry: false,
  });

  const r = role.data?.role ?? null;
  const variant = (r && VARIANTS[r]) || DEFAULT_VARIANT;
  const scope = role.data?.scopeName || "your account";
  const note = role.data?.welcomeNote?.trim();
  const Icon = variant.Icon;

  // Task #3331 — white-label overrides. Skinned press → CTA into its client
  // portal (/dashboard, behind MrpSkinGate); a press whose portal skin isn't
  // enabled yet keeps today's role-based CTA but still gets the branded
  // card (graceful fallback, never a redirect loop).
  // Valid press accent tints the CTA; otherwise the default brand-blue
  // class below stands (no raw hex fallback — token stays authoritative).
  const accent = wl?.accentColor && /^#[0-9a-fA-F]{6}$/.test(wl.accentColor) ? wl.accentColor : null;
  const wlLogo = wl ? (wl.logoUrl || wl.lightLogoUrl || null) : null;
  const wlPortal = wl?.skin === "mrp-light";
  const primary = wlPortal ? { href: "/dashboard", label: "Open your dashboard" } : variant.primary;
  const secondary = wlPortal ? undefined : variant.secondary;

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div
        className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8"
        data-testid="welcome-invitee"
      >
        {wlLogo ? (
          <img src={wlLogo} alt={wl?.pressName || "Press"} className="h-10 w-auto mb-5 object-contain" data-testid="img-welcome-press-logo" />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-[var(--brand-blue)]/10 flex items-center justify-center mb-5">
            <Icon className="w-6 h-6 text-[var(--brand-blue)]" />
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-900 mb-2" data-testid="text-welcome-title">
          {wl ? `Welcome to ${wl.pressName || "your press partner"}` : "Welcome to GoodTunes"}
        </h1>
        <p className="text-sm text-slate-600 mb-5" data-testid="text-welcome-blurb">
          {wlPortal
            ? `Your projects, estimates, and files with ${wl?.pressName || "your press"} all live in your dashboard.`
            : variant.blurb(scope)}
        </p>

        {note && (
          <div
            className="mb-6 rounded-xl border border-[var(--brand-blue)]/30 bg-[var(--brand-blue)]/5 px-4 py-3"
            data-testid="welcome-note"
          >
            <div className="text-xs uppercase tracking-wide font-semibold text-[var(--brand-blue)] mb-1">
              A note for you
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{note}</p>
          </div>
        )}

        <div className="space-y-3">
          <Link
            href={primary.href}
            className="flex items-center justify-center gap-2 w-full text-center bg-[var(--brand-blue)] hover:opacity-90 text-white font-semibold rounded-lg py-2.5"
            style={wl && accent ? { backgroundColor: accent } : undefined}
            data-testid="link-welcome-primary"
          >
            {primary.label} <ArrowRight className="w-4 h-4" />
          </Link>
          {secondary && (
            <Link
              href={secondary.href}
              className="block w-full text-center border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold rounded-lg py-2.5"
              data-testid="link-welcome-secondary"
            >
              {secondary.label}
            </Link>
          )}
        </div>

        {(wlPortal ? wl?.contactLine : variant.footnote) && (
          <p className="mt-6 text-xs text-slate-500 text-center" data-testid="text-welcome-footnote">
            {wlPortal ? wl?.contactLine : variant.footnote}
          </p>
        )}
      </div>
    </main>
  );
}
