import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Heart, Pencil } from "lucide-react";
import { ReferralSummaryPanel, BackfillReferralPanel } from "@/pages/AdminPerson";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { PressLogoEditorDialog } from "@/components/admin/PressLogoEditorDialog";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { EntityAlbumsTab } from "@/components/admin/EntityAlbumsTab";
import { NpoAlbumLedger } from "@/components/NpoAlbumLedger";
import { EntityAnalyticsTab } from "@/components/admin/EntityAnalyticsTab";
import { PayoutAccountPanel } from "@/components/admin/PayoutAccountPanel";
import { AdminPartnerDashboard } from "@/components/admin/AdminPartnerDashboard";
import { queryClient } from "@/lib/queryClient";
import { ViewAsPartnerButton } from "@/components/admin/ViewAsPartnerButton";
import type { PartnerAddressSnapshot } from "@shared/schema";

// Task #78 — Super-admin detail page for a non-profit partner.
// Task #283 brings it under AdminFrame (narrow) with the standard
// breadcrumb + thumbnail-pencil header that Presses, Makers, and
// Resellers use.
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  // Task #490 — NPO partner mailing address.
  mailingAddress: string | null;
  // Task #517 — Places-picked structured snapshot of the same field.
  mailingAddressStruct: PartnerAddressSnapshot | null;
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
  // Task #590 — Dashboard leads, Overview demoted to second; `?tab=`
  // round-trip so deep links survive.
  type NpoTab = "dashboard" | "overview" | "people" | "albums" | "ledger" | "analytics" | "payouts";
  const NPO_TAB_KEYS: readonly NpoTab[] = ["dashboard", "overview", "people", "albums", "ledger", "analytics", "payouts"];
  const [tab, setTabState] = useState<NpoTab>(() => {
    if (typeof window === "undefined") return "dashboard";
    const q = new URLSearchParams(window.location.search).get("tab");
    return (NPO_TAB_KEYS as readonly string[]).includes(q ?? "") ? (q as NpoTab) : "dashboard";
  });
  const setTab = (next: NpoTab) => {
    setTabState(next);
    try {
      const u = new URL(window.location.href);
      if (next === "dashboard") u.searchParams.delete("tab");
      else u.searchParams.set("tab", next);
      window.history.replaceState({}, "", u.toString());
    } catch {}
  };

  if (npoQ.isLoading) {
    return (
      <AdminFrame active="nonprofits" contentWidth="wide">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (npoQ.error || !npoQ.data) {
    return (
      <AdminFrame active="nonprofits" contentWidth="wide">
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
    <AdminFrame active="nonprofits" contentWidth="wide">
      <div className="space-y-5" data-testid="page-admin-non-profit">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium min-w-0">
            <Link href="/admin/non-profits" className="hover:text-slate-700 hover:underline underline-offset-2 flex-shrink-0">
              NPOs
            </Link>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="text-slate-700 font-semibold truncate max-w-[420px]">
              {npo.name}
            </span>
          </div>
          <ViewAsPartnerButton role="non_profit" scopeId={id} label={npo.name} />
        </div>

        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => setLogoEditorOpen(true)}
            className={[
              "relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0 group",
              npo.logoUrl ? "" : "bg-white ring-1 ring-slate-200",
            ].join(" ")}
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
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 [@media(hover:none)]:bg-black/30 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
              <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                <Pencil className="w-4 h-4" />
              </span>
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
          <div className="flex items-center gap-5 overflow-x-auto min-w-0 scrollbar-hide">
            {([
              { key: "dashboard", label: "Dashboard" },
              { key: "overview", label: "Overview" },
              { key: "people", label: "People" },
              { key: "albums", label: "Albums" },
              { key: "ledger", label: "Donation ledger" },
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
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === "dashboard" && (
          <AdminPartnerDashboard
            scope="npo"
            scopeIdQs={npo.id}
            title={npo.name}
            subtitle="Non-profit dashboard"
          />
        )}

        {tab === "overview" && (
          <>
            <EditablePanel
              title="Identity"
              testId="panel-npo-identity"
              endpoint={`/api/non-profits/${npo.id}`}
              values={{
                name: npo.name,
                websiteUrl: npo.websiteUrl,
                // Task #490 — NPO partner mailing address.
                mailingAddress: npo.mailingAddress ?? "",
                // Task #517 — Places-picked structured snapshot.
                mailingAddressStruct: npo.mailingAddressStruct ?? null,
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
                {
                  key: "mailingAddress",
                  label: "Mailing address",
                  type: "address",
                  placeholder: "Where partner mail goes",
                  // Task #517 — round-trip the Places snapshot too.
                  addressKey: "mailingAddressStruct",
                },
              ]}
            />
            <ReferralSummaryPanel kind="non_profit" id={npo.id} />
            <BackfillReferralPanel kind="non_profit" id={npo.id} />
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
        {tab === "ledger" && <NpoAlbumLedger npoId={npo.id} />}
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

