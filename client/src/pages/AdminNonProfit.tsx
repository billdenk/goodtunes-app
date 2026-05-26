import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Heart, Pencil } from "lucide-react";
import { ReferralSummaryPanel } from "@/pages/AdminPerson";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { PressLogoEditorDialog } from "@/components/admin/PressLogoEditorDialog";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { EntityAlbumsTab } from "@/components/admin/EntityAlbumsTab";
import { EntityAnalyticsTab } from "@/components/admin/EntityAnalyticsTab";
import { PayoutAccountPanel } from "@/components/admin/PayoutAccountPanel";
import { queryClient } from "@/lib/queryClient";

// Task #78 — Super-admin detail page for a non-profit partner.
// Task #283 brings it under AdminFrame (narrow) with the standard
// breadcrumb + thumbnail-pencil header that Presses, Makers, and
// Resellers use.
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export default function AdminNonProfit() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { id } = useParams<{ id: string }>();
  const npoQ = useQuery<NonProfit>({ queryKey: [`/api/non-profits/${id}`] });
  const [logoEditorOpen, setLogoEditorOpen] = useState(false);
  // Task #295 — Overview / People / Albums / Analytics parity with
  // the Maker template. Overview keeps Identity + ReferralSummary; the
  // other three tabs are shared components driven by
  // `/api/admin/non-profits/:id/...` endpoints (plus the existing
  // contacts endpoint for People).
  const [tab, setTab] = useState<"overview" | "people" | "albums" | "analytics" | "payouts">("overview");

  if (npoQ.isLoading) {
    return (
      <AdminFrame active="nonprofits" contentWidth="narrow">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (npoQ.error || !npoQ.data) {
    return (
      <AdminFrame active="nonprofits" contentWidth="narrow">
        <div className="py-20 text-center space-y-2">
          <p className="text-sm text-rose-700">
            {(npoQ.error as Error)?.message ?? "Not found"}
          </p>
          <Link href="/admin/non-profits" className="text-[var(--brand-blue)] text-sm hover:underline underline-offset-2">
            ← Back to NPOs
          </Link>
        </div>
      </AdminFrame>
    );
  }

  const npo = npoQ.data;
  const invalidateNpo = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/non-profits/${id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/non-profits"] });
  };

  return (
    <AdminFrame active="nonprofits" contentWidth="narrow">
      <div className="space-y-5" data-testid="page-admin-non-profit">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <Link href="/admin/non-profits" className="hover:text-slate-700 hover:underline underline-offset-2">
            NPOs
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {npo.name}
          </span>
        </div>

        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className="relative w-16 h-16 rounded-2xl overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 group"
            data-testid="button-edit-npo-logo"
            aria-label="Edit logo"
          >
            {npo.logoUrl ? (
              <img
                src={npo.logoUrl}
                alt={npo.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Heart className="w-7 h-7 text-slate-300" strokeWidth={1.5} />
            )}
            <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100">
              <Pencil className="w-4 h-4" />
            </span>
          </button>
          <PressLogoEditorDialog
            name={npo.name}
            logoUrl={npo.logoUrl}
            apiPath={`/api/non-profits/${npo.id}`}
            open={logoEditorOpen}
            onOpenChange={setLogoEditorOpen}
            onInvalidate={invalidateNpo}
            FallbackIcon={Heart}
            testIdPrefix="npo"
            hint="Square works best — shown on the NPOs list and anywhere this partner is credited."
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Non-profit
            </div>
            <h1
              className="text-2xl font-bold text-slate-900 truncate"
              data-testid="text-npo-admin-name"
            >
              {npo.name}
            </h1>
            {npo.websiteUrl && (
              <a
                href={npo.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--brand-blue)] hover:underline underline-offset-2"
                data-testid="link-npo-website"
              >
                {npo.websiteUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        <div
          className="flex items-end gap-5 border-b border-slate-200"
          data-testid="tabs-admin-npo"
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {([
              { key: "overview", label: "Overview" },
              { key: "people", label: "People" },
              { key: "albums", label: "Albums" },
              { key: "analytics", label: "Analytics" },
              { key: "payouts", label: "Payouts" },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "relative pb-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                  tab === t.key
                    ? "text-slate-900"
                    : "text-slate-400 hover:text-slate-700",
                ].join(" ")}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && (
          <>
            <EditablePanel
              title="Identity"
              testId="panel-npo-identity"
              endpoint={`/api/non-profits/${npo.id}`}
              values={{
                name: npo.name,
                websiteUrl: npo.websiteUrl,
              }}
              invalidate={[
                [`/api/non-profits/${npo.id}`],
                ["/api/non-profits"],
              ]}
              fields={[
                { key: "name", label: "Name", type: "text", required: true },
                {
                  key: "websiteUrl",
                  label: "Website",
                  type: "url",
                  placeholder: "https://example.org",
                },
              ]}
            />
            <ReferralSummaryPanel kind="non_profit" id={npo.id} />
          </>
        )}
        {tab === "people" && (
          <OrganizationPeople
            apiPath={`/api/non-profits/${npo.id}/people`}
            testIdPrefix="npo"
            entityKind="non_profit"
            entityId={npo.id}
            entityName={npo.name}
            blurb="People who represent this NPO. Add as many as you need."
          />
        )}
        {tab === "albums" && (
          <EntityAlbumsTab
            apiPath={`/api/admin/non-profits/${npo.id}/albums`}
            testIdPrefix="npo"
            emptyHint="No albums tied to this NPO yet — no referred artists or GoodDeed-routed orders."
          />
        )}
        {tab === "analytics" && (
          <EntityAnalyticsTab
            apiPath={`/api/admin/non-profits/${npo.id}/analytics`}
            testIdPrefix="npo"
          />
        )}
        {tab === "payouts" && (
          <PayoutAccountPanel
            ownerKind="organization"
            ownerId={npo.id}
            ownerName={npo.name}
          />
        )}
      </div>
    </AdminFrame>
  );
}

