// Task #522 — Press portal (manufacturer admin shell).
//
// Four-tab light partner shell for is_maker presses (Hellbender today,
// MRP / PMP next). Replaces the old vendor/services-only shell when
// the signed-in admin's role is `manufacturer`.
//
//   Dashboard   — reuses PartnerDashboard primitive scoped to the press.
//   Customers   — artists + labels homed to this press (defaultPressId),
//                 plus a grey-out queue for partners who just switched
//                 away (90-day window). "Invite an artist" launches a
//                 dialog that fires POST /api/press/:id/invite — the
//                 invitee's defaultPressId pins to this press on accept.
//   Pipeline    — Kanban-style columns derived from album state
//                 (invited → accepted → design → sunrise_set → selling →
//                 masters_triggered (post-approval) → locked →
//                 in_production → shipped). Each card carries the
//                 stage-specific CTA (upload invoice, mark masters
//                 triggered, send fulfillment heads-up).
//   Settings    — Profile / Staff / Catalog / Payouts / Notifications.
//                 Staff + Payouts re-mount the existing partner panels;
//                 Catalog deep-links into the existing manufacturer
//                 catalog editor under /admin/manufacturers/:id.

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { Loader2, Factory, Users, GitBranch, Settings as Cog, Upload, ExternalLink, BellRing, Sparkles, ArrowRight, Send, X as XIcon, Link2, Zap, LayoutDashboard, FileBarChart, CircleDollarSign, BookOpen, Contact, Search as SearchIcon, ChevronLeft, Disc3, Clock3, CheckCircle2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, getAuthToken, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPanel, RangePicker } from "@/components/partner/dashboard-controls";
import {
  PartnerDashboard,
  type DashboardPayload,
  type DashboardKpi,
  type PartnerRangePreset,
  RANGE_PRESETS,
  formatValue,
  TrendChart,
  ActivityList,
} from "@/components/partner/PartnerDashboard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { AdminReports } from "@/pages/AdminReports";
import { AdminGoodDeedPricing } from "@/pages/AdminGoodDeedPricing";
import { PressCatalogPanel } from "@/pages/AdminManufacturer";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { NewAlbumArtistDialog } from "@/components/admin/NewAlbumArtistDialog";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { PartnerCapabilitiesCard, PRESS_CAPABILITIES } from "@/components/admin/PartnerCapabilitiesCard";
import { PressingOrderStepper } from "@/components/admin/PressingOrderFlow";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  PersonCard,
  PersonRow,
  CreditFilterRail,
  EmptyState,
  type PersonLite,
} from "@/pages/AdminPeople";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import { PRIMARY_CREATIVE_CREDITS } from "@/components/admin/RolePicker";

// pipeline + reports stay in the union so direct ?tab= URLs still render
// their content (they're just hidden from the nav per Task #2188).
type TabId = "dashboard" | "people" | "catalog" | "pipeline" | "reports" | "pricing" | "settings";

const PRESS_TAB_IDS: TabId[] = ["dashboard", "people", "catalog", "pipeline", "reports", "pricing", "settings"];

interface MeRole { role: string; roleScopeId: string | null; }
interface PressMe {
  id: string;
  name: string;
  logoUrl: string | null;
  // Task #2191 — full-size primary nav logo for the press portal whitelabel.
  navLogoUrl?: string | null;
  isMaker: boolean;
  domain?: string | null;
  // Task #699 — false for Staff teammates. The portal hides/disables
  // every editing control when this is false; the server still 403s.
  canEdit?: boolean;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  location?: string | null;
  bio?: string | null;
  // Task #2129 — capability flags the portal's own Capabilities card renders
  // + self-toggles (Vinyl / GoodDeeds / Fulfillment).
  doesVinyl?: boolean;
  doesGoodDeed?: boolean;
  doesFulfillment?: boolean;
  // Jacket placeholder image for the catalog's VinylPreview.
  vinylPlaceholderUrl?: string | null;
}

// ─── Scoped person types (press portal only) ──────────────────────────
// Matches the shape returned by GET /api/press/:id/people/:personId
// and GET /api/press/:id/people/:personId/albums (cross-press PII stripped).
interface ScopedPersonFull {
  id: string;
  name: string;
  photoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  labelId: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  tidalUrl: string | null;
  qobuzUrl: string | null;
  deezerUrl: string | null;
  pandoraUrl: string | null;
  roles: string[];
  derivedRoles: string[];
  shape: "artist" | "contact";
  invitedByPressId: string | null;
  // Invite state — the scoped person-detail endpoint enriches the row so the
  // profile can render the right affordance (Invite / pending / accepted)
  // without a second round-trip. All optional/null-safe for older payloads.
  homed?: boolean;
  accepted?: boolean;
  pendingInvite?: {
    inviteId: string;
    acceptUrl: string;
    expiresAt: string | null;
    reviewStatus: string | null;
  } | null;
}
interface ScopedPersonAlbum {
  id: string;
  title: string;
  artist: string | null;
  artwork: string | null;
  year: number | null;
  type: string;
  isHidden: boolean;
  isGoodTunesRelease: boolean;
  editableByThisPress: boolean;
}

const STAGE_DEFS: { id: string; label: string }[] = [
  { id: "invited",            label: "Invited" },
  { id: "accepted",           label: "Accepted" },
  { id: "design",             label: "Design" },
  { id: "sunrise_set",        label: "Sunrise set" },
  { id: "selling",            label: "Selling" },
  { id: "masters_triggered",  label: "Masters triggered" },
  { id: "locked",             label: "Locked" },
  { id: "in_production",      label: "In production" },
  { id: "shipped",            label: "Shipped" },
];

export function PressPortal({ pressId, isSuperAdminView }: { pressId: string; isSuperAdminView: boolean }) {
  // Task #2075 — AdminFrame's press rail (shown on the catalog editor) and
  // any other deep link land here as `/vendor?tab=<id>`. Read it on mount so
  // those links open the right tab, and keep it in sync if the URL changes.
  // Task #2188 — Legacy `?tab=settings&settings=catalog` redirects to the
  // new top-level catalog tab so old links degrade gracefully.
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabFromUrl = params.get("tab");
  const settingsSubFromUrl = params.get("settings");
  // Task #2363 — in-portal person detail. `?person=:id` opens the scoped
  // person detail view inside the portal (People tab content area), avoiding
  // the /admin/people/:id deny-wall redirect. Cleared when changing tabs.
  const personFromUrl = params.get("person");

  const resolveTab = (t: string | null, sub: string | null): TabId => {
    if (t === "settings" && sub === "catalog") return "catalog";
    // Task #2222 — the standalone "GoodDeed pricing" view is hidden from
    // press logins (they edit it inside Catalog → format dropdown →
    // GoodDeeds). It stays reachable only in super-admin view, so a press
    // hitting ?tab=pricing directly degrades to the dashboard rather than
    // landing on a now-hidden section.
    if (t === "pricing" && !isSuperAdminView) return "dashboard";
    // The Customers tab was folded into People (People is now the single
    // directory). Old ?tab=customers deep-links degrade to People.
    if (t === "customers") return "people";
    if (t && (PRESS_TAB_IDS as string[]).includes(t)) return t as TabId;
    return "dashboard";
  };

  const [tab, setTab] = useState<TabId>(() => resolveTab(tabFromUrl, settingsSubFromUrl));
  const [openPersonId, setOpenPersonId] = useState<string | null>(() => personFromUrl ?? null);

  useEffect(() => {
    setTab(resolveTab(tabFromUrl, settingsSubFromUrl));
  }, [tabFromUrl, settingsSubFromUrl]);
  useEffect(() => {
    setOpenPersonId(personFromUrl ?? null);
  }, [personFromUrl]);
  const { data: me, isLoading } = useQuery<PressMe>({
    queryKey: [`/api/press/${pressId}/me`],
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }

  // Task #2222 — hide the redundant standalone "GoodDeed pricing" tab from
  // actual press logins (it duplicates Catalog → format dropdown → GoodDeeds).
  // Operators viewing the portal in super-admin view still see it.
  const tabs = (modulesForRole("press") as ReadonlyArray<{ id: TabId; label: string }>)
    .filter((t) => isSuperAdminView || t.id !== "pricing");

  // Cached for the catalog tab (pressDomain drives Hellbender/MRP import buttons).
  const pressDomain = me?.domain ?? null;

  // Write the active tab back to the URL (history replace, not push) so that
  // window.location.href captured by FeedbackLauncher carries the real sub-page.
  // Switching tabs always closes any open person detail.
  const handleTabChange = (newTab: TabId) => {
    setTab(newTab);
    setOpenPersonId(null);
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", newTab);
    sp.delete("person");
    history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  };

  // Task #2363 — open a person detail inside the portal (People tab area).
  // Writes `?tab=people&person=:id` to the URL for deep-link / FeedbackLauncher.
  const openPerson = (personId: string) => {
    setTab("people");
    setOpenPersonId(personId);
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", "people");
    sp.set("person", personId);
    history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  };

  // Close the person detail and return to the People list.
  const closePerson = () => {
    setOpenPersonId(null);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("person");
    history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  };

  return (
    <OperatorShell
      testId="press-shell"
      layout="leftnav"
      navIcons={{
        dashboard: LayoutDashboard,
        people: Contact,
        catalog: BookOpen,
        pipeline: GitBranch,
        reports: FileBarChart,
        pricing: CircleDollarSign,
        settings: Cog,
      }}
      roleLabel="Press portal"
      superAdminView={isSuperAdminView}
      name={me?.name ?? "Your press"}
      logoUrl={me?.logoUrl ?? null}
      navLogoUrl={me?.navLogoUrl ?? null}
      // The press wordmark already sits in the rail header (top-left), so the
      // content page header would just repeat the press name — always hide it.
      // Super-admin mode is signalled by the "Super-admin view" badge in the
      // top nav (superAdminView), not by a duplicated content-header eyebrow.
      hideHeaderIdentity
      fallbackIcon={Factory}
      tabs={tabs}
      activeTab={tab}
      onTabChange={handleTabChange}
    >
      {tab === "dashboard" && (
        <PressDashboardTab pressId={pressId} isSuperAdminView={isSuperAdminView} />
      )}
      {tab === "people" && openPersonId ? (
        <PressScopedPersonDetail
          pressId={pressId}
          personId={openPersonId}
          canEdit={me?.canEdit !== false}
          onBack={closePerson}
        />
      ) : tab === "people" && (
        <PressPeopleTab pressId={pressId} onOpenPerson={openPerson} />
      )}
      {tab === "catalog" && (
        <div className="space-y-4" data-testid="press-catalog-tab">
          <AdminPageHeader
            title="Catalog"
            subtitle="Edit your formats, color tiers, and per-quantity ladders — including the masters-prep cost per tier. Artists you invite see the resulting picker on their album's Sell panel."
            testId="heading-press-catalog"
          />
          <PressCatalogPanel
            pressId={pressId}
            pressDomain={pressDomain}
            placeholderUrl={me?.vinylPlaceholderUrl ?? null}
            hideHeading
          />
        </div>
      )}
      {tab === "pipeline" && <PipelineTab pressId={pressId} />}
      {tab === "reports" && <AdminReports embedded />}
      {tab === "pricing" && <AdminGoodDeedPricing embedded />}
      {tab === "settings" && <SettingsTab pressId={pressId} pressName={me?.name ?? ""} />}
    </OperatorShell>
  );
}

const STAGE_LABEL: Record<string, string> = {
  design: "Design",
  sunrise_set: "Sunrise set",
  selling: "Selling",
  masters_triggered: "Masters triggered",
  locked: "Locked",
  in_production: "In production",
  shipped: "Shipped",
};

// ─── People tab (press-scoped) ─────────────────────────────────────────
//
// A scoped mirror of God-View AdminPeople: the same grid/list cards, credit
// filter rail, and view toggle — but the list is fetched from the
// press-scoped /api/press/:id/people endpoint (requireAdmin +
// requirePressScope), so a press only ever sees artists homed to it or
// primary-artist on one of its albums. Cross-press isolation is enforced
// server-side; this surface never touches /api/admin/people (the deny wall
// 403s presses there). "Add an artist" creates or links the person and lands
// on their in-portal profile, where the artist invite lives (an elegant
// popup, no streaming search — identity is already known). "Invite a label"
// is a separate slim header dialog. Opening a card opens that same scoped
// profile (remove-from-press, invite, releases, etc.).

function PressPeopleTab({ pressId, onOpenPerson }: { pressId: string; onOpenPerson: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useViewMode("press-people");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [labelInviteOpen, setLabelInviteOpen] = useState(false);

  const { data: people = [], isLoading } = useQuery<PersonLite[]>({
    queryKey: [`/api/press/${pressId}/people`],
  });
  // Task #699 / #2253 — Staff teammates are read-only on People: hide the Add
  // control (the server also 403s the press create/scrape endpoints for them).
  const { data: me } = useQuery<PressMe>({
    queryKey: [`/api/press/${pressId}/me`],
  });
  const canEdit = me?.canEdit !== false;

  const toggleRole = (role: string) => {
    const k = role.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Headline credits first (RolePicker is the source of truth), then any
  // other credit actually present in the scoped data.
  const allCredits = useMemo(() => {
    const primaryKeys = new Set(PRIMARY_CREATIVE_CREDITS.map((c) => c.toLowerCase()));
    const extras = new Map<string, string>();
    for (const p of people) {
      for (const r of [...(p.roles ?? []), ...(p.derivedRoles ?? [])]) {
        const t = (r ?? "").trim();
        const k = t.toLowerCase();
        if (!k || primaryKeys.has(k) || extras.has(k)) continue;
        extras.set(k, t);
      }
    }
    const extraList = Array.from(extras.values()).sort((a, b) => a.localeCompare(b));
    return [...PRIMARY_CREATIVE_CREDITS, ...extraList];
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people.slice();
    if (selected.size > 0) {
      rows = rows.filter((p) => {
        const tags = [...(p.roles ?? []), ...(p.derivedRoles ?? [])].map((r) =>
          (r ?? "").trim().toLowerCase(),
        );
        for (const sel of Array.from(selected)) {
          if (tags.includes(sel)) return true;
        }
        return false;
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [people, search, selected]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="People"
        subtitle="Artists homed to your press, plus anyone leading an album you're pressing."
        testId="heading-press-people"
        actions={
          <>
            {searchOpen ? (
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
                <SearchIcon className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people"
                  className="w-44 text-sm bg-transparent outline-none placeholder:text-slate-400"
                  data-testid="input-search-press-people"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label="Close search"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="h-9 w-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
                aria-label="Search"
                data-testid="button-open-search-press-people"
              >
                <SearchIcon className="w-4 h-4" />
              </button>
            )}
            <ViewModeToggle value={view} onChange={setView} testIdPrefix="view-mode-press-people" />
            {canEdit && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLabelInviteOpen(true)}
                  className="h-9 rounded-full border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-sm px-4"
                  data-testid="button-invite-label"
                >
                  <Mail className="w-4 h-4 mr-2" /> Invite a label
                </Button>
                <Button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="h-9 rounded-full bg-slate-900 text-white hover:bg-slate-800 font-semibold text-sm px-4"
                  data-testid="button-add-press-person"
                >
                  <Sparkles className="w-4 h-4 mr-2" /> Add an artist
                </Button>
              </>
            )}
          </>
        }
      />

      {allCredits.length > 0 && (
        <CreditFilterRail
          credits={allCredits}
          selected={selected}
          onToggle={toggleRole}
          onClear={() => setSelected(new Set())}
        />
      )}

      {isLoading ? (
        <PanelLoading />
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0 || selected.size > 0} />
      ) : view === "grid" ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6"
          data-testid="grid-press-people"
        >
          {filtered.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              labelName={p.affiliation?.name ?? null}
              onOpen={() => onOpenPerson(p.id)}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
          data-testid="list-press-people"
        >
          {filtered.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              labelName={p.affiliation?.name ?? null}
              onOpen={() => onOpenPerson(p.id)}
            />
          ))}
        </div>
      )}

      {canEdit && (
        <NewAlbumArtistDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          mode="person"
          personApiBase={`/api/press/${pressId}`}
          localPeopleApiBase={`/api/press/${pressId}/people`}
          invalidateOnCreate={[[`/api/press/${pressId}/people`]]}
          onSkip={() => setAddOpen(false)}
          onSelect={({ id }) => {
            setAddOpen(false);
            queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/people`] });
            if (id) onOpenPerson(id);
          }}
        />
      )}

      {canEdit && (
        <LabelInviteDialog open={labelInviteOpen} onOpenChange={setLabelInviteOpen} pressId={pressId} />
      )}
    </div>
  );
}

// ─── In-portal scoped person detail ───────────────────────────────────
//
// Task #2363 — renders inside the portal's People tab content area when
// `?person=:id` is set. Uses only the press-scoped endpoints so no
// /api/admin/* calls are ever made (those 403 for manufacturers).
// Read-only profile + albums; "Remove from press" for editors only.

type PersonDetailTab = "overview" | "cover" | "releases" | "streaming";
const PERSON_DETAIL_TABS: { key: PersonDetailTab; label: string }[] = [
  { key: "overview",  label: "Overview" },
  { key: "cover",     label: "Cover" },
  { key: "releases",  label: "Releases" },
  { key: "streaming", label: "Streaming" },
];

export function PressScopedPersonDetail({
  pressId,
  personId,
  canEdit,
  onBack,
}: {
  pressId: string;
  personId: string;
  canEdit: boolean;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<PersonDetailTab>("overview");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: person, isLoading, error } = useQuery<ScopedPersonFull>({
    queryKey: [`/api/press/${pressId}/people/${personId}`],
  });
  const { data: albums = [], isLoading: albumsLoading } = useQuery<ScopedPersonAlbum[]>({
    queryKey: [`/api/press/${pressId}/people/${personId}/albums`],
  });

  const removeFromPress = useMutation({
    mutationFn: () => apiRequest("POST", `/api/press/${pressId}/people/${personId}/remove`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/people`] });
      toast({ title: "Removed from your press." });
      setRemoveConfirmOpen(false);
      onBack();
    },
    onError: (e: any) => {
      toast({ title: "Couldn't remove from press", description: e?.message ?? "", variant: "destructive" });
    },
  });

  if (isLoading) return <PanelLoading />;

  if (error || !person) {
    return (
      <div className="py-16 text-center space-y-3" data-testid="press-person-not-found">
        <p className="text-slate-500 text-sm">Person not found or not in your press scope.</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[color:var(--brand-blue)] text-sm hover:underline"
          data-testid="button-back-to-people"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to People
        </button>
      </div>
    );
  }

  const credits = Array.from(
    new Map(
      [...(person.roles ?? []), ...(person.derivedRoles ?? [])]
        .map((r) => (r ?? "").trim())
        .filter(Boolean)
        .map((c) => [c.toLowerCase(), c]),
    ).values(),
  );

  const streamingLinks = [
    { label: "Apple Music", url: person.appleMusicUrl },
    { label: "Spotify",     url: person.spotifyUrl },
    { label: "Tidal",       url: person.tidalUrl },
    { label: "Qobuz",       url: person.qobuzUrl },
    { label: "Deezer",      url: person.deezerUrl },
    { label: "Pandora",     url: person.pandoraUrl },
  ].filter((l): l is { label: string; url: string } => !!l.url);

  const gtReleases = albums.filter((a) => a.isGoodTunesRelease);
  const hiddenCount = gtReleases.filter((a) => a.isHidden).length;

  return (
    <div className="space-y-5" data-testid={`press-person-detail-${personId}`}>
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-[color:var(--brand-blue)] transition-colors"
          data-testid="link-back-to-people"
        >
          People
        </button>
        <ChevronLeft className="w-3 h-3 rotate-180 flex-shrink-0" />
        <span className="text-slate-700 font-semibold truncate max-w-[420px]">{person.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-5">
        <div
          className="rounded-full overflow-hidden flex-shrink-0 bg-[color:var(--brand-blue)] ring-1 ring-slate-200"
          style={{ width: 80, height: 80 }}
          data-testid="img-person-photo"
        >
          {person.photoUrl ? (
            <img src={person.photoUrl} alt={person.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
              {person.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            {person.shape === "artist" ? "Artist" : "Contact"}
          </div>
          <h1 className="text-slate-900 text-[24px] font-bold tracking-tight mt-0.5 truncate" data-testid="heading-person-name">
            {person.name}
          </h1>
          {person.bio && (
            <p className="text-slate-500 text-[13px] mt-1 line-clamp-2 max-w-xl">{person.bio}</p>
          )}
        </div>
        {/* Invite affordance — pending state shows a status chip + resend/
            revoke; accepted shows a subtle chip; otherwise an elegant on-brand
            Invite button (identity is known, so the popup skips search). */}
        <div className="flex-shrink-0 self-center">
          {person.pendingInvite ? (
            <div className="flex items-center gap-2" data-testid="press-person-invite-pending">
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-semibold">
                <Clock3 className="w-3.5 h-3.5" />
                {person.pendingInvite.reviewStatus === "pending_review" ? "Pending review" : "Invited"}
              </span>
              {canEdit && (
                <InviteActions
                  pressId={pressId}
                  inviteId={person.pendingInvite.inviteId}
                  acceptUrl={person.pendingInvite.acceptUrl}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/people/${personId}`] })}
                />
              )}
            </div>
          ) : person.accepted ? (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-xs font-semibold" data-testid="press-person-invite-accepted">
              <CheckCircle2 className="w-3.5 h-3.5" />
              On GoodTunes
            </span>
          ) : canEdit ? (
            <Button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="h-9 rounded-full px-4 border-0 font-semibold text-sm text-white shadow-sm bg-gradient-to-r from-[color:var(--brand-blue)] to-[color:var(--brand-purple)] hover:opacity-95"
              data-testid="button-invite-person"
            >
              <Send className="w-4 h-4 mr-2" /> Invite
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs + Remove action */}
      <div className="flex items-end justify-between gap-5 border-b border-slate-200" data-testid="tabs-press-person">
        <div className="flex items-center gap-5 overflow-x-auto min-w-0 scrollbar-hide">
          {PERSON_DETAIL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "relative pb-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                tab === t.key ? "text-slate-900" : "text-slate-400 hover:text-slate-700",
              ].join(" ")}
              data-testid={`tab-person-${t.key}`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[color:var(--brand-blue)] rounded-full" />
              )}
            </button>
          ))}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setRemoveConfirmOpen(true)}
            disabled={removeFromPress.isPending}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 mb-1 rounded-md text-xs font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
            data-testid="button-remove-from-press"
          >
            Remove from press
          </button>
        )}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-4" data-testid="panel-press-person-overview">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            {person.bio && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bio</div>
                <p className="text-slate-600 text-sm mt-1 whitespace-pre-line">{person.bio}</p>
              </div>
            )}
            {credits.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Credits</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {credits.map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {!person.bio && credits.length === 0 && (
              <p className="text-slate-500 text-sm">No profile details on file.</p>
            )}
          </div>
          <p className="text-slate-400 text-xs px-1">
            Artist profile details are managed by GoodTunes. Use the Releases tab to manage the albums associated with your press.
          </p>
        </div>
      )}

      {tab === "cover" && (
        <div className="space-y-3" data-testid="panel-press-person-cover">
          <div className="aspect-[3/1] w-full rounded-2xl overflow-hidden bg-slate-100 ring-1 ring-slate-200">
            {person.coverUrl ? (
              <img src={person.coverUrl} alt={`${person.name} cover`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                No cover image
              </div>
            )}
          </div>
          <p className="text-slate-400 text-xs px-1">The artist's cover image is managed by GoodTunes.</p>
        </div>
      )}

      {tab === "releases" && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="panel-press-person-releases">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="min-w-0">
              <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
                <Disc3 className="w-4 h-4 text-slate-400" />
                GoodTunes® Releases
              </h2>
              <p className="text-slate-400 text-[11.5px]">
                {gtReleases.length === 0
                  ? "No GoodTunes® releases for this artist yet."
                  : `${gtReleases.length - hiddenCount} release${gtReleases.length - hiddenCount === 1 ? "" : "s"} fans can play in-app${hiddenCount ? ` · ${hiddenCount} hidden` : ""}`}
              </p>
            </div>
          </div>
          {albumsLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : gtReleases.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No GoodTunes® releases yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {gtReleases.map((a) => (
                <li
                  key={a.id}
                  className={[
                    "flex items-center gap-3 px-5 py-3",
                    !a.editableByThisPress ? "opacity-50" : "",
                  ].join(" ")}
                  data-testid={`row-release-${a.id}`}
                  title={!a.editableByThisPress ? "Homed to another press" : undefined}
                >
                  <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden flex-shrink-0">
                    {a.artwork && (
                      <img src={a.artwork} alt={a.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-900 text-sm font-semibold truncate">{a.title}</div>
                    <div className="text-slate-400 text-xs">
                      {a.type}{a.year ? ` · ${a.year}` : ""}
                      {a.isHidden ? " · Hidden" : ""}
                      {!a.editableByThisPress ? " · Another press" : ""}
                    </div>
                  </div>
                  {a.editableByThisPress && (
                    <Link
                      href={`/admin/albums/${a.id}`}
                      className="text-[color:var(--brand-blue)] text-xs hover:underline flex-shrink-0"
                      data-testid={`link-release-${a.id}`}
                    >
                      Open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "streaming" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" data-testid="panel-press-person-streaming">
          <h2 className="text-slate-900 text-sm font-bold">Streaming</h2>
          {streamingLinks.length === 0 ? (
            <p className="text-slate-500 text-xs">No streaming links on file.</p>
          ) : (
            <ul className="space-y-1.5">
              {streamingLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--brand-blue)] text-sm hover:underline"
                    data-testid={`link-streaming-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Remove confirm dialog */}
      {removeConfirmOpen && (
        <Dialog open={true} onOpenChange={(o) => !o && setRemoveConfirmOpen(false)}>
          <DialogContent className="bg-white text-slate-900 border border-slate-200 max-w-sm" data-testid="dialog-remove-from-press">
            <DialogHeader>
              <DialogTitle>Remove {person.name} from your press?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              This unhomes the artist from your press. Their profile and releases remain on GoodTunes — they can be re-invited later.
            </p>
            <DialogFooter className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemoveConfirmOpen(false)}
                disabled={removeFromPress.isPending}
                data-testid="button-cancel-remove"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => removeFromPress.mutate()}
                disabled={removeFromPress.isPending}
                className="bg-rose-600 text-white hover:bg-rose-700"
                data-testid="button-confirm-remove"
              >
                {removeFromPress.isPending ? "Removing…" : "Remove from press"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <InvitePersonDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        pressId={pressId}
        personId={personId}
        personName={person.name}
      />
    </div>
  );
}

// ─── Dashboard summary card (press-specific) ───────────────────────────

interface PressSummary {
  customerCount: number;
  pendingInvites: number;
  totalAlbums: number;
  unitsLast30d: number;
  unitsNext90d: number;
  // Task #2188 — revenue KPIs surfaced on Dashboard so presses see sales
  // without needing to open the Reports tab.
  revenueLast30dCents: number;
  revenueLifetimeCents: number;
  byStage: Record<string, number>;
}

const PRESS_STAGE_ORDER = ["design","sunrise_set","selling","masters_triggered","locked","in_production","shipped"] as const;

function PressDashboardTab({
  pressId,
  isSuperAdminView,
}: {
  pressId: string;
  isSuperAdminView: boolean;
}) {
  const [preset, setPreset] = useState<PartnerRangePreset>("30d");

  const qs = useMemo(() => {
    const u = new URLSearchParams({ range: preset });
    if (isSuperAdminView) {
      u.set("scopeId", pressId);
      u.set("scopeKind", "manufacturer");
    }
    return u.toString();
  }, [preset, pressId, isSuperAdminView]);

  const { data: summary, isLoading: summaryLoading } = useQuery<PressSummary>({
    queryKey: [`/api/press/${pressId}/summary`],
  });

  const { data: dash, isLoading: dashLoading } = useQuery<DashboardPayload>({
    queryKey: [`/api/partner/vendor/dashboard?${qs}`],
  });

  const isLoading = summaryLoading || dashLoading;

  const pressKpis: DashboardKpi[] = summary
    ? [
        { id: "revenue-30d", label: "Sales · last 30d", value: summary.revenueLast30dCents, format: "currency" },
        { id: "revenue-lifetime", label: "Sales · lifetime", value: summary.revenueLifetimeCents, format: "currency" },
        { id: "units-30d", label: "Units · last 30d", value: summary.unitsLast30d, format: "number" },
        { id: "customers", label: "Customers", value: summary.customerCount, format: "number" },
        { id: "pipeline", label: "Albums in pipeline", value: summary.totalAlbums, format: "number" },
      ]
    : [];

  const allKpis: DashboardKpi[] = [...pressKpis, ...(dash?.kpis ?? [])];

  return (
    <div className="space-y-5" data-testid="press-dashboard">
      <AdminPageHeader
        title="Dashboard"
        subtitle="Press at a glance and operational activity."
        testId="heading-press-dashboard"
        actions={
          <RangePicker
            presets={RANGE_PRESETS}
            value={preset}
            onChange={setPreset}
            testId="range-picker-press"
          />
        }
      />

      {/* Unified KPI row */}
      <section
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        data-testid="kpi-grid-press"
      >
        {isLoading && allKpis.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white h-[120px] animate-pulse" />
            ))
          : allKpis.map((k) => {
              const showDelta = !k.comingSoon && k.value !== null && k.prior != null;
              const positive = showDelta && (k.value ?? 0) >= (k.prior as number);
              const deltaStr = showDelta
                ? k.prior === 0
                  ? (k.value ?? 0) > 0 ? "+∞" : "—"
                  : `${(((k.value ?? 0) - (k.prior as number)) / (k.prior as number)) >= 0 ? "+" : ""}${((((k.value ?? 0) - (k.prior as number)) / (k.prior as number)) * 100).toFixed(1)}%`
                : null;
              return (
                <div
                  key={k.id}
                  data-testid={`kpi-press-${k.id}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between min-h-[120px] transition-shadow duration-200 hover:shadow-sm hover:border-slate-300"
                >
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                      {k.label}
                    </p>
                    <p
                      className={`mt-1 text-[22px] font-semibold tabular-nums ${k.comingSoon ? "text-slate-400" : "text-slate-900"}`}
                      data-testid={`kpi-press-${k.id}-value`}
                    >
                      {formatValue(k.value, k.format)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    {showDelta ? (
                      <>
                        <span className="text-slate-500">vs prior</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full font-semibold ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                          data-testid={`kpi-press-${k.id}-delta`}
                        >
                          {deltaStr}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">vs prior: —</span>
                    )}
                    {k.note && !k.comingSoon && (
                      <span className="text-slate-400 truncate">{k.note}</span>
                    )}
                  </div>
                </div>
              );
            })}
      </section>

      {/* Albums by stage — compact pill strip.
          Hidden for now at Bill's request; logic kept so it can be restored. */}
      {false && summary && (
        <DashboardPanel padding="md" data-testid="dashboard-by-stage">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Albums by stage</h3>
          <div className="flex flex-wrap gap-2">
            {PRESS_STAGE_ORDER.map((s) => (
              <div
                key={s}
                className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[12px]"
                data-testid={`stage-count-${s}`}
              >
                <span className="font-bold text-slate-900">{summary.byStage[s] ?? 0}</span>
                <span className="text-slate-500">{STAGE_LABEL[s]}</span>
              </div>
            ))}
          </div>
        </DashboardPanel>
      )}

      {/* Trend chart + Recent activity — side by side on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DashboardPanel data-testid="trend-press" className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Trend</h3>
              <p className="text-[11px] text-slate-400">Daily activity over the selected window</p>
            </div>
          </div>
          <TrendChart
            series={dash?.series ?? []}
            metrics={dash?.chartMetrics ?? []}
            loading={dashLoading}
          />
        </DashboardPanel>

        <DashboardPanel data-testid="activity-press">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent activity</h3>
          <ActivityList items={dash?.activity ?? []} loading={dashLoading} />
        </DashboardPanel>
      </div>
    </div>
  );
}

// Streaming-prefill candidate for the press "start an album" artist
// picker. The press searches Spotify / Apple (the SAME admin endpoints the
// operator's New-Album dialog uses) and NEVER browses our local People
// roster — pressing a candidate fills the artist's name + profile so the
// held draft starts with real metadata.
// ─── Invite dialogs (press-scoped) ─────────────────────────────────────
//
// Two slim, identity-known invite popups (no streaming search). The
// artist/person invite lives on the person's profile (InvitePersonDialog);
// the label invite is a header action on the People tab (LabelInviteDialog).
// Both fire the invite email immediately on submit.

function LabelInviteDialog({
  open,
  onOpenChange,
  pressId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pressId: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [welcomeNote, setWelcomeNote] = useState("");
  const { toast } = useToast();

  const reset = () => { setName(""); setEmail(""); setWelcomeNote(""); };

  const invite = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/press/${pressId}/invite`, {
        email,
        name,
        role: "label",
        welcomeNote: welcomeNote || null,
      }),
    onSuccess: () => {
      toast({ title: "Invite sent", description: `${email} will join your People directory when they accept.` });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/people`] });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/summary`] });
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast({ title: "Invite failed", description: e?.message ?? "Try again.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (invite.isPending && !o) return; onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="bg-white text-slate-900 sm:max-w-md" data-testid="dialog-invite-label">
        <DialogHeader>
          <DialogTitle>Invite a label</DialogTitle>
          <DialogDescription className="text-slate-500">
            Send a label an invite to join your press. They'll appear in your People directory once they accept.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Label name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-invite-label-name" />
          <Input placeholder="email@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-invite-label-email" />
          <Textarea placeholder="Optional welcome note" value={welcomeNote} onChange={(e) => setWelcomeNote(e.target.value)} rows={3} data-testid="input-invite-label-note" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button
            onClick={() => invite.mutate()}
            disabled={invite.isPending || !email || !name}
            className="h-9 bg-slate-900 text-white hover:bg-slate-800"
            data-testid="button-send-label-invite"
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvitePersonDialog({
  open,
  onOpenChange,
  pressId,
  personId,
  personName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pressId: string;
  personId: string;
  personName: string;
}) {
  const [email, setEmail] = useState("");
  const [welcomeNote, setWelcomeNote] = useState("");
  const { toast } = useToast();

  const reset = () => { setEmail(""); setWelcomeNote(""); };

  const invite = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/press/${pressId}/people/${personId}/invite`, {
        email,
        welcomeNote: welcomeNote || null,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.alreadyPending) {
        toast({ title: "Already invited", description: `${personName} has a pending invite.` });
      } else {
        toast({ title: "Invite sent", description: `We emailed ${email} a link to claim their profile.` });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/people/${personId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/people`] });
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast({ title: "Invite failed", description: e?.message ?? "Try again.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (invite.isPending && !o) return; onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="bg-white text-slate-900 sm:max-w-md" data-testid="dialog-invite-person">
        <DialogHeader>
          <DialogTitle>Invite {personName}</DialogTitle>
          <DialogDescription className="text-slate-500">
            Send {personName} a private link to claim their profile and manage their releases with your press.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="email@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus data-testid="input-invite-person-email" />
          <Textarea placeholder="Optional welcome note" value={welcomeNote} onChange={(e) => setWelcomeNote(e.target.value)} rows={3} data-testid="input-invite-person-note" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button
            onClick={() => invite.mutate()}
            disabled={invite.isPending || !email}
            className="h-9 rounded-full px-4 border-0 font-semibold text-sm text-white shadow-sm bg-gradient-to-r from-[color:var(--brand-blue)] to-[color:var(--brand-purple)] hover:opacity-95"
            data-testid="button-send-person-invite"
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pipeline tab ──────────────────────────────────────────────────

interface PipelineAlbum {
  id: string; title: string; coverUrl: string | null; format: string;
  ownerName: string; ownerId: string; ownerKind: "artist" | "label";
  stage: string;
  stageEnteredAt: string | null;
  lockedAt: string | null;
  sunriseDate: string | null;
  windowOpensAt: string | null;
  windowClosesAt: string | null;
  mastersTriggeredAt: string | null;
  mastersApprovedByArtistAt: string | null;
  pressInvoiceUrl: string | null;
  pressInvoiceTotalCents: number | null;
  pressInvoiceUploadedAt: string | null;
  pressInvoiceOutsideSystem: boolean;
  pressInvoiceTransferId: string | null;
  pressInvoiceTransferredAt: string | null;
  pressInvoiceTransferAmountCents: number | null;
  pressInvoiceTransferError: string | null;
  invoiceVarianceCents: number | null;
  invoiceVariancePct: number | null;
  invoiceVarianceTier: "ok" | "warn" | "flag" | null;
  shippedAt: string | null;
  fulfillmentHeadsUpSentAt: string | null;
  fulfillmentHeadsUpQty: number | null;
  lastNotifiedAt: string | null;
  lockedQuantity: number | null;
  lockedTotalCents: number | null;
  unitsSoldToDate: number;
  // Task #533 — pool-funded early-cut chip.
  earlyCutEligible?: boolean;
  earlyCutPoolReady?: boolean;
  earlyCutMissingConsents?: ("press" | "artist" | "tier")[];
  earlyCutFloorCents?: number;
  earlyCutPoolAvailableCents?: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h ago`;
  return "just now";
}
interface PipelineInvited { id: string; email: string; role: string; createdAt: string; expiresAt: string; acceptUrl: string; }

// Shared Resend / Revoke / Copy-link controls. Used by the Pipeline tab
// (inside the Invited-column cards) and the scoped person profile (next to
// a pending invite). Mutations invalidate the press-scoped lists that
// surface invites; callers can pass `onChanged` to refetch their own view.
function InviteActions({
  pressId,
  inviteId,
  acceptUrl,
  onChanged,
}: { pressId: string; inviteId: string; acceptUrl: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
    queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/summary`] });
    onChanged?.();
  };
  const resend = useMutation({
    mutationFn: () => apiRequest("POST", `/api/press/${pressId}/invites/${inviteId}/resend`),
    onSuccess: () => { toast({ title: "Invite resent" }); invalidate(); },
    onError: (e: any) => toast({ title: "Resend failed", description: e?.message ?? "Try again.", variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/press/${pressId}/invites/${inviteId}`),
    onSuccess: () => { toast({ title: "Invite revoked" }); invalidate(); },
    onError: (e: any) => toast({ title: "Revoke failed", description: e?.message ?? "Try again.", variant: "destructive" }),
  });
  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(acceptUrl);
      toast({ title: "Link copied", description: "Paste it anywhere you want." });
    } catch {
      toast({ title: "Couldn't copy", description: acceptUrl, variant: "destructive" });
    }
  };
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton
        variant="ghost"
        label="Copy invite link"
        title="Copy invite link"
        onClick={onCopy}
        data-testid={`button-copy-invite-${inviteId}`}
      >
        <Link2 />
      </IconButton>
      <IconButton
        variant="ghost"
        label="Resend invite email"
        title="Resend invite email"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
        data-testid={`button-resend-invite-${inviteId}`}
      >
        {resend.isPending ? <Loader2 className="animate-spin" /> : <Send />}
      </IconButton>
      <IconButton
        variant="ghost"
        label="Revoke invite"
        title="Revoke invite"
        onClick={() => {
          if (window.confirm("Revoke this invite? The link will stop working.")) revoke.mutate();
        }}
        disabled={revoke.isPending}
        className="text-rose-600"
        data-testid={`button-revoke-invite-${inviteId}`}
      >
        {revoke.isPending ? <Loader2 className="animate-spin" /> : <XIcon />}
      </IconButton>
    </div>
  );
}
interface PipelineAccepted { kind: "artist" | "label"; id: string; name: string; email: string | null; createdAt: string; }

function PipelineTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = useQuery<{ albums: PipelineAlbum[]; invited: PipelineInvited[]; accepted?: PipelineAccepted[] }>({
    queryKey: [`/api/press/${pressId}/pipeline`],
  });
  if (isLoading) return <PanelLoading />;
  const albums = data?.albums ?? [];
  const invited = data?.invited ?? [];
  const accepted = data?.accepted ?? [];
  const byStage: Record<string, PipelineAlbum[]> = {};
  STAGE_DEFS.forEach((s) => { byStage[s.id] = []; });
  albums.forEach((a) => {
    if (!byStage[a.stage]) byStage[a.stage] = [];
    byStage[a.stage].push(a);
  });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6 items-start" data-testid="pipeline-grid">
        {STAGE_DEFS.map((s) => {
          const rows = byStage[s.id] ?? [];
          const extraCount =
            s.id === "invited" ? invited.length
            : s.id === "accepted" ? accepted.length
            : 0;
          return (
            <div key={s.id} data-testid={`pipeline-stage-${s.id}`}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-slate-700 text-sm font-semibold uppercase tracking-wide">{s.label}</h3>
                <span className="text-slate-400 text-xs font-mono" data-testid={`text-stage-count-${s.id}`}>
                  {rows.length + extraCount}
                </span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {s.id === "invited" && invited.map((iv) => (
                  <DashboardPanel key={iv.id} padding="sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate" data-testid={`card-invite-${iv.id}`}>{iv.email}</div>
                        <div className="text-slate-500 text-xs mt-1">Pending {iv.role}</div>
                      </div>
                      <InviteActions pressId={pressId} inviteId={iv.id} acceptUrl={iv.acceptUrl} />
                    </div>
                  </DashboardPanel>
                ))}
                {s.id === "accepted" && accepted.map((c) => (
                  <DashboardPanel key={`${c.kind}-${c.id}`} padding="sm">
                    <div className="text-sm font-semibold truncate" data-testid={`card-accepted-${c.kind}-${c.id}`}>{c.name}</div>
                    <div className="text-slate-500 text-xs mt-1 capitalize">{c.kind} · no album yet</div>
                  </DashboardPanel>
                ))}
                {rows.map((a) => (
                  <PipelineCard key={a.id} a={a} pressId={pressId} />
                ))}
                {rows.length + extraCount === 0 && (
                  <div className="text-slate-400 text-xs italic px-2 py-4 text-center">No albums</div>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function PipelineCard({ a, pressId }: { a: PipelineAlbum; pressId: string }) {
  const { toast } = useToast();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [headsUpQty, setHeadsUpQty] = useState<string>("");

  const triggerMasters = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/press/${pressId}/albums/${a.id}/masters/triggered`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const earm = body?.earmarkedCents != null ? `$${(body.earmarkedCents / 100).toFixed(0)}` : "?";
        const thr = body?.thresholdCents != null ? `$${(body.thresholdCents / 100).toFixed(0)}` : "?";
        throw new Error(`${body?.message ?? "Not ready"} (${earm} / ${thr} earmarked)`);
      }
      return r;
    },
    onSuccess: () => {
      toast({ title: "Masters trigger sent", description: "The artist is notified to approve the early start." });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
    },
    onError: (e: any) => toast({ title: "Trigger failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const sendHeadsUp = useMutation({
    mutationFn: () => apiRequest("POST", `/api/press/${pressId}/albums/${a.id}/fulfillment-heads-up`, { quantity: parseInt(headsUpQty || "0", 10) }),
    onSuccess: () => {
      toast({ title: "Fulfillment heads-up sent" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
      setHeadsUpQty("");
    },
    onError: (e: any) => toast({ title: "Heads-up failed", description: e?.message ?? "", variant: "destructive" }),
  });

  // Per-stage metrics the press operator needs to see on the card
  // without drilling in. Aligns with what the legacy AdminAlbum stepper
  // shows further upstream — sunrise date locks the selling window,
  // units-sold-to-date is the live signed-cert count during selling,
  // and locked qty is the press's commitment from Locked on.
  const showSunrise = ["sunrise_set","selling","masters_triggered"].includes(a.stage);
  const showSold = ["selling","masters_triggered","locked","in_production","shipped"].includes(a.stage);
  const showLockedQty = ["locked","in_production","shipped"].includes(a.stage);

  return (
    <DashboardPanel padding="sm" data-testid={`card-pipeline-${a.id}`}>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="w-full text-left"
        data-testid={`button-open-pipeline-${a.id}`}
      >
        <div className="flex gap-2">
          <div className="w-10 h-10 rounded bg-slate-100 ring-1 ring-slate-200 overflow-hidden flex-shrink-0">
            {a.coverUrl && <img src={a.coverUrl} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate" title={a.title}>{a.title}</div>
            <div className="text-slate-500 text-xs truncate">{a.ownerName} · {a.format}</div>
          </div>
        </div>
      </button>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {a.stageEnteredAt && (
          <div data-testid={`text-stage-entered-${a.id}`}>Stage: {timeAgo(a.stageEnteredAt)}</div>
        )}
        {showSunrise && a.sunriseDate && (
          <div data-testid={`text-sunrise-${a.id}`}>Sunrise {new Date(a.sunriseDate).toLocaleDateString()}</div>
        )}
        {showSold && (
          <div data-testid={`text-units-sold-${a.id}`}>{a.unitsSoldToDate} sold</div>
        )}
        {showLockedQty && a.lockedQuantity != null && (
          <div data-testid={`text-locked-qty-${a.id}`}>{a.lockedQuantity} locked</div>
        )}
      </div>
      {/* Task #533 — pool-funded early-cut state. "Eligible" means the
          pool covers the floor AND both prior consents are in — a review
          row is now waiting for Bill in the Early Cut queue. "Pool ready"
          means the money's there but a consent is still missing. */}
      {a.earlyCutEligible ? (
        <div
          className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700"
          data-testid={`chip-early-cut-eligible-${a.id}`}
        >
          <Zap className="w-3 h-3" />
          Early cut ready — in review queue
        </div>
      ) : a.earlyCutPoolReady ? (
        <div
          className="mt-2 flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
          data-testid={`chip-early-cut-pool-ready-${a.id}`}
        >
          <Zap className="w-3 h-3" />
          Pool funded — waiting on {(a.earlyCutMissingConsents ?? []).includes("press") ? "press" : "artist"} opt-in
        </div>
      ) : null}
      <div className="mt-2 space-y-1.5">
        {a.stage === "selling" && (
          <Button
            type="button"
            size="sm"
            onClick={() => triggerMasters.mutate()}
            disabled={triggerMasters.isPending}
            className="w-full h-8 bg-[color:var(--brand-blue)] text-white hover:brightness-110 text-xs"
            data-testid={`button-trigger-masters-${a.id}`}
          >Trigger masters</Button>
        )}
        {a.stage === "masters_triggered" && (
          <div className="text-xs text-emerald-700 font-semibold">Artist approved — cut masters</div>
        )}
        {/* Invoice capture is Locked-only per spec: an invoice marks
            the transition INTO In production, so it can't be uploaded
            before the preorder window has closed. */}
        {(a.stage === "locked" || a.stage === "in_production") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setInvoiceOpen(true)}
            className="w-full h-8 text-xs bg-transparent text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 border-0"
            data-testid={`button-upload-invoice-${a.id}`}
          >
            <Upload className="w-3 h-3 mr-1.5" />
            {a.pressInvoiceUploadedAt ? "Update invoice" : "Upload invoice"}
          </Button>
        )}
        {a.pressInvoiceUrl && (
          <div className="flex items-center gap-2">
            <a href={a.pressInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--brand-blue)] truncate min-w-0 hover:underline" data-testid={`link-invoice-${a.id}`}>
              <ExternalLink className="inline w-3 h-3 mr-1" />
              {a.pressInvoiceTotalCents != null ? `$${(a.pressInvoiceTotalCents / 100).toFixed(2)}` : "Invoice"}
            </a>
            {a.invoiceVarianceTier && a.invoiceVariancePct != null && (
              <span
                className={
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " +
                  (a.invoiceVarianceTier === "flag"
                    ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    : a.invoiceVarianceTier === "warn"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200")
                }
                data-testid={`badge-variance-${a.id}`}
                title={`Variance vs locked quote: ${a.invoiceVarianceCents! >= 0 ? "+" : ""}$${(a.invoiceVarianceCents! / 100).toFixed(2)}`}
              >
                {(a.invoiceVarianceCents! >= 0 ? "+" : "−")}
                {(a.invoiceVariancePct * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
        {a.pressInvoiceOutsideSystem && (
          <div className="text-xs text-slate-500 italic">Billed outside the system</div>
        )}
        {/* Task #527 — Stripe transfer status. Mint happens on invoice
            POST; chip reflects last-known state from the pipeline read. */}
        {a.pressInvoiceTransferId && a.pressInvoiceTransferAmountCents != null && (
          <div className="text-xs text-emerald-700" data-testid={`text-transfer-status-${a.id}`}>
            ✓ Earmarked ${(a.pressInvoiceTransferAmountCents / 100).toFixed(2)} to your Stripe
          </div>
        )}
        {!a.pressInvoiceTransferId && a.pressInvoiceTransferError && !a.pressInvoiceOutsideSystem && (
          <div className="text-xs text-rose-600" data-testid={`text-transfer-error-${a.id}`}>
            Transfer pending: {a.pressInvoiceTransferError}
          </div>
        )}
        {a.stage === "locked" && !a.fulfillmentHeadsUpSentAt && (
          <div className="flex gap-1">
            <Input
              type="number"
              placeholder="Qty"
              value={headsUpQty}
              onChange={(e) => setHeadsUpQty(e.target.value)}
              className="h-8 bg-white border-slate-200 text-slate-900 text-xs"
              data-testid={`input-heads-up-qty-${a.id}`}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => sendHeadsUp.mutate()}
              disabled={!headsUpQty || sendHeadsUp.isPending}
              className="h-8 bg-slate-900 text-white hover:bg-slate-800 text-xs"
              data-testid={`button-heads-up-${a.id}`}
            ><BellRing className="w-3 h-3" /></Button>
          </div>
        )}
        {a.fulfillmentHeadsUpSentAt && (
          <div className="text-xs text-slate-500">
            Heads-up sent · {a.fulfillmentHeadsUpQty ?? "?"} units
          </div>
        )}
        {a.lastNotifiedAt && (
          <div className="text-xs text-slate-500" data-testid={`text-last-notified-${a.id}`}>
            Last notified {timeAgo(a.lastNotifiedAt)}
          </div>
        )}
      </div>
      <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} pressId={pressId} albumId={a.id} />
      {detailOpen && (
        <PipelineDetailDialog
          album={a}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </DashboardPanel>
  );
}

function PipelineDetailDialog({ album, onClose }: { album: PipelineAlbum; onClose: () => void }) {
  // Reuses the canonical PressingOrderStepper that AdminAlbum embeds
  // upstream — same component, same SKUs query — so the press operator
  // sees the exact stage/preflight UI the artist's own admin sees.
  const { data: albumSkus } = useQuery<{ skus: any[]; addons: any[] }>({
    queryKey: ["/api/admin/albums", album.id, "skus"],
  });
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white text-slate-900 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid={`dialog-pipeline-detail-${album.id}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden">
              {album.coverUrl && <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <div className="truncate">{album.title}</div>
              <div className="text-xs text-slate-500 font-normal truncate">{album.ownerName} · {album.format}</div>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Stage</div>
              <div className="font-semibold">{STAGE_LABEL[album.stage] ?? album.stage}</div>
              {album.stageEnteredAt && (
                <div className="text-xs text-slate-500 mt-0.5">Entered {timeAgo(album.stageEnteredAt)}</div>
              )}
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Sunrise</div>
              <div className="font-semibold">{album.sunriseDate ? new Date(album.sunriseDate).toLocaleDateString() : "—"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Units sold</div>
              <div className="font-semibold">{album.unitsSoldToDate}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase">Locked qty</div>
              <div className="font-semibold">{album.lockedQuantity ?? "—"}</div>
            </div>
          </div>
          <PressingOrderStepper albumId={album.id} skus={(albumSkus?.skus ?? []) as any} />
          <div className="text-right">
            <Link
              href={`/admin/albums/${album.id}`}
              className="text-sm text-[color:var(--brand-blue)] font-semibold hover:underline"
              data-testid={`link-album-full-${album.id}`}
              onClick={onClose}
            >
              Open full album admin <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ open, onOpenChange, pressId, albumId }: { open: boolean; onOpenChange: (o: boolean) => void; pressId: string; albumId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [totalDollars, setTotalDollars] = useState("");
  const [note, setNote] = useState("");
  const [outside, setOutside] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  // Two-step upload: (1) ask server for a signed PUT url under
  // /press-invoices/<albumId>-<uuid>.pdf, (2) stream the PDF to GCS,
  // (3) POST the resulting /objects/press-invoices/<id>.pdf URL +
  // totalCents to /invoice. Mirrors the standard upload pattern used
  // for album art and avatars — no separate codepath, just a different
  // namespace under PRIVATE_OBJECT_DIR.
  const submit = async () => {
    try {
      if (outside) {
        await apiRequest("POST", `/api/press/${pressId}/albums/${albumId}/invoice`, {
          note: note || undefined,
          outsideSystem: true,
        });
      } else {
        if (!file) {
          toast({ title: "Pick a PDF first", variant: "destructive" });
          return;
        }
        if (file.type && file.type !== "application/pdf") {
          toast({ title: "PDF only", description: "Invoice must be a PDF.", variant: "destructive" });
          return;
        }
        const cents = Math.round(parseFloat(totalDollars || "0") * 100);
        if (!cents || cents <= 0) {
          toast({ title: "Enter the invoice total", variant: "destructive" });
          return;
        }
        setUploading(true);
        const signRes = await apiRequest("POST", `/api/press/${pressId}/albums/${albumId}/invoice/upload-url`, {});
        const { uploadUrl, publicUrl } = await signRes.json();
        if (!uploadUrl || !publicUrl) throw new Error("No signed upload URL");
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
        await apiRequest("POST", `/api/press/${pressId}/albums/${albumId}/invoice`, {
          url: publicUrl,
          totalCents: cents,
          note: note || undefined,
        });
      }
      toast({ title: "Invoice captured" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/pipeline`] });
      onOpenChange(false);
      setFile(null); setTotalDollars(""); setNote(""); setOutside(false);
    } catch (e: any) {
      toast({ title: "Capture failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white text-slate-900">
        <DialogHeader><DialogTitle>Capture press invoice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={outside} onChange={(e) => setOutside(e.target.checked)} data-testid="checkbox-outside-system" />
            Billed outside GoodTunes (no PDF to upload)
          </label>
          {!outside && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Invoice PDF</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:text-sm file:font-semibold"
                  data-testid="input-invoice-file"
                />
                {file && <p className="text-xs text-slate-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
              </div>
              <Input placeholder="Invoice total in dollars" type="number" step="0.01" value={totalDollars} onChange={(e) => setTotalDollars(e.target.value)} data-testid="input-invoice-total" />
            </>
          )}
          <Textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">Cancel</Button>
          <Button onClick={submit} disabled={uploading} className="h-9 bg-slate-900 text-white hover:bg-slate-800" data-testid="button-save-invoice">
            {uploading ? "Uploading…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────

// Task #2188 — Catalog is now a top-level tab; removed from Settings.
type SettingsSub = "profile" | "staff" | "payouts" | "notifications";
const SETTINGS_SUB_IDS: SettingsSub[] = ["profile", "staff", "payouts", "notifications"];

function SettingsTab({ pressId, pressName }: { pressId: string; pressName: string }) {
  // Settings sub-tabs: Profile / Staff / Payouts / Notifications.
  // Catalog was moved to a top-level nav tab (Task #2188).
  // ?tab=settings&settings=catalog is redirected in PressPortal to the
  // new catalog tab, so this component will never receive "catalog" as sub.
  const search = useSearch();
  const subFromUrl = new URLSearchParams(search).get("settings");
  const [sub, setSub] = useState<SettingsSub>(
    subFromUrl && (SETTINGS_SUB_IDS as string[]).includes(subFromUrl)
      ? (subFromUrl as SettingsSub)
      : "profile",
  );
  useEffect(() => {
    if (subFromUrl && (SETTINGS_SUB_IDS as string[]).includes(subFromUrl)) {
      setSub(subFromUrl as SettingsSub);
    }
  }, [subFromUrl]);
  // Task #2039 — the Partner-permissions toggles are GoodTunes-internal gates
  // only a super-admin can move (from /admin/manufacturers/:id). Press
  // owners/admins/staff can never change them, so don't show partners a
  // read-only panel. Same signal the panel itself derives from /api/me/role.
  const { data: role } = useQuery<{ role?: string }>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = role?.role === "super_admin";
  const subTabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "staff" as const, label: "Staff" },
    { id: "payouts" as const, label: "Payouts" },
    { id: "notifications" as const, label: "Notifications" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`h-10 px-3 text-sm font-semibold whitespace-nowrap border-b-2 ${sub === t.id ? "border-[color:var(--brand-blue)] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            data-testid={`tab-settings-${t.id}`}
          >{t.label}</button>
        ))}
      </div>
      {sub === "profile" && <ProfileSubTab pressId={pressId} />}
      {sub === "staff" && (
        <div className="space-y-4">
          {/* Task #665 — same Contacts panel admins see on
              /admin/manufacturers/:id. Server gates POSTs by
              invite_subusers on the caller; super-admins always pass. */}
          <DashboardPanel padding="md">
            <PressContactsPanel pressId={pressId} pressName={pressName} />
          </DashboardPanel>
          {isSuperAdmin && (
            <DashboardPanel padding="md">
              <PartnerPermissionsPanel scopeKind="manufacturer" scopeId={pressId} scopeName={pressName} />
            </DashboardPanel>
          )}
        </div>
      )}
      {sub === "payouts" && <PayoutsSubTab pressId={pressId} />}
      {sub === "notifications" && <NotificationsSubTab pressId={pressId} />}
    </div>
  );
}

function PressContactsPanel({ pressId, pressName }: { pressId: string; pressName: string }) {
  const probe = useQuery<{ ok: boolean; canAddAdmins?: boolean }>({
    queryKey: ["/api/admin/partner-contacts/can-invite", { entityKind: "manufacturer", entityId: pressId }],
    queryFn: async () => {
      const r = await fetch(`/api/admin/partner-contacts/can-invite?entityKind=manufacturer&entityId=${encodeURIComponent(pressId)}`, { credentials: "include" });
      if (!r.ok) return { ok: false };
      return r.json();
    },
  });
  // Task #699 — surface the press website to the Add Admin domain-mismatch
  // warning, same as the super-admin Manufacturer page does.
  const { data: me } = useQuery<PressMe>({ queryKey: [`/api/press/${pressId}/me`] });
  return (
    <OrganizationPeople
      apiPath={`/api/manufacturers/${pressId}/people`}
      testIdPrefix="press-shell"
      entityKind="manufacturer"
      entityId={pressId}
      entityName={pressName}
      title="Contacts"
      voice="partner"
      blurb="Invite teammates and partners to your press. We'll grant the role if they already have an admin account, otherwise we mint an invite link."
      canInviteSubusers={probe.data?.ok === true}
      canAddAdmins={probe.data?.canAddAdmins === true}
      entityWebsiteUrl={me?.websiteUrl ?? null}
    />
  );
}

function ProfileSubTab({ pressId }: { pressId: string }) {
  const { data: me, isLoading } = useQuery<PressMe>({ queryKey: [`/api/press/${pressId}/me`] });
  // Task #699 — Staff teammates see the profile read-only.
  const canEdit = me?.canEdit !== false;
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Task #2117 — paste-a-URL alongside the upload so a press can set its
  // logo from an already-hosted image.
  const [logoUrlInput, setLogoUrlInput] = useState("");
  // Task #2191 — full-size primary nav logo for the press portal whitelabel.
  const [navLogoUrl, setNavLogoUrl] = useState<string | null>(null);
  const [uploadingNavLogo, setUploadingNavLogo] = useState(false);
  const [navLogoUrlInput, setNavLogoUrlInput] = useState("");
  const navLogoFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  // Hydrate once when /me lands. Subsequent saves invalidate /me which
  // refires this effect — guarded by undefined check so user keystrokes
  // mid-edit aren't clobbered.
  useEffect(() => {
    if (!me) return;
    setName(me.name ?? "");
    setWebsiteUrl(me.websiteUrl ?? "");
    setContactEmail(me.contactEmail ?? "");
    setContactPhone(me.contactPhone ?? "");
    setLocation(me.location ?? "");
    setBio(me.bio ?? "");
    setLogoUrl(me.logoUrl ?? null);
    setNavLogoUrl(me.navLogoUrl ?? null);
  }, [me?.id]);

  const save = useMutation({
    mutationFn: (patch: Record<string, any>) => apiRequest("PATCH", `/api/press/${pressId}/profile`, patch),
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/me`] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  async function pickLogo(file: File) {
    setUploadingLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const r = await apiRequest("POST", `/api/press/${pressId}/profile/logo-url`, { ext });
      const { uploadUrl, publicUrl } = await r.json();
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/png" }, body: file });
      setLogoUrl(publicUrl);
      save.mutate({ logoUrl: publicUrl });
    } catch (e: any) {
      toast({ title: "Logo upload failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyLogoUrl() {
    const url = logoUrlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: "That doesn't look like a URL", description: "Paste a full image URL starting with http:// or https://", variant: "destructive" });
      return;
    }
    setLogoUrl(url);
    save.mutate({ logoUrl: url });
    setLogoUrlInput("");
  }

  // Task #2191 — primary nav logo (full-size/wide) upload + paste-URL.
  // Reuses the same signed-upload endpoint as the icon slot; the two slots
  // simply write to different DB fields.
  async function pickNavLogo(file: File) {
    setUploadingNavLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const r = await apiRequest("POST", `/api/press/${pressId}/profile/logo-url`, { ext });
      const { uploadUrl, publicUrl } = await r.json();
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "image/png" }, body: file });
      setNavLogoUrl(publicUrl);
      save.mutate({ navLogoUrl: publicUrl });
    } catch (e: any) {
      toast({ title: "Primary logo upload failed", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setUploadingNavLogo(false);
      if (navLogoFileRef.current) navLogoFileRef.current.value = "";
    }
  }

  function applyNavLogoUrl() {
    const url = navLogoUrlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: "That doesn't look like a URL", description: "Paste a full image URL starting with http:// or https://", variant: "destructive" });
      return;
    }
    setNavLogoUrl(url);
    save.mutate({ navLogoUrl: url });
    setNavLogoUrlInput("");
  }

  if (isLoading) return <PanelLoading />;
  return (
    <div className="space-y-4">
      {/* Task #2129 — the press's own Capabilities card, second-person voice,
          self-toggles via the same /profile PATCH (at-least-one guarded both
          client- and server-side). Staff teammates see it read-only. */}
      <PartnerCapabilitiesCard
        viewer="partner"
        capabilities={PRESS_CAPABILITIES}
        values={{
          doesVinyl: me?.doesVinyl ?? true,
          doesGoodDeed: me?.doesGoodDeed ?? false,
          doesFulfillment: me?.doesFulfillment ?? false,
        }}
        canEdit={canEdit}
        saving={save.isPending}
        onToggle={(key, next) => save.mutate({ [key]: next })}
      />
      <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Press profile</h3>
      <p className="text-xs text-slate-500 mb-4">Public-facing details artists and labels see when picking a press, plus the contact info platform notifications route to.</p>
      {!canEdit && (
        <p className="text-xs text-amber-700 mb-4" data-testid="text-profile-readonly">
          You have Staff access — you can view this press and invite artists, but only an Owner/Admin can change these settings.
        </p>
      )}
      <div className="space-y-4 max-w-xl">
        {/* Task #2191 — Primary logo (full-size/wide for the portal nav header).
            Renders first so a press sets its whitelabel wordmark before the
            square icon. Falls back to a wide preview area so it's clear this
            is a wide-format slot, not a square one. */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wide">Primary logo</label>
          <p className="text-xs text-slate-400 mt-0.5 mb-2">Full-size wordmark shown in the portal nav header. Wide images work best.</p>
          <div className="flex items-start gap-4">
            <div className="w-40 h-12 rounded-lg overflow-hidden bg-slate-50 ring-1 ring-slate-200 grid place-items-center flex-shrink-0">
              {navLogoUrl
                ? <img src={navLogoUrl} alt="" className="max-h-10 w-auto object-contain" data-testid="img-profile-nav-logo" />
                : <span className="text-xs text-slate-400">Primary logo</span>}
            </div>
            <div className="flex flex-col gap-1">
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navLogoFileRef.current?.click()}
                  disabled={uploadingNavLogo}
                  className="h-9 bg-transparent text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 border-0 text-sm font-semibold"
                  data-testid="button-upload-nav-logo"
                >{uploadingNavLogo ? "Uploading…" : navLogoUrl ? "Replace primary logo" : "Upload primary logo"}</Button>
              )}
              {canEdit && navLogoUrl && (
                <button
                  type="button"
                  onClick={() => { setNavLogoUrl(null); save.mutate({ navLogoUrl: null }); }}
                  className="text-xs text-slate-500 hover:text-rose-600 text-left"
                  data-testid="button-remove-nav-logo"
                >Remove primary logo</button>
              )}
              <input
                ref={navLogoFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickNavLogo(f); }}
                data-testid="input-nav-logo-file"
              />
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 max-w-md mt-2">
              <Input
                type="url"
                inputMode="url"
                value={navLogoUrlInput}
                onChange={(e) => setNavLogoUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyNavLogoUrl(); } }}
                disabled={uploadingNavLogo || save.isPending}
                placeholder="…or paste an image URL"
                className="min-w-0 bg-white border-slate-200 text-slate-900"
                data-testid="input-nav-logo-url"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyNavLogoUrl}
                disabled={uploadingNavLogo || save.isPending || !navLogoUrlInput.trim()}
                className="h-9 shrink-0 bg-transparent text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 border-0 text-sm font-semibold"
                data-testid="button-nav-logo-url-apply"
              >Use URL</Button>
            </div>
          )}
        </div>

        {/* Icon — square logo used in lists, credits, and the fallback rail header. */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wide">Icon</label>
          <p className="text-xs text-slate-400 mt-0.5 mb-2">Square logo used in press lists, credits, and as the rail fallback when no primary logo is set.</p>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-50 ring-1 ring-slate-200 grid place-items-center">
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-full h-full object-cover" data-testid="img-profile-logo" />
                : <span className="text-xs text-slate-400">Icon</span>}
            </div>
            <div className="flex flex-col gap-1">
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingLogo}
                  className="h-9 bg-transparent text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 border-0 text-sm font-semibold"
                  data-testid="button-upload-logo"
                >{uploadingLogo ? "Uploading…" : logoUrl ? "Replace icon" : "Upload an icon"}</Button>
              )}
              {canEdit && logoUrl && (
                <button
                  type="button"
                  onClick={() => { setLogoUrl(null); save.mutate({ logoUrl: null }); }}
                  className="text-xs text-slate-500 hover:text-rose-600 text-left"
                  data-testid="button-remove-logo"
                >Remove icon</button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); }}
                data-testid="input-logo-file"
              />
            </div>
          </div>
          {/* Task #2117 — paste-a-URL fallback for the icon. */}
          {canEdit && (
            <div className="flex items-center gap-2 max-w-md mt-2">
              <Input
                type="url"
                inputMode="url"
                value={logoUrlInput}
                onChange={(e) => setLogoUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLogoUrl(); } }}
                disabled={uploadingLogo || save.isPending}
                placeholder="…or paste an image URL"
                className="min-w-0 bg-white border-slate-200 text-slate-900"
                data-testid="input-logo-url"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyLogoUrl}
                disabled={uploadingLogo || save.isPending || !logoUrlInput.trim()}
                className="h-9 shrink-0 bg-transparent text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 border-0 text-sm font-semibold"
                data-testid="button-logo-url-apply"
              >Use URL</Button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wide">Press name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className="bg-white border-slate-200 text-slate-900 mt-1" data-testid="input-profile-name" />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wide">Public bio</label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} disabled={!canEdit} rows={3} placeholder="What artists and labels should know about your plant…" className="bg-white border-slate-200 text-slate-900 mt-1" data-testid="input-profile-bio" />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wide">Shipping address</label>
          <Textarea value={location} onChange={(e) => setLocation(e.target.value)} disabled={!canEdit} rows={2} placeholder="Street, city, state, ZIP — where masters & artwork get sent" className="bg-white border-slate-200 text-slate-900 mt-1" data-testid="input-profile-address" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Website</label>
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} disabled={!canEdit} placeholder="https://…" className="bg-white border-slate-200 text-slate-900 mt-1" data-testid="input-profile-website" />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Contact email</label>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" disabled={!canEdit} placeholder="orders@press.com" className="bg-white border-slate-200 text-slate-900 mt-1" data-testid="input-profile-email" />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Contact phone</label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={!canEdit} placeholder="(555) 555-1234" className="bg-white border-slate-200 text-slate-900 mt-1" data-testid="input-profile-phone" />
          </div>
        </div>
        {canEdit && (
          <Button
            onClick={() => save.mutate({ name, websiteUrl, contactEmail, contactPhone, location, bio })}
            disabled={save.isPending}
            className="h-9 bg-slate-900 text-white hover:bg-slate-800 font-semibold"
            data-testid="button-save-profile"
          >{save.isPending ? "Saving…" : "Save profile"}</Button>
        )}
      </div>
      </DashboardPanel>
    </div>
  );
}

// Task #527 — Settings → Payouts subtab. Read-only roll-up of the
// press's Stripe Connect account state plus every captured invoice
// with its variance vs the locked quote and the Stripe transfer
// status. Connect onboarding stays on /admin/manufacturers/:id; this
// panel just surfaces the data so the press knows whether earmarks
// are landing.
type PayoutsResponse = {
  account: {
    id: string;
    stripeAccountId: string | null;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    lastSyncedAt: string | null;
  } | null;
  invoices: Array<{
    albumId: string;
    title: string;
    coverUrl: string | null;
    invoiceTotalCents: number | null;
    invoiceUploadedAt: string | null;
    outsideSystem: boolean;
    transferId: string | null;
    transferredAt: string | null;
    transferAmountCents: number | null;
    transferError: string | null;
    lockedTotalCents: number | null;
    varianceCents: number | null;
    variancePct: number | null;
    varianceTier: "ok" | "warn" | "flag" | null;
  }>;
};

function PayoutsSubTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = useQuery<PayoutsResponse>({ queryKey: [`/api/press/${pressId}/payouts`] });
  if (isLoading) return <PanelLoading />;
  const acct = data?.account ?? null;
  const invoices = data?.invoices ?? [];
  return (
    <div className="space-y-4">
      <DashboardPanel padding="md">
        <h3 className="text-base font-semibold mb-2">Stripe payouts</h3>
        {acct?.stripeAccountId && acct.payoutsEnabled ? (
          <div className="text-sm text-emerald-700" data-testid="text-payouts-enabled">
            ✓ Connected — invoice captures earmark to your Stripe account automatically.
          </div>
        ) : acct?.stripeAccountId ? (
          <div className="text-sm text-amber-700" data-testid="text-payouts-pending">
            Stripe account connected but not yet payouts-enabled. Finish onboarding to receive earmarks.
          </div>
        ) : (
          <div className="text-sm text-slate-700" data-testid="text-payouts-missing">
            No Stripe Connect account yet. Captured invoices won't be earmarked until you connect one.
          </div>
        )}
        <Link
          href={`/admin/manufacturers/${pressId}?tab=payouts`}
          className="mt-3 inline-flex items-center gap-1 h-9 px-4 rounded-full bg-slate-100 text-slate-900 text-sm font-semibold hover:bg-slate-200"
          data-testid="link-payouts-editor"
        >Open payouts <ExternalLink className="w-3 h-3" /></Link>
      </DashboardPanel>

      <DashboardPanel padding="md">
        <h3 className="text-base font-semibold mb-3">Recent invoice captures</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices captured yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <div key={inv.albumId} className="py-2 flex items-start gap-3" data-testid={`row-payout-invoice-${inv.albumId}`}>
                {inv.coverUrl && <img src={inv.coverUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{inv.title}</div>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {inv.outsideSystem ? (
                      <span className="italic">Billed outside the system</span>
                    ) : (
                      <>
                        {inv.invoiceTotalCents != null && (
                          <span>Invoice ${(inv.invoiceTotalCents / 100).toFixed(2)}</span>
                        )}
                        {inv.lockedTotalCents != null && (
                          <span>Quote ${(inv.lockedTotalCents / 100).toFixed(2)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {inv.varianceTier && inv.variancePct != null && (
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " +
                        (inv.varianceTier === "flag"
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          : inv.varianceTier === "warn"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200")
                      }
                      data-testid={`badge-payout-variance-${inv.albumId}`}
                      title={`Variance vs locked quote: ${(inv.varianceCents ?? 0) >= 0 ? "+" : ""}$${((inv.varianceCents ?? 0) / 100).toFixed(2)}`}
                    >
                      {(inv.varianceCents ?? 0) >= 0 ? "+" : "−"}{(inv.variancePct * 100).toFixed(0)}%
                    </span>
                  )}
                  {inv.transferId && inv.transferAmountCents != null ? (
                    <span className="text-xs text-emerald-700" data-testid={`text-payout-transferred-${inv.albumId}`}>
                      ✓ ${(inv.transferAmountCents / 100).toFixed(2)} earmarked
                    </span>
                  ) : inv.outsideSystem ? (
                    <span className="text-xs text-slate-500">No transfer</span>
                  ) : inv.transferError ? (
                    <span className="text-xs text-rose-600" data-testid={`text-payout-error-${inv.albumId}`}>{inv.transferError}</span>
                  ) : (
                    <span className="text-xs text-slate-500">Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}

function NotificationsSubTab({ pressId }: { pressId: string }) {
  const { data: me, isLoading } = useQuery<PressMe>({ queryKey: [`/api/press/${pressId}/me`] });
  const [recipient, setRecipient] = useState("");
  const { toast } = useToast();
  useEffect(() => { if (me) setRecipient(me.contactEmail ?? ""); }, [me?.id]);
  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/press/${pressId}/profile`, { contactEmail: recipient || null }),
    onSuccess: () => {
      toast({ title: "Recipient saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/me`] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });
  if (isLoading) return <PanelLoading />;
  return (
    <DashboardPanel padding="md">
      <h3 className="text-base font-semibold mb-3">Notifications</h3>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wide">Notification recipient</label>
          <Input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            type="email"
            placeholder="ops@press.com"
            className="bg-white border-slate-200 text-slate-900 mt-1"
            data-testid="input-notifications-recipient"
          />
          <p className="text-xs text-slate-500 mt-1.5">Where GoodTunes emails your plant as the releases you press move through the pipeline. This is also your profile's contact email.</p>
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="h-9 bg-slate-900 text-white hover:bg-slate-800 font-semibold"
          data-testid="button-save-notifications"
        >{save.isPending ? "Saving…" : "Save"}</Button>
        <div className="pt-3 border-t border-slate-200">
          <h4 className="text-sm font-semibold mb-1">What we send you</h4>
          <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
            <li>When an artist or label accepts your invite and joins your roster.</li>
            <li>When a release you press is ready for its next step on your machines — masters to cut, or a preorder run to lock.</li>
            <li>When a release you're pressing moves into production or ships.</li>
          </ul>
        </div>
      </div>
    </DashboardPanel>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────

function PanelLoading() {
  return (
    <DashboardPanel padding="md" className="grid place-items-center min-h-[200px]">
      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
    </DashboardPanel>
  );
}
function EmptyHint({ text }: { text: string }) {
  return <div className="text-slate-400 text-sm italic mt-4">{text}</div>;
}
function Avatar({ src, fallback }: { src: string | null; fallback: string }) {
  return (
    <div className="w-11 h-11 rounded-full bg-slate-100 ring-1 ring-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (
        <span className="text-slate-500 text-sm font-semibold">{fallback.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}
// Keep Users/GitBranch/Cog imports referenced for future use (tab icons land in #523).
export const _iconRefs = { Users, GitBranch, Cog };

// Export so the InvoiceDialog is rendered when needed — but cards
// manage their own dialog state via local useState above, so this is
// a no-op re-export for clarity.
export { InvoiceDialog };
