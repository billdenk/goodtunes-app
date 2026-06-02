import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Factory, HeartHandshake, Star, Building2, ArrowRight } from "lucide-react";

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
    secondary: { href: "/admin/gooddeed-pricing", label: "Review GoodDeed pricing" },
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
};

const DEFAULT_VARIANT: WelcomeVariant = {
  Icon: Building2,
  blurb: () => "You're all set. Head to your dashboard to get started.",
  primary: { href: "/admin", label: "Open the dashboard" },
  footnote: "",
};

export function WelcomeInvitee() {
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

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div
        className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8"
        data-testid="welcome-invitee"
      >
        <div className="w-12 h-12 rounded-xl bg-[var(--brand-blue)]/10 flex items-center justify-center mb-5">
          <Icon className="w-6 h-6 text-[var(--brand-blue)]" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2" data-testid="text-welcome-title">
          Welcome to GoodTunes
        </h1>
        <p className="text-sm text-slate-600 mb-5" data-testid="text-welcome-blurb">
          {variant.blurb(scope)}
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
            href={variant.primary.href}
            className="flex items-center justify-center gap-2 w-full text-center bg-[var(--brand-blue)] hover:opacity-90 text-white font-semibold rounded-lg py-2.5"
            data-testid="link-welcome-primary"
          >
            {variant.primary.label} <ArrowRight className="w-4 h-4" />
          </Link>
          {variant.secondary && (
            <Link
              href={variant.secondary.href}
              className="block w-full text-center border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold rounded-lg py-2.5"
              data-testid="link-welcome-secondary"
            >
              {variant.secondary.label}
            </Link>
          )}
        </div>

        {variant.footnote && (
          <p className="mt-6 text-xs text-slate-500 text-center" data-testid="text-welcome-footnote">
            {variant.footnote}
          </p>
        )}
      </div>
    </main>
  );
}
