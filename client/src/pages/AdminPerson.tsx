import { useEffect, useMemo, useRef, useState } from "react";
import { getInitials } from "@/lib/initials";
import { formatUsdCents } from "@shared/money";
import { Link, useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ViewAsPartnerButton } from "@/components/admin/ViewAsPartnerButton";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  ImageIcon,
  User as UserIcon,
  Users,
  Globe,
  Music as MusicIcon,
  RefreshCw,
  Pencil,
  Trash2,
  Lock,
  LockOpen,
  Disc3,
  Search,
  X,
  Plus,
  Link2,
  Sparkles,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { SiApplemusic, SiSpotify, SiTidal, SiPandora, SiInstagram, SiTiktok, SiX, SiBluesky, SiFacebook } from "react-icons/si";
import { useAuth } from "@/hooks/useAuth";
import { useSmartBackCrumb } from "@/hooks/useSmartBackCrumb";
import { AdminFrame } from "@/components/admin/AdminFrame";
import {
  PersonPreviewCard,
  type PersonPreviewAlbum,
} from "@/components/admin/previews/PersonPreviewCard";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { NewAlbumTitleDialog } from "@/components/admin/NewAlbumTitleDialog";
import { PayoutAccountPanel } from "@/components/admin/PayoutAccountPanel";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { InviteToArtistPanel } from "@/components/admin/InviteToArtistPanel";
import { AdminPartnerDashboard } from "@/components/admin/AdminPartnerDashboard";
import { InvitedByPressPanel } from "@/components/admin/InvitedByPressPanel";
import { RolePicker } from "@/components/admin/RolePicker";
import { BusinessTitlePicker } from "@/components/admin/BusinessTitlePicker";
import { PersonSplitsRail } from "@/components/admin/SplitsPanels";
import { PersonGearManager } from "@/components/admin/PersonGearManager";
import { NotificationsCard } from "@/components/admin/NotificationsCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { uploadImageFile } from "@/lib/adminUpload";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import type { PartnerAddressSnapshot } from "@shared/schema";
import { normalizeShareSlug, validateShareSlug, SHARE_LINK_HOST } from "@shared/shareSlug";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Task #350 — Per-person ambassador toggle. Lives at the bottom of the
// Permissions tab so it sits next to the other partner verbs. Disabled
// (with a hint) when the person has no NPO; the server enforces the
// same rule defensively.
//
// Task #2126 — the card now also lets the operator (a) ASSIGN a non-profit
// inline (pick an existing NPO or mint a new one) when the person has none,
// so the dead-end disabled checkbox becomes checkable without a reload, and
// (b) toggle whether this person — when they refer another artist — earns
// the $1/unit referral credit (on by default; OFF still lets them invite,
// it just doesn't mint a credit).
type NonProfitLite = { id: string; name: string; logoUrl: string | null };

// Inline NPO picker dialog: choose an existing non-profit or create a new
// one, then link it to this person via PATCH …/referred-by-org.
function AssignNonProfitDialog({
  personId,
  open,
  onOpenChange,
}: {
  personId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [newName, setNewName] = useState("");
  const npos = useQuery<NonProfitLite[]>({ queryKey: ["/api/non-profits"], enabled: open });

  const assign = useMutation({
    mutationFn: async () => {
      let orgId = selectedOrgId;
      if (mode === "new") {
        const name = newName.trim();
        if (!name) throw new Error("Enter a non-profit name");
        const created = await apiRequest("POST", "/api/non-profits", { name });
        const body = (await created.json()) as { id: string };
        orgId = body.id;
      }
      if (!orgId) throw new Error("Pick a non-profit");
      await apiRequest("PATCH", `/api/admin/people/${personId}/referred-by-org`, { organizationId: orgId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people", personId] });
      queryClient.invalidateQueries({ queryKey: ["/api/non-profits"] });
      toast({ title: "Non-profit assigned" });
      setNewName("");
      setSelectedOrgId("");
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't assign", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !assign.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4" data-testid="dialog-assign-npo">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-semibold text-slate-900">Assign a non-profit</DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            Link this person to a non-profit so they can be promoted to an ambassador inviter.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("existing")}
            data-testid="button-npo-mode-existing"
          >
            Existing
          </Button>
          <Button
            type="button"
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("new")}
            data-testid="button-npo-mode-new"
          >
            Create new
          </Button>
        </div>
        {mode === "existing" ? (
          <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
            <SelectTrigger className="h-9" data-testid="select-assign-npo">
              <SelectValue placeholder={npos.isLoading ? "Loading…" : "Choose a non-profit"} />
            </SelectTrigger>
            <SelectContent>
              {(npos.data ?? []).map((n) => (
                <SelectItem key={n.id} value={n.id} data-testid={`option-assign-npo-${n.id}`}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Non-profit name"
            data-testid="input-new-npo-name"
          />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={assign.isPending} data-testid="button-cancel-assign-npo">
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => assign.mutate()}
            disabled={assign.isPending || (mode === "existing" ? !selectedOrgId : !newName.trim())}
            data-testid="button-confirm-assign-npo"
          >
            {assign.isPending ? "Assigning…" : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AmbassadorToggle({ personId, canInviteAmbassadors, referredByOrgId, earnsReferralPayout }: {
  personId: string;
  canInviteAmbassadors: boolean;
  referredByOrgId: string | null;
  earnsReferralPayout: boolean;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(canInviteAmbassadors);
  const [earns, setEarns] = useState(earnsReferralPayout);
  const [assignOpen, setAssignOpen] = useState(false);
  const hasNpo = !!referredByOrgId;

  // Keep local state honest after the person query refetches (e.g. the
  // NPO link landing flips `referredByOrgId` and re-enables the checkbox).
  useEffect(() => { setEnabled(canInviteAmbassadors); }, [canInviteAmbassadors]);
  useEffect(() => { setEarns(earnsReferralPayout); }, [earnsReferralPayout]);

  const m = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", `/api/admin/people/${personId}/can-invite-ambassadors`, { enabled: next });
      return next;
    },
    onSuccess: (next) => {
      setEnabled(next);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people", personId] });
      toast({ title: next ? "Promoted to ambassador" : "Ambassador verb removed" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    },
  });

  const payout = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", `/api/admin/people/${personId}/earns-referral-payout`, { enabled: next });
      return next;
    },
    onSuccess: (next) => {
      setEarns(next);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people", personId] });
      toast({ title: next ? "Referral payout on" : "Referral payout off" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-5 mt-4 space-y-5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={`amb-toggle-${personId}`}
          checked={enabled}
          disabled={!hasNpo || m.isPending}
          onChange={(e) => m.mutate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[var(--brand-blue)]"
          data-testid="toggle-can-invite-ambassadors"
        />
        <div className="block">
          <label htmlFor={`amb-toggle-${personId}`} className="block">
            <span className="font-semibold text-slate-900 block">Can invite ambassadors</span>
            <span className="text-xs text-slate-500 block mt-1">
              {hasNpo
                ? "When ON, the non-profit can attribute invites to this person. Their referred artists' credits flow to them, with the NPO still seeing the roll-up."
                : "Link this person to a non-profit first — then you can promote them to an ambassador inviter."}
            </span>
          </label>
          {!hasNpo && (
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              className="mt-2 text-sm font-medium text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
              data-testid="button-assign-npo"
            >
              + Assign non-profit
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 border-t border-slate-100 pt-5">
        <input
          type="checkbox"
          id={`payout-toggle-${personId}`}
          checked={earns}
          disabled={payout.isPending}
          onChange={(e) => payout.mutate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[var(--brand-blue)]"
          data-testid="toggle-earns-referral-payout"
        />
        <label htmlFor={`payout-toggle-${personId}`} className="block">
          <span className="font-semibold text-slate-900 block">Earns referral payout</span>
          <span className="text-xs text-slate-500 block mt-1">
            {earns
              ? "When ON, this person earns the $1/unit referral credit on every paid sale by an artist they referred."
              : "When OFF, this person can still invite artists, but no referral credit is minted on their referrals' sales."}
          </span>
        </label>
      </div>

      <AssignNonProfitDialog personId={personId} open={assignOpen} onOpenChange={setAssignOpen} />
    </Card>
  );
}

/**
 * Admin · Single person. Wrapped in AdminFrame so it shares the top bar +
 * left entity sidebar with /admin/people.
 *
 * Tabs:
 *   Overview · Cover · Discography
 *   The artist photo (avatar) is now edited from a modal that hangs off
 *   the header avatar's pencil chip — same pattern as AdminAlbum's
 *   Artwork editor. Cover stays a tab because the wide hero banner
 *   needs the full canvas. Streaming-service URLs + the Spotify picker
 *   live inline at the bottom of Overview now.
 *   Discography — inline "Pull from Apple Music" using the artist's
 *     Apple Music URL set on Overview. One click → iTunes Lookup
 *     scrape → full replace of the cached release list.
 */
interface PersonFull {
  id: string;
  name: string;
  photoUrl: string | null;
  coverUrl: string | null;
  // Curation locks — when `true`, automated refresh paths (Spotify
  // bulk-match, future Wikipedia/Apple scrapes) MUST skip this field.
  // The admin's own actions (Replace, Refresh from Spotify) ignore the
  // lock — it's about automation, not editability.
  photoLocked: boolean;
  coverLocked: boolean;
  bio: string | null;
  labelId: string | null;
  managerId: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
  tidalUrl: string | null;
  qobuzUrl: string | null;
  deezerUrl: string | null;
  pandoraUrl: string | null;
  itunesArtistId: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  blueskyUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  // Task #190 — bands & members. When true this Person row is a group;
  // the Members tab + per-album lineup snapshots only show then.
  isGroup: boolean;
  groupKind: string | null;
  // Task #490 — formatted shipping/mailing address for artist comp runs.
  // Free-form text written by the shared Places-autocomplete field.
  shippingAddress: string | null;
  // Task #517 — Places-picked structured snapshot of the same field.
  shippingAddressStruct: PartnerAddressSnapshot | null;
  // Task #199 — if this artist was invited by a specific press, their
  // Sell-panel Presses surface is hard-locked to that press until
  // their first run ships. Super-admin can clear/switch via Identity.
  invitedByPressId: string | null;
  // Task #1310 / #1313 — artist "part" of the two-part share link
  // (get.goodtunes.music/<artist>/<album>). Shared across all of this
  // artist's releases; editable directly from the People admin panel.
  artistShareSlug?: string | null;
  // Task #665 — contact-led vs artist-led rendering. Server derives
  // `shape` from users.role/role_scope_id, owned albums, discography
  // rows, or the operator-set `isArtistPromoted` flag. The contact
  // shape collapses the tab strip to Overview/Cover/Permissions and
  // leads the Overview with contact info + attached orgs.
  shape?: "artist" | "contact";
  contactEmail?: string | null;
  contactPhone?: string | null;
  isArtistPromoted?: boolean;
  // Task #824 — manual creative-credit tags (artist/producer/writer/…)
  // and the read-only rollup derived from real track/album credits.
  roles?: string[] | null;
  derivedRoles?: string[] | null;
  attachments?: Array<{
    entityKind: "vendor" | "manufacturer" | "label" | "fulfillment_partner" | "non_profit";
    entityId: string;
    entityName: string;
    role: string | null;
    // Task #923 — plain-language GoodTunes role at this org
    // (Ambassador / Staff / Press contact / Label staff / …).
    gtRole?: string | null;
  }>;
  // Task #923 — artists this contact has invited / referred + status,
  // so a referrer contact reads like a recruiter record.
  introductions?: Array<{
    id: string | null;
    name: string;
    photoUrl: string | null;
    status: "signed" | "invited" | "expired" | "declined";
    at: string | null;
  }>;
  // Task #350 / #2126 — ambassador inviter flag + the NPO this person is
  // referred by (gates the ambassador toggle); `earnsReferralPayout` is
  // the operator on/off switch for whether this person, as a referrer,
  // earns the $1/unit referral credit (defaults true).
  canInviteAmbassadors?: boolean;
  referredByOrgId?: string | null;
  earnsReferralPayout?: boolean;
}

interface LabelLite {
  id: string;
  name: string;
}

interface ManagerLite {
  id: string;
  name: string;
}

// "releases" = albums actually in the GoodTunes catalog (DB-backed, the
// stuff fans can play/buy inside the app). "streaming" = the cached
// Apple Music discography (links out, used to round out the artist's
// public profile). The two are intentionally distinct surfaces because
// they answer different questions: "what can our app play?" vs. "what
// has this artist released anywhere?". The route key stays "streaming"
// even though the discography endpoints under the hood still say
// "discography" — the rename is UI-only on purpose so the iTunes pull
// machinery doesn't ripple.
type Tab = "dashboard" | "overview" | "cover" | "members" | "releases" | "streaming" | "gear" | "splits" | "payouts" | "permissions";
const BASE_TABS: { key: Tab; label: string }[] = [
  // Task #590 — Dashboard leads on every partner detail page, including
  // artist-scope. Most artist KPIs render Coming soon until the
  // listening-insights + payout-split data lands.
  { key: "dashboard", label: "Dashboard" },
  { key: "overview", label: "Overview" },
  { key: "cover", label: "Cover" },
  { key: "releases", label: "GoodTunes\u00AE Releases" },
  { key: "streaming", label: "Streaming" },
  { key: "gear", label: "Gear" },
  { key: "splits", label: "Splits" },
  { key: "payouts", label: "Payouts" },
  { key: "permissions", label: "Permissions" },
];
// Task #190 — Members tab is only relevant when this Person represents
// a band/duo/orchestra (is_group=true). Splice it in next to Overview so
// the band-curation surfaces sit together.
function tabsForPerson(person: PersonFull): { key: Tab; label: string }[] {
  // Task #665 — contact-shape people are partner reps (label staff,
  // press contacts, vendor account managers), not performers. Collapse
  // to Overview/Cover/Permissions so the artist-only surfaces
  // (Dashboard, Streaming, Gear, Splits, Payouts, Releases, Members)
  // don't render an empty shell on a row that never had any of those.
  if (person.shape === "contact") {
    return [
      { key: "overview", label: "Overview" },
      { key: "cover", label: "Cover" },
      { key: "permissions", label: "Permissions" },
    ];
  }
  if (!person.isGroup) return BASE_TABS;
  const out = [...BASE_TABS];
  const after = out.findIndex((t) => t.key === "cover");
  const insertAt = after === -1 ? 1 : after + 1;
  out.splice(insertAt, 0, { key: "members", label: "Members" });
  return out;
}

// Task #2143 — a Person counts as an artist (and so gets the artist-scope
// Permissions content: the "governs as an artist" note, the artist
// permission matrix, the "Invite to this artist" panel) when the server
// resolved them to the artist shape, when an operator promoted them, or
// when they carry the "artist" creative role. Contact-shape partner staff
// with none of these (Travis Whitlock at Hellbender, Andrew at PMP) are NOT
// artists — their Permissions tab shows only their partner-staff access.
function personIsArtist(person: PersonFull): boolean {
  return (
    person.shape === "artist" ||
    person.isArtistPromoted === true ||
    (person.roles ?? []).some((r) => r?.toLowerCase() === "artist")
  );
}

/* ─── Press-scoped read-only panels (Task #2253) ───────────────────────
   A press partner sees the artist through these trimmed, read-only views
   instead of the operator panels (which re-fetch deny-walled
   /api/admin/people/* sub-resources). Everything renders from the person
   object already loaded via the press-scoped endpoint. */

function PressPersonOverview({
  person,
  labelName,
}: {
  person: PersonFull;
  labelName: string | null;
}) {
  const credits = [
    ...(person.roles ?? []),
    ...(person.derivedRoles ?? []),
  ]
    .map((r) => (r ?? "").trim())
    .filter(Boolean);
  const uniqCredits = Array.from(
    new Map(credits.map((c) => [c.toLowerCase(), c])).values(),
  );
  return (
    <div className="space-y-4" data-testid="panel-press-person-overview">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Artist
          </div>
          <div className="text-slate-900 text-sm font-semibold mt-0.5">
            {person.name}
          </div>
          <div className="text-slate-500 text-xs">
            {labelName ? `Signed to ${labelName}` : "Independent"}
          </div>
        </div>
        {person.bio && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Bio
            </div>
            <p className="text-slate-600 text-sm mt-1 whitespace-pre-line">
              {person.bio}
            </p>
          </div>
        )}
        {uniqCredits.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Credits
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {uniqCredits.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-slate-400 text-xs px-1">
        Artist profile details are managed by GoodTunes. Use the Releases tab
        to manage the albums associated with your press.
      </p>
    </div>
  );
}

function PressPersonCover({ person }: { person: PersonFull }) {
  return (
    <div className="space-y-3" data-testid="panel-press-person-cover">
      <div className="aspect-[3/1] w-full rounded-2xl overflow-hidden bg-slate-100 ring-1 ring-slate-200">
        {person.coverUrl ? (
          <img
            src={person.coverUrl}
            alt={`${person.name} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
            No cover image
          </div>
        )}
      </div>
      <p className="text-slate-400 text-xs px-1">
        The artist's cover image is managed by GoodTunes.
      </p>
    </div>
  );
}

function PressPersonStreaming({ person }: { person: PersonFull }) {
  const links = [
    { label: "Apple Music", url: person.appleMusicUrl },
    { label: "Spotify", url: person.spotifyUrl },
    { label: "Tidal", url: person.tidalUrl },
    { label: "Qobuz", url: person.qobuzUrl },
    { label: "Deezer", url: person.deezerUrl },
    { label: "Pandora", url: person.pandoraUrl },
  ].filter((l) => !!l.url) as { label: string; url: string }[];
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
      data-testid="panel-press-person-streaming"
    >
      <h2 className="text-slate-900 text-sm font-bold">Streaming</h2>
      {links.length === 0 ? (
        <p className="text-slate-500 text-xs">
          No streaming links on file.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li key={l.label}>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--brand-blue)] text-sm hover:underline"
                data-testid={`link-streaming-${l.label
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminPerson() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/people/:id");
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  // Task #590 — Dashboard is default; `?tab=` deep links keep working.
  const ALL_TAB_KEYS: readonly Tab[] = [
    "dashboard", "overview", "cover", "members", "releases", "streaming", "gear", "splits", "payouts", "permissions",
  ];
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof window === "undefined") return "dashboard";
    const q = new URLSearchParams(window.location.search).get("tab");
    return (ALL_TAB_KEYS as readonly string[]).includes(q ?? "") ? (q as Tab) : "dashboard";
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      const u = new URL(window.location.href);
      if (next === "dashboard") u.searchParams.delete("tab");
      else u.searchParams.set("tab", next);
      window.history.replaceState({}, "", u.toString());
    } catch {}
  };
  // Photo editor lives as a modal hanging off the header avatar (same
  // pencil-on-thumbnail pattern as AdminAlbum's Artwork editor). The
  // dedicated Photo tab was removed; Cover is still its own tab because
  // the wide background banner needs more real estate.
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const personId = params?.id ?? "";
  const backCrumb = useSmartBackCrumb();

  // Task #2253 — press-scoped viewer. A manufacturer (press) partner is
  // isAdmin=true but the global /api/admin/people/* surface 403s them
  // (pressGlobalDenyGuard), so when a press opens an artist we read
  // through the press-scoped endpoints and render a trimmed, read-only
  // view: no Gear/Splits/Payouts/Permissions, no system-delete (only
  // "Remove from press"), and other-press releases are locked. Note the
  // artist's *global* Dashboard is intentionally omitted in press mode —
  // it would aggregate sales across every press and leak other presses'
  // numbers, which req 4 forbids. Members (group lineup) is also dropped
  // because its sub-resource fetch is behind the same deny wall.
  const { data: roleInfo } = useQuery<{ role?: string; roleScopeId?: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const pressMode = roleInfo?.role === "manufacturer";
  const pressId = pressMode ? (roleInfo?.roleScopeId ?? "") : "";
  // Task #2253 — read-only press Staff (canEdit=false) must not be offered the
  // destructive "Remove from press" verb; the remove endpoint also 403s them.
  // Default to editable unless the press /me payload explicitly says otherwise.
  const { data: pressMe } = useQuery<{ canEdit?: boolean }>({
    queryKey: [`/api/press/${pressId}/me`],
    enabled: pressMode && !!pressId,
  });
  const pressCanEdit = pressMe?.canEdit !== false;
  const PRESS_PERSON_TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "cover", label: "Cover" },
    { key: "releases", label: "Releases" },
    { key: "streaming", label: "Streaming" },
  ];

  // Mirror of AdminAlbum's deleteAlbum mutation. Person FKs on tracks +
  // albums.primaryArtistId are SET NULL, so deletion unlinks credits and
  // albums rather than cascading them — the destructive copy below
  // names that explicitly per the replit.md destructive-actions rule.
  const deletePerson = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/people/${personId}`);
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["/api/people", personId] });
      qc.removeQueries({ queryKey: ["/api/admin/people", personId] });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      toast({ title: "Person deleted." });
      setDeleteConfirmOpen(false);
      navigate("/admin/people");
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't delete person",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Task #2253 — press partners can never system-delete a person. The
  // Trash affordance becomes "Remove from press": clear default_press_id
  // if it points here, record press_switch_history, person row persists.
  const removeFromPress = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/press/${pressId}/people/${personId}/remove`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/press/${pressId}/people`] });
      toast({ title: "Removed from your press." });
      setRemoveConfirmOpen(false);
      navigate("/vendor?tab=people");
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't remove from press",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  // Task #490 — admin shell reads the *admin* projection so it sees
  // admin-only fields (currently `shippingAddress`) that must not leak
  // through the public /api/people/:id endpoint other pages rely on.
  const { data: person, isLoading, error } = useQuery<PersonFull>({
    queryKey: pressMode
      ? [`/api/press/${pressId}/people/${personId}`]
      : ["/api/admin/people", personId],
    enabled: !!user?.isAdmin && !!personId && (!pressMode || !!pressId),
  });
  const { data: labels = [] } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });
  const { data: managers = [] } = useQuery<ManagerLite[]>({
    queryKey: ["/api/managers"],
    enabled: !!user?.isAdmin,
  });
  // Albums feed for the right-pane preview card. Cheap and already
  // cached by the admin sidebar's count query — TanStack dedupes the
  // request so this is effectively free.
  const { data: allAlbums = [] } = useQuery<PersonPreviewAlbum[]>({
    queryKey: pressMode
      ? [`/api/press/${pressId}/people/${personId}/albums`]
      : ["/api/albums"],
    enabled: !!user?.isAdmin && (!pressMode || !!pressId),
  });
  // In press mode the albums feed already carries an editableByThisPress
  // flag per row (homed-here vs. another-press). Build a lookup so the
  // Releases grid can lock + grey the rows that belong to another press.
  const pressEditableById: Record<string, boolean> | undefined = pressMode
    ? Object.fromEntries(
        (allAlbums as any[]).map((a) => [a.id, !!a.editableByThisPress]),
      )
    : undefined;

  const labelName =
    person?.labelId
      ? labels.find((l) => l.id === person.labelId)?.name ?? null
      : null;

  // Task #665 — once the Person resolves, coerce the tab to a key
  // tabsForPerson() actually renders. Contact-shape people don't have
  // Dashboard/Releases/Streaming/Gear/Splits/Payouts tabs, so a direct
  // `/admin/people/:id` load (or a stale `?tab=dashboard` deep link)
  // must fall back to Overview instead of rendering the artist
  // Dashboard shell on a partner contact.
  useEffect(() => {
    if (!person) return;
    const allowed = new Set(
      (pressMode ? PRESS_PERSON_TABS : tabsForPerson(person)).map((t) => t.key),
    );
    if (!allowed.has(tab)) {
      setTabState("overview");
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("tab");
        window.history.replaceState({}, "", u.toString());
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.shape, person?.isGroup]);

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="people">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }

  if (error || !person) {
    return (
      <AdminFrame active="people">
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Person not found
          </h1>
          {backCrumb ? (
            <Link
              href={backCrumb.href}
              className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
              data-testid={backCrumb.testId}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to {backCrumb.name}
            </Link>
          ) : (
            <Link
              href="/admin/people"
              className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
              data-testid="link-back-to-people"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to people
            </Link>
          )}
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame
      active="people"
      contentWidth="narrow"
      preview={
        <PersonPreviewCard
          person={person}
          albums={allAlbums}
          labelName={labelName}
        />
      }
    >
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          {backCrumb ? (
            <>
              <Link
                href={backCrumb.href}
                className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate max-w-[420px]"
                data-testid={backCrumb.testId}
              >
                {backCrumb.name}
              </Link>
              {backCrumb.track && (
                <>
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  <Link
                    href={backCrumb.track.href}
                    className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate max-w-[260px]"
                    data-testid={backCrumb.track.testId}
                  >
                    {backCrumb.track.name}
                  </Link>
                </>
              )}
            </>
          ) : (
            <Link
              href="/admin/people"
              className="hover:text-slate-700"
              data-testid="link-breadcrumb-people"
            >
              People
            </Link>
          )}
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {person.name}
          </span>
          </div>
          {/* View as this Artist — super-admin-only god-view lens into the
              artist's real restricted /artist portal (opens a new tab, current
              god-view tab untouched). Mirrors ViewAsPartnerButton on partner
              detail pages. Only for artist-shape People. */}
          {!pressMode && personIsArtist(person) && (
            <ViewAsPartnerButton
              role="artist"
              scopeKind="artist"
              scopeId={personId}
              label={person.name}
              buttonText="View as this Artist"
              testId="button-view-as-artist"
            />
          )}
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          {/* Avatar doubles as the photo editor trigger — same hover-scrim
              + pencil-chip pattern as AdminAlbum's cover thumbnail. */}
          {pressMode ? (
            /* Press mode is read-only on the person profile — render a static
               avatar with no photo-editor trigger (the server also deny-walls
               /api/admin/people writes for presses). */
            <div
              className="rounded-full overflow-hidden flex-shrink-0"
              style={{ width: 96, height: 96 }}
              data-testid="img-person-photo"
            >
              <PersonAvatar
                name={person.name}
                photoUrl={person.photoUrl}
                size={96}
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPhotoEditorOpen(true)}
                className="group relative rounded-full overflow-hidden flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
                style={{ width: 96, height: 96 }}
                aria-label="Edit artist photo"
                data-testid="button-edit-person-photo"
              >
                <PersonAvatar
                  name={person.name}
                  photoUrl={person.photoUrl}
                  size={96}
                />
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 [@media(hover:none)]:bg-black/30 transition-colors" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                  <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                    <UserIcon className="w-4 h-4" />
                  </span>
                </span>
              </button>
              <PhotoEditorDialog
                person={person}
                open={photoEditorOpen}
                onOpenChange={setPhotoEditorOpen}
              />
            </>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              {/* Task #665 — contact-shape Persons are partner reps, not
                  artists, so the artist "Signed to / Independent" org
                  line doesn't apply. Show the partner they're attached
                  to instead (first attachment wins; the Overview tab
                  lists the full set). */}
              {person.shape === "contact"
                ? (person.attachments && person.attachments.length > 0
                    ? `${person.attachments[0].role || person.attachments[0].gtRole || "Contact"} at ${person.attachments[0].entityName}`
                    : "Contact")
                : (labelName ? `Signed to ${labelName}` : "Independent")}
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5 truncate"
              data-testid="heading-person-name"
            >
              {person.name}
            </h1>
            {person.bio && (
              <p className="text-slate-500 text-[13px] mt-1 line-clamp-2 max-w-xl">
                {person.bio}
              </p>
            )}
          </div>
        </div>

        {/* TABS — Overview/Cover/Discography on the LEFT, gray trash icon
            on the RIGHT, both riding the same hairline. Mirrors AdminAlbum:
            hover reveals a "Delete" label; opens a rose-tinted confirm
            sheet per the replit.md destructive-actions rule. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-person"
        >
          <div className="flex items-center gap-5 overflow-x-auto min-w-0 scrollbar-hide">
            {(pressMode ? PRESS_PERSON_TABS : tabsForPerson(person)).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "relative pb-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors",
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
          {pressMode ? (
            /* Task #2253 — a press can never system-delete a person; the only
               destructive verb available is un-homing the artist from their
               press, and that is Owner/Admin-only — read-only Staff don't see
               it (the remove endpoint also 403s them). */
            pressCanEdit ? (
              <button
                type="button"
                onClick={() => setRemoveConfirmOpen(true)}
                disabled={removeFromPress.isPending}
                aria-label="Remove from press"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 mb-1 rounded-md text-xs font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 flex-shrink-0"
                data-testid="button-remove-from-press"
              >
                Remove from press
              </button>
            ) : null
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deletePerson.isPending}
              aria-label="Delete person"
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 flex-shrink-0"
              data-testid="button-delete-person"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                Delete
              </span>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* TAB CONTENT */}
        {tab === "dashboard" && !pressMode && (
          <AdminPartnerDashboard
            scope="artist"
            scopeIdQs={person.id}
            title={person.name}
            subtitle={person.isGroup ? "Group dashboard" : "Artist dashboard"}
          />
        )}
        {tab === "overview" && (
          pressMode ? (
            <PressPersonOverview person={person} labelName={labelName} />
          ) : person.shape === "contact" ? (
            <ContactOverviewPanel person={person} />
          ) : (
            <OverviewPanel person={person} labels={labels} managers={managers} />
          )
        )}
        {/* Task #1783 — who gets this artist's end-of-day sales report.
            Reuses the partner-notification recipient settings; the daily
            digest only goes to people set up here. */}
        {tab === "overview" && !pressMode && person.shape !== "contact" && (
          <div className="mt-4">
            <NotificationsCard partnerKind="person" partnerId={person.id} partnerName={person.name} />
          </div>
        )}
        {tab === "cover" && (
          pressMode ? (
            <PressPersonCover person={person} />
          ) : (
            <ImageUploadPanel person={person} field="cover" />
          )
        )}
        {tab === "members" && !pressMode && person.isGroup && <MembersPanel person={person} />}
        {tab === "releases" && (
          <ReleasesPanel
            person={person}
            allAlbums={allAlbums}
            pressMode={pressMode}
            editableById={pressEditableById}
          />
        )}
        {tab === "streaming" && (
          pressMode ? (
            <PressPersonStreaming person={person} />
          ) : (
            <DiscographyPanel person={person} />
          )
        )}
        {tab === "gear" && !pressMode && (
          <PersonGearManager personId={person.id} personName={person.name} />
        )}
        {/* Task #616 — Read-only splits rail. Splits are owned by the
            album's Splits tab; this is just a rollup of "where does this
            person earn?" with deep-links back to the source album. */}
        {tab === "splits" && !pressMode && <PersonSplitsRail personId={person.id} />}
        {tab === "payouts" && !pressMode && (
          <PayoutAccountPanel
            ownerKind="person"
            ownerId={person.id}
            ownerName={person.name}
            ownerEmail={(person as any).email ?? null}
          />
        )}
        {tab === "permissions" && !pressMode && (
          <>
            {/* Task #2071 / #2143 — the artist-scope framing (the "governs
                AS AN ARTIST" note, the artist permission matrix, and the
                "Invite to this artist" panel) only applies when this Person
                is actually an artist. Contact-shape partner staff who aren't
                artists (Travis Whitlock at Hellbender, Andrew at PMP) get
                only their partner-staff access instead — their label / press
                / vendor access is governed on that partner's OWN page. */}
            {personIsArtist(person) ? (
              <>
                <ArtistScopeNote person={person} />
                <PartnerPermissionsPanel scopeKind="artist" scopeId={person.id} scopeName={person.name} />
                {/* Task #1020 — Invite someone to this artist without leaving
                    the page; scope is hard-locked to this Person. */}
                <InviteToArtistPanel personId={person.id} personName={person.name} />
              </>
            ) : (
              <PartnerStaffScopeNote person={person} />
            )}
            {/* Task #350 — Per-person ambassador toggle. Only meaningful
                when the person is tied to a non-profit (server enforces
                — toggle disabled otherwise). When ON, the NPO partner
                can attribute invites to this person and the new
                artist's referral credits flow to the ambassador (with
                the NPO still seeing them in their roll-up). */}
            <AmbassadorToggle
              personId={person.id}
              canInviteAmbassadors={person.canInviteAmbassadors ?? false}
              referredByOrgId={person.referredByOrgId ?? null}
              earnsReferralPayout={person.earnsReferralPayout ?? true}
            />
          </>
        )}
      </div>

      {/* Destructive confirm sheet — names the person and explains what
          happens to their credits + album links per the replit.md rule.
          Cancel sits on the left so the thumb defaults away from the
          destructive action; breathing-room gap before Delete. */}
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(v) => !deletePerson.isPending && setDeleteConfirmOpen(v)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-delete-person"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Delete <span className="italic">{person.name}</span>?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              This removes the person from your catalog. Any credits and
              albums linked to them stay in place — the credits keep their
              name snapshot, and albums simply lose the artist link.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deletePerson.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-delete-person-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => deletePerson.mutate()}
              disabled={deletePerson.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
              data-testid="button-delete-person-confirm"
            >
              {deletePerson.isPending ? "Deleting…" : "Delete person"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task #2253 — press "Remove from press" confirm. Non-destructive to
          the person record: it only un-homes the artist from this press
          (clears default_press_id). Re-adding via the People tab re-links. */}
      <Dialog
        open={removeConfirmOpen}
        onOpenChange={(v) => !removeFromPress.isPending && setRemoveConfirmOpen(v)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-remove-from-press"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Remove <span className="italic">{person.name}</span> from your press?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              This un-links the artist from your press. Their profile,
              credits, and releases stay on GoodTunes — you just won't see
              them in your People list anymore. You can re-add them later
              from the People tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              onClick={() => setRemoveConfirmOpen(false)}
              disabled={removeFromPress.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-remove-from-press-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => removeFromPress.mutate()}
              disabled={removeFromPress.isPending}
              className="bg-slate-900 hover:bg-slate-800 text-white ml-2"
              data-testid="button-remove-from-press-confirm"
            >
              {removeFromPress.isPending ? "Removing…" : "Remove from press"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

/* ─── Avatar (reused in header + cards) ────────────────────────────── */

function PersonAvatar({
  name,
  photoUrl,
  size,
}: {
  name: string;
  photoUrl: string | null;
  size: number;
}) {
  return (
    <div
      className={[
        "rounded-full overflow-hidden shadow-sm flex-shrink-0",
        photoUrl ? "" : "bg-[var(--brand-blue)] ring-1 ring-slate-200",
      ].join(" ")}
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className="w-full h-full object-cover"
          data-testid="img-person-photo"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span
            className="text-white font-bold"
            style={{ fontSize: size * 0.4 }}
          >
            {getInitials(name, "?")}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Contact-shape Overview tab (Task #665) ───────────────────────── */

const CONTACT_ATTACHMENT_HREF: Record<NonNullable<PersonFull["attachments"]>[number]["entityKind"], (id: string) => string> = {
  vendor: (id) => `/admin/vendors/${id}`,
  manufacturer: (id) => `/admin/manufacturers/${id}`,
  label: (id) => `/admin/labels/${id}`,
  fulfillment_partner: (id) => `/admin/fulfillment/${id}`,
  non_profit: (id) => `/admin/non-profits/${id}`,
};
const CONTACT_ATTACHMENT_LABEL: Record<NonNullable<PersonFull["attachments"]>[number]["entityKind"], string> = {
  vendor: "Maker / Reseller",
  manufacturer: "Press",
  label: "Label",
  fulfillment_partner: "Fulfillment partner",
  non_profit: "Non-profit",
};

/* ─── Affiliation panel (Task #968 / #2071) ──────────────────────────
   The partner/business affiliations a Person represents, as deep links.
   Shared by both shapes: the contact shape always renders it (with the
   "Not affiliated yet" empty state), while the artist shape passes
   `hideWhenEmpty` so a pure performer isn't cluttered — but a dual-role
   person (band artist + MRP sales contact, etc.) still sees both roles
   on their artist page. Reuses the same attachment links either way.

   Task #2071: each affiliation can now carry an editable *business
   title* (CEO, CMO, A&R…), persisted as that affiliation's
   `entity_contacts.role` / `organization_people.role`. This is a
   separate axis from music "Creative credits" — it never touches
   people.roles[] and so can't flip a pure business contact into artist
   shape. The chosen title leads the line; the platform-role badge
   ("LABEL STAFF") still anchors the context. */

// Quiet per-row ghost-link Save (mirrors SellPanel's `SaveLink`): brand
// blue + soft pill when dirty, inert otherwise. Keeps accent restraint —
// no filled primary stacked next to a section-level Save.
function SaveLink({
  dirty,
  onClick,
  testId,
}: {
  dirty: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty}
      className={
        "h-8 px-2.5 rounded-md text-xs font-medium transition-colors " +
        (dirty
          ? "text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue-soft)]"
          : "text-slate-400 cursor-default")
      }
      data-testid={testId}
    >
      Save
    </button>
  );
}

// Per-entity contact-role save path, keyed by the attachment's entity
// kind. label/press/maker/fulfillment all share the entity_contacts
// upsert (`POST {base}/:id/people {personId, role}`); non-profit writes
// organization_people through its own people endpoint. (Note the API
// base for fulfillment is the hyphenated `/api/fulfillment-partners`,
// distinct from the `/admin/fulfillment/:id` page href.)
const AFFILIATION_SAVE_BASE: Record<NonNullable<PersonFull["attachments"]>[number]["entityKind"], string> = {
  vendor: "/api/vendors",
  manufacturer: "/api/manufacturers",
  label: "/api/labels",
  fulfillment_partner: "/api/fulfillment-partners",
  non_profit: "/api/non-profits",
};

function AffiliationRow({
  a,
  personId,
  canEdit,
}: {
  a: NonNullable<PersonFull["attachments"]>[number];
  personId: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const initial = a.role ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(initial);
  useEffect(() => { setDraft(initial); }, [initial]);

  const norm = (v: string | null) => (v ?? "").trim();
  const dirty = norm(draft) !== norm(initial);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${AFFILIATION_SAVE_BASE[a.entityKind]}/${a.entityId}/people`, {
        personId,
        // Send null (not "") to clear the title cleanly.
        role: norm(draft) === "" ? null : draft,
      });
    },
    onSuccess: () => {
      // Re-fetch the person so attachments[].role reflects the saved
      // title (and both list + detail caches stay in lock-step).
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people", personId] });
      queryClient.invalidateQueries({ queryKey: ["/api/people", personId] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Title saved" });
      setEditing(false);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save title", description: e?.message || "Try again.", variant: "destructive" }),
  });

  return (
    <li className="px-1 py-2.5" data-testid={`row-overview-attachment-${a.entityId}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate" data-testid={`text-affiliation-role-${a.entityId}`}>
            {a.role ? (
              a.role
            ) : (
              <span className="font-normal text-slate-400" data-testid={`text-affiliation-no-title-${a.entityId}`}>
                {canEdit ? "No business title yet" : "Contact"}
              </span>
            )}
            <span className="font-normal text-slate-400"> at </span>
            <Link
              href={CONTACT_ATTACHMENT_HREF[a.entityKind](a.entityId)}
              className="font-semibold text-slate-900 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2"
              data-testid={`link-overview-attachment-${a.entityId}`}
            >
              {a.entityName}
            </Link>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{CONTACT_ATTACHMENT_LABEL[a.entityKind]}</p>
        </div>
        {a.gtRole && (
          <span
            className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-purple)] bg-[color:var(--brand-purple)]/10 rounded-full px-2.5 py-1 flex-shrink-0"
            data-testid={`badge-gtrole-${a.entityId}`}
          >
            {a.gtRole}
          </span>
        )}
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-[color:var(--brand-blue)]"
            data-testid={`button-edit-affiliation-title-${a.entityId}`}
          >
            <Pencil className="h-3 w-3" />
            {a.role ? "Edit title" : "Add title"}
          </button>
        )}
      </div>

      {canEdit && editing && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <BusinessTitlePicker
            value={draft}
            onChange={setDraft}
            testIdPrefix={a.entityId}
          />
          <div className="mt-2 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => { setDraft(initial); setEditing(false); }}
              className="h-8 px-2.5 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100"
              data-testid={`button-cancel-affiliation-title-${a.entityId}`}
            >
              Cancel
            </button>
            <SaveLink
              dirty={dirty && !save.isPending}
              onClick={() => save.mutate()}
              testId={`button-save-affiliation-title-${a.entityId}`}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function AffiliationPanel({
  person,
  hideWhenEmpty = false,
}: {
  person: PersonFull;
  hideWhenEmpty?: boolean;
}) {
  const attachments = person.attachments ?? [];
  // Per-affiliation title saves go through super-admin-only contact
  // endpoints; non-super-admins see the titles read-only.
  const { data: role } = useQuery<{ role?: string }>({ queryKey: ["/api/me/role"] });
  const canEdit = role?.role === "super_admin";
  if (hideWhenEmpty && attachments.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" data-testid="panel-overview-affiliation">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Affiliation &amp; business title</h2>
        <p className="text-xs text-slate-500">The partner this person represents and their job there (CEO, A&amp;R, Fulfillment…). Separate from any music credits below.</p>
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="text-overview-no-attachments">Not affiliated with any partner yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 -mx-1">
          {attachments.map((a) => (
            <AffiliationRow
              key={`${a.entityKind}-${a.entityId}`}
              a={a}
              personId={person.id}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── Permissions-tab scope note (Task #2071) ────────────────────────
   The Permissions tab governs this Person AS AN ARTIST (the matrix +
   "Invite to this artist" are all scoped to people.id). When the same
   person is ALSO partner staff (Garry West = CEO of Compass Records AND
   an artist), their label/press/vendor access is governed on that
   partner's OWN page — the single source of truth. We make the artist
   scope explicit and deep-link to each partner rather than duplicating
   an editable matrix here. */
function ArtistScopeNote({ person }: { person: PersonFull }) {
  const attachments = person.attachments ?? [];
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 mb-4"
      data-testid="note-permissions-artist-scope"
    >
      <p className="text-sm text-slate-700">
        These permissions and invites govern{" "}
        <span className="font-semibold text-slate-900">{person.name}</span> as an{" "}
        <span className="font-semibold text-slate-900">artist</span> — their own
        catalog, releases, and profile.
      </p>
      {attachments.length > 0 && (
        <div className="mt-2 text-xs text-slate-500" data-testid="note-permissions-partner-scopes">
          <p>
            {person.name} is also partner staff. Their access at the{" "}
            {attachments.length === 1 ? "partner below" : "partners below"} is managed on
            that partner's own page:
          </p>
          <ul className="mt-1.5 space-y-1">
            {attachments.map((a) => (
              <li key={`${a.entityKind}-${a.entityId}`} data-testid={`link-permissions-partner-scope-${a.entityId}`}>
                <Link
                  href={CONTACT_ATTACHMENT_HREF[a.entityKind](a.entityId)}
                  className="hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                >
                  Manage access at{" "}
                  <span className="font-semibold text-slate-700">{a.entityName}</span>
                </Link>
                <span className="text-slate-400"> · {CONTACT_ATTACHMENT_LABEL[a.entityKind]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Permissions-tab note for non-artist partner staff (Task #2143) ──
   Contact-shape people who aren't artists (Travis Whitlock at Hellbender,
   Andrew at PMP) are partner staff, not performers — they have no own
   catalog, releases, or profile to govern. So the Permissions tab drops
   the artist-scope note, the artist permission matrix, and the "Invite to
   this artist" panel entirely and shows only their partner-staff access:
   their actual access at each attached partner is managed on that partner's
   OWN page (the single source of truth). */
function PartnerStaffScopeNote({ person }: { person: PersonFull }) {
  const attachments = person.attachments ?? [];
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 mb-4"
      data-testid="note-permissions-partner-staff-scope"
    >
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{person.name}</span> is{" "}
        <span className="font-semibold text-slate-900">partner staff</span>, not an
        artist — they have no catalog, releases, or profile of their own. Their
        access is managed on each attached partner's own page.
      </p>
      {attachments.length > 0 ? (
        <div className="mt-2 text-xs text-slate-500" data-testid="note-permissions-partner-scopes">
          <ul className="mt-1.5 space-y-1">
            {attachments.map((a) => (
              <li key={`${a.entityKind}-${a.entityId}`} data-testid={`link-permissions-partner-scope-${a.entityId}`}>
                <Link
                  href={CONTACT_ATTACHMENT_HREF[a.entityKind](a.entityId)}
                  className="hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                >
                  Manage access at{" "}
                  <span className="font-semibold text-slate-700">{a.entityName}</span>
                </Link>
                <span className="text-slate-400"> · {CONTACT_ATTACHMENT_LABEL[a.entityKind]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500" data-testid="note-permissions-partner-staff-unattached">
          This person isn't attached to any partner yet. Attach them to a label,
          press, vendor, fulfillment partner, or non-profit to manage their access.
        </p>
      )}
    </div>
  );
}

function ContactOverviewPanel({ person }: { person: PersonFull }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const endpoint = `/api/admin/people/${person.id}`;
  const invalidate: (readonly unknown[])[] = [
    ["/api/admin/people", person.id],
    ["/api/people", person.id],
    ["/api/people"],
  ];
  const promote = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/people/${person.id}/promote-artist`),
    onSuccess: () => {
      toast({ title: `Artist profile added for ${person.name}`, description: "Discography, Gear, Splits, and Payouts tabs are now live. Contact and affiliation details are unchanged." });
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: (e: any) => toast({ title: "Couldn't add artist profile", description: e?.message ?? "Try again in a moment.", variant: "destructive" }),
  });
  return (
    <div className="space-y-5">
      <EditablePanel
        title="Contact"
        testId="panel-overview-contact"
        endpoint={endpoint}
        values={{
          name: person.name,
          bio: person.bio,
          contactEmail: person.contactEmail ?? "",
          contactPhone: person.contactPhone ?? "",
        }}
        invalidate={invalidate}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          { key: "contactEmail", label: "Email", type: "text", placeholder: "name@example.com" },
          { key: "contactPhone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
          { key: "bio", label: "Title / note", type: "textarea", placeholder: "Director, A&R, plant manager — anything that orients future operators." },
        ]}
      />

      <AffiliationPanel person={person} />

      <IntroductionsPanel person={person} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" data-testid="panel-overview-promote">
        <div>
          <h2 className="text-sm font-bold text-slate-900">This person is also an artist</h2>
          <p className="text-xs text-slate-500">
            Add an artist profile to this contact. Their contact details and partner affiliations stay intact — this just adds the Discography, Gear, Splits, and Payouts tabs.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => promote.mutate()}
          disabled={promote.isPending}
          data-testid="button-promote-to-artist"
        >
          {promote.isPending ? "Adding…" : "Add artist profile"}
        </Button>
      </section>
    </div>
  );
}

/* ─── Task #923 — Introductions summary (contact-shape) ──────────────
   A referrer contact (NPO ambassador, press rep, artist-as-recruiter)
   reads like a recruiter record: the artists they've invited / referred
   plus where each one is in the funnel (invited / signed / declined /
   expired). Hidden entirely when the person hasn't introduced anyone, so
   the Overview stays clean for plain contacts. */
const INTRO_STATUS_STYLE: Record<NonNullable<PersonFull["introductions"]>[number]["status"], { label: string; cls: string }> = {
  signed: { label: "Signed", cls: "text-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/10" },
  invited: { label: "Invited", cls: "text-amber-600 bg-amber-50" },
  expired: { label: "Expired", cls: "text-slate-500 bg-slate-100" },
  declined: { label: "Declined", cls: "text-rose-600 bg-rose-50" },
};

function IntroductionsPanel({ person }: { person: PersonFull }) {
  const intros = person.introductions ?? [];
  if (intros.length === 0) return null;
  const signed = intros.filter((i) => i.status === "signed").length;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3" data-testid="panel-overview-introductions">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Introductions</h2>
          <p className="text-xs text-slate-500">Artists this person has invited or referred to GoodTunes.</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 flex-shrink-0" data-testid="text-intro-count">
          {signed} signed · {intros.length} total
        </span>
      </div>
      <ul className="divide-y divide-slate-100 -mx-1">
        {intros.map((i, idx) => {
          const style = INTRO_STATUS_STYLE[i.status];
          return (
            <li key={i.id ?? `${i.name}-${idx}`} className="flex items-center gap-3 px-1 py-2" data-testid={`row-introduction-${i.id ?? idx}`}>
              <PersonAvatar name={i.name} photoUrl={i.photoUrl} size={32} />
              {i.id ? (
                <Link
                  href={`/admin/people/${i.id}`}
                  className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2"
                  data-testid={`link-introduction-${i.id}`}
                >
                  {i.name}
                </Link>
              ) : (
                <span className="flex-1 min-w-0 text-sm font-medium text-slate-700 truncate" data-testid={`text-introduction-${idx}`}>
                  {i.name}
                </span>
              )}
              <span className={`text-xs font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 flex-shrink-0 ${style.cls}`} data-testid={`status-introduction-${i.id ?? idx}`}>
                {style.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─── Overview tab ─────────────────────────────────────────────────── */

/* ─── Task #824 — Creative credits panel ──────────────────────────────
   Editable multi-select of the "hats" a person wears (Artist / Producer /
   Writer / Performer / …), persisted as people.roles[]. The credit-derived
   rollup (from real track/album credits) renders read-only underneath so
   the operator sees the full picture without re-tagging by hand. Tagging
   "Artist" here flips the row to artist shape server-side, which is what
   kills the old add-as-admin → convert-to-artist dead-end. */
function RolesPanel({ person }: { person: PersonFull }) {
  const { toast } = useToast();
  const initial = useMemo(() => (Array.isArray(person.roles) ? person.roles : []), [person.roles]);
  const [roles, setRoles] = useState<string[]>(initial);
  useEffect(() => { setRoles(initial); }, [initial]);

  const dirty = useMemo(() => {
    if (roles.length !== initial.length) return true;
    const a = [...roles].map((r) => r.toLowerCase()).sort();
    const b = [...initial].map((r) => r.toLowerCase()).sort();
    return a.some((v, i) => v !== b[i]);
  }, [roles, initial]);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/people/${person.id}`, { roles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people", person.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/people", person.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Credits saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save credits", description: e?.message || "Try again.", variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="panel-overview-roles">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Music credits</h3>
          {/* Task #2071 — call out that this is the music axis, distinct
              from the business title set on each affiliation above. Only
              for people who actually make music; tagging a credit here
              flips the row to artist shape. */}
          <p className="text-xs text-slate-500 mt-0.5">
            Only for people who make music — separate from their business title. Leave empty for a pure business contact.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="flex-shrink-0"
          data-testid="button-save-roles"
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <RolePicker
        testIdPrefix="person-overview"
        creativeValue={roles}
        onCreativeChange={setRoles}
        creativeLabel="Music hats they wear"
        creativeHint="Artist, producer, writer, performer…"
        derivedCreative={Array.isArray(person.derivedRoles) ? person.derivedRoles : []}
      />
    </div>
  );
}

// Robust copy: the async Clipboard API rejects (or silently hangs) in a
// cross-origin/unfocused iframe like the Replit workspace preview. Try it,
// then fall back to a hidden-textarea execCommand so the copy + success
// feedback still fire.
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Task #1313 — Artist URL editor for the People admin panel. Mirrors the
// artist half of the album page's ShareLinkPanel (AdminAlbum.tsx), but
// keyed directly off the person row so admins can set/clear an artist's
// share slug before any albums exist (or when managing an artist with many
// releases). Saves independently on blur/enter; Suggest + Copy + Clear
// controls. Uses the same shared/shareSlug validation and the existing
// PUT /api/admin/people/:id { artistShareSlug } +
// GET /api/admin/people/:id/artist-share-slug-available endpoints.
function ArtistUrlPanel({ person }: { person: PersonFull }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const savedSlug = person.artistShareSlug ?? "";
  const [draft, setDraft] = useState(savedSlug);
  const [suggesting, setSuggesting] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(savedSlug); }, [savedSlug]);

  const validation = draft.trim() === "" ? null : validateShareSlug(draft);
  const localError = validation && !validation.ok ? validation.reason : null;
  const normalized = normalizeShareSlug(draft);
  const isDirty = normalized !== savedSlug;

  const save = useMutation({
    mutationFn: async (next: string | null) => {
      const r = await apiRequest("PUT", `/api/admin/people/${person.id}`, {
        artistShareSlug: next,
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/people", person.id] });
      qc.invalidateQueries({ queryKey: ["/api/people", person.id] });
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Artist URL saved." });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save artist URL",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
      setDraft(savedSlug);
    },
  });

  const commit = () => {
    if (save.isPending) return;
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (savedSlug !== "") save.mutate(null);
      return;
    }
    if (!validation?.ok) return;
    if (validation.slug === savedSlug) { setDraft(savedSlug); return; }
    setDraft(validation.slug);
    save.mutate(validation.slug);
  };

  const clear = () => {
    if (save.isPending) return;
    setDraft("");
    if (savedSlug !== "") save.mutate(null);
  };

  const checkAvailable = async (slug: string): Promise<boolean> => {
    try {
      const r = await apiRequest(
        "GET",
        `/api/admin/people/${person.id}/artist-share-slug-available?slug=${encodeURIComponent(slug)}`,
      );
      const data = await r.json();
      return !!data.available;
    } catch { return false; }
  };

  const suggest = async () => {
    if (save.isPending || suggesting) return;
    const v = validateShareSlug(person.name ?? "");
    if (!v.ok) { toast({ title: "No artist name to suggest from." }); return; }
    setSuggesting(true);
    try {
      for (let n = 1; n <= 9; n++) {
        const candidate = n === 1 ? v.slug : `${v.slug}-${n}`;
        const cv = validateShareSlug(candidate);
        if (!cv.ok) continue;
        if (await checkAvailable(cv.slug)) { setDraft(cv.slug); return; }
      }
      setDraft(v.slug);
      toast({ title: "Artist slug may be taken", description: "Tweak it before saving." });
    } finally { setSuggesting(false); }
  };

  const copyableSlug = savedSlug || (validation?.ok ? validation.slug : "");
  const copyUrl = copyableSlug ? `https://${SHARE_LINK_HOST}/${copyableSlug}` : "";
  const copy = async () => {
    if (!copyUrl) return;
    const ok = await copyTextToClipboard(copyUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast({ title: "Couldn't copy", description: copyUrl, variant: "destructive" });
    }
  };

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5"
      data-testid="panel-overview-artist-url"
    >
      <div className="flex items-center gap-1.5">
        <Link2 className="w-4 h-4 text-[color:var(--brand-blue)]" />
        <span className="text-sm font-semibold text-slate-900">Artist URL</span>
      </div>
      <p className="text-xs text-slate-500 mt-1 leading-snug">
        The artist part of this artist's share links:{" "}
        <span className="font-medium text-slate-700">{SHARE_LINK_HOST}/<em>artist</em>/<em>album</em></span>.
        Shared across every one of {person.name}'s releases.
      </p>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-600">Slug</span>
          <button
            type="button"
            onClick={suggest}
            disabled={save.isPending || suggesting}
            className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-blue)] hover:underline disabled:opacity-50 disabled:no-underline"
            data-testid="button-suggest-artist-url"
          >
            {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {suggesting ? "Checking…" : "Suggest"}
          </button>
        </div>
        <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 focus-within:border-[color:var(--brand-blue)] overflow-hidden">
          <span className="pl-2.5 pr-1 text-xs text-slate-400 whitespace-nowrap select-none">
            {SHARE_LINK_HOST}/
          </span>
          <Input
            value={draft}
            disabled={save.isPending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
            placeholder="nightbirde"
            className="h-8 border-0 bg-transparent px-1 focus-visible:ring-0 shadow-none"
            data-testid="input-artist-url"
          />
        </div>
        {localError ? (
          <p className="text-xs text-rose-600 mt-1" data-testid="text-artist-url-error">{localError}</p>
        ) : isDirty && normalized ? (
          <p className="text-xs text-slate-500 mt-1">Saves as <span className="font-medium text-slate-700">{normalized}</span></p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {copyUrl ? (
          <p className="flex-1 min-w-0 text-xs text-slate-500 truncate" data-testid="text-artist-url-full">
            {copyUrl}
          </p>
        ) : (
          <p className="flex-1 text-xs text-slate-400 italic">
            Set a slug to get the artist link.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-8 shrink-0"
          disabled={!savedSlug || save.isPending}
          onClick={clear}
          data-testid="button-clear-artist-url"
        >
          <X className="w-4 h-4" />
          <span className="ml-1.5">Clear</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-8 shrink-0"
          disabled={!copyUrl}
          onClick={copy}
          data-testid="button-copy-artist-url"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
    </div>
  );
}

function OverviewPanel({
  person,
  labels,
  managers,
}: {
  person: PersonFull;
  labels: LabelLite[];
  managers: ManagerLite[];
}) {
  // Streaming services (Apple Music / Spotify) now live inline at the
  // bottom of the Overview tab — they used to be their own tab, but
  // there are only two fields, which didn't justify a separate tab.
  const invalidate: (readonly unknown[])[] = [
    ["/api/admin/people", person.id],
    ["/api/people", person.id],
    ["/api/people"],
  ];
  const endpoint = `/api/admin/people/${person.id}`;
  const labelOptions = [
    { value: "", label: "Independent" },
    ...[...labels]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: l.id, label: l.name })),
  ];
  const managerOptions = [
    { value: "", label: "Unmanaged" },
    ...[...managers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ value: m.id, label: m.name })),
  ];
  // Task #190 — group kind options. Free-form on the wire, picker in the UI.
  const groupKindOptions = [
    { value: "", label: "Solo artist" },
    { value: "Band", label: "Band" },
    { value: "Duo", label: "Duo" },
    { value: "Trio", label: "Trio" },
    { value: "Quartet", label: "Quartet" },
    { value: "Orchestra", label: "Orchestra" },
    { value: "Choir", label: "Choir" },
    { value: "Ensemble", label: "Ensemble" },
  ];
  return (
    <div className="space-y-5">
      <ReferralSummaryPanel kind="artist" id={person.id} />
      <InvitedByPressPanel kind="people" id={person.id} currentPressId={person.invitedByPressId} currentPressMode={(person as any).pressMode} />
      <RolesPanel person={person} />
      {/* Task #968 — an artist who is also partner staff (band artist +
          MRP sales contact, label/NPO/vendor staff, …) sees their
          business affiliation here too, so neither role hides the other.
          Hidden entirely for a pure artist with no affiliations. */}
      <AffiliationPanel person={person} hideWhenEmpty />
      <ArtistUrlPanel person={person} />
      <EditablePanel
        title="Identity"
        testId="panel-overview-identity"
        endpoint={endpoint}
        values={{
          name: person.name,
          bio: person.bio,
          labelId: person.labelId ?? "",
          managerId: person.managerId ?? "",
          // Task #190 — group kind. Empty = solo artist; non-empty value
          // flips `isGroup` true server-side and unlocks the Members tab
          // + the per-album Lineup panel.
          groupKind: person.groupKind ?? "",
          // Task #490 — artist comp / contact shipping address.
          shippingAddress: person.shippingAddress ?? "",
          // Task #517 — Places-picked structured snapshot.
          shippingAddressStruct: person.shippingAddressStruct ?? null,
        }}
        invalidate={invalidate}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          {
            key: "labelId",
            label: "Label",
            type: "select",
            options: labelOptions,
          },
          {
            key: "managerId",
            label: "Manager",
            type: "select",
            options: managerOptions,
          },
          {
            key: "groupKind",
            label: "Type",
            type: "select",
            options: groupKindOptions,
          },
          {
            key: "shippingAddress",
            label: "Shipping address",
            type: "address",
            placeholder: "Where artist comp copies & mail go",
            // Task #517 — round-trip the Places snapshot too.
            addressKey: "shippingAddressStruct",
          },
          {
            key: "bio",
            label: "Bio",
            type: "textarea",
            placeholder: "A short paragraph about the artist.",
          },
        ]}
      />
      <EditablePanel
        title="Socials"
        testId="panel-overview-socials"
        endpoint={endpoint}
        values={{
          instagramUrl: person.instagramUrl,
          tiktokUrl: person.tiktokUrl,
          twitterUrl: person.twitterUrl,
          blueskyUrl: person.blueskyUrl,
          facebookUrl: person.facebookUrl,
          websiteUrl: person.websiteUrl,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "instagramUrl",
            label: "Instagram",
            type: "url",
            readIcon: SiInstagram,
            placeholder: "https://instagram.com/…",
          },
          {
            key: "tiktokUrl",
            label: "TikTok",
            type: "url",
            readIcon: SiTiktok,
            placeholder: "https://tiktok.com/@…",
          },
          {
            key: "twitterUrl",
            label: "X / Twitter",
            type: "url",
            readIcon: SiX,
            placeholder: "https://x.com/…",
          },
          {
            key: "blueskyUrl",
            label: "Bluesky",
            type: "url",
            readIcon: SiBluesky,
            placeholder: "https://bsky.app/profile/…",
          },
          {
            key: "facebookUrl",
            label: "Facebook",
            type: "url",
            readIcon: SiFacebook,
            placeholder: "https://facebook.com/…",
          },
          {
            key: "websiteUrl",
            label: "Website",
            type: "url",
            readIcon: Globe,
            placeholder: "https://…",
          },
        ]}
      />
      {/* Streaming services — Apple Music + Spotify. Lives at the
          bottom of Overview so the more frequently edited
          Identity/Socials sit on top. The Spotify picker shortcut was
          removed: admins can paste a Spotify URL straight into the
          field below if the auto-match isn't right. */}
      <div className="space-y-3">
        <EditablePanel
          title="Streaming services"
          testId="panel-streaming"
          endpoint={endpoint}
          values={{
            appleMusicUrl: person.appleMusicUrl,
            spotifyUrl: person.spotifyUrl,
            tidalUrl: person.tidalUrl,
            qobuzUrl: person.qobuzUrl,
            deezerUrl: person.deezerUrl,
            pandoraUrl: person.pandoraUrl,
          }}
          invalidate={invalidate}
          fields={[
            {
              key: "appleMusicUrl",
              label: "Apple Music",
              type: "url",
              readIcon: SiApplemusic,
              placeholder: "https://music.apple.com/…",
            },
            {
              key: "spotifyUrl",
              label: "Spotify",
              type: "url",
              readIcon: SiSpotify,
              placeholder: "https://open.spotify.com/artist/…",
            },
            {
              key: "tidalUrl",
              label: "Tidal",
              type: "url",
              readIcon: SiTidal,
              placeholder: "https://tidal.com/browse/artist/…",
            },
            {
              key: "qobuzUrl",
              label: "Qobuz",
              type: "url",
              placeholder: "https://open.qobuz.com/artist/…",
            },
            {
              key: "deezerUrl",
              label: "Deezer",
              type: "url",
              placeholder: "https://www.deezer.com/artist/…",
            },
            {
              key: "pandoraUrl",
              label: "Pandora",
              type: "url",
              readIcon: SiPandora,
              placeholder: "https://www.pandora.com/artist/…",
            },
          ]}
        />
        <p className="text-slate-400 text-[11.5px] leading-relaxed px-1">
          Per replit.md: GoodTunes hosts a song in-app for the first ~2 weeks,
          then routes fans to these URLs. The Apple Music URL also feeds the
          iTunes Lookup pull used by the Discography tab.
        </p>
      </div>
    </div>
  );
}

/* ─── Photo / Cover tabs ───────────────────────────────────────────── */

/**
 * PhotoEditorDialog — wraps the same drop-zone upload UI used by the
 * Cover tab in a modal, triggered by the pencil-on-avatar in the page
 * header. Mirrors AdminAlbum's ArtworkPanel pattern so the two surfaces
 * read as the same product.
 */
function PhotoEditorDialog({
  person,
  open,
  onOpenChange,
}: {
  person: PersonFull;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid="dialog-edit-person-photo"
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-slate-900 text-[14px] font-bold">
            Photo
          </DialogTitle>
          <DialogDescription className="sr-only">
            Replace the avatar photo for {person.name}.
          </DialogDescription>
        </DialogHeader>
        <ImageUploadPanel person={person} field="photo" />
      </DialogContent>
    </Dialog>
  );
}

function ImageUploadPanel({
  person,
  field,
}: {
  person: PersonFull;
  field: "photo" | "cover";
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isCover = field === "cover";
  const currentUrl = isCover ? person.coverUrl : person.photoUrl;
  const locked = isCover ? person.coverLocked : person.photoLocked;
  const successLabel = isCover ? "Cover updated" : "Photo updated";
  const errorLabel = isCover
    ? "Couldn't update the cover"
    : "Couldn't update the photo";
  const ratioClass = isCover ? "aspect-[3/1]" : "aspect-square";
  const shapeClass = isCover ? "rounded-xl" : "rounded-full";
  const helperCopy = isCover
    ? "Recommended: wide landscape, at least 2400×800 px. Used as the hero banner on the fan-side artist page."
    : "Recommended: square, at least 1000×1000 px. Used as the avatar everywhere — credits sheet, search, top of the artist page.";

  // Toggle the curation lock. Optimistic via invalidate-on-success so the
  // chip flips instantly; a failed write rolls back when the refetch
  // arrives. Photo + cover share this same mutation — the patch shape
  // changes by `field`.
  const lockMut = useMutation({
    mutationFn: async (nextLocked: boolean) => {
      const patch = isCover
        ? { coverLocked: nextLocked }
        : { photoLocked: nextLocked };
      await apiRequest("PUT", `/api/admin/people/${person.id}`, patch);
      return nextLocked;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "person", person.id);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't change the lock",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // "Refresh from Spotify" — re-pulls the artist's portrait from the
  // saved Spotify profile and rehosts it. Only meaningful for the photo
  // field; Spotify's `/v1/artists/{id}` images are square portraits, not
  // wide banners, so the Cover tab doesn't expose this affordance.
  const refreshSpotifyMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/people/${person.id}/refresh-image-from-spotify`,
        {},
      );
      return r.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/admin/people", person.id] });
      await qc.invalidateQueries({ queryKey: ["/api/people", person.id] });
      await qc.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Photo refreshed from Spotify" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't refresh from Spotify",
        description:
          e?.message ||
          (person.spotifyUrl
            ? "Try again in a moment."
            : "Link this person to Spotify first on the Overview tab."),
        variant: "destructive",
      }),
  });

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      const patch = isCover ? { coverUrl: url } : { photoUrl: url };
      await apiRequest("PUT", `/api/admin/people/${person.id}`, patch);
      return url;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "person", person.id);
      setPreviewUrl(null);
      toast({ title: successLabel });
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: errorLabel,
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast({
        title: "That's not an image",
        description: "Use a JPG, PNG, or WebP file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep images under 8 MB.",
        variant: "destructive",
      });
      return;
    }
    mut.mutate(file);
  };

  const busy = mut.isPending;
  const shownUrl = previewUrl || currentUrl;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card
        className="rounded-2xl shadow-sm p-6"
        data-testid={`panel-${field}-current`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider">
            Current {field}
          </div>
          {/* Lock chip — Apple-style ghost toggle in the card's top-right.
              Brand blue when locked (= "set" / status), slate when not.
              Tap to flip. Tooltip explains the scope: locks block *auto*
              refresh paths, not the admin's own Replace button. */}
          <div className="flex items-center gap-2">
            {!isCover && (
              <button
                type="button"
                onClick={() => refreshSpotifyMut.mutate()}
                disabled={
                  refreshSpotifyMut.isPending || !person.spotifyUrl
                }
                title={
                  person.spotifyUrl
                    ? "Re-pull the portrait from this artist's Spotify profile"
                    : "Link this person to Spotify on the Overview tab first"
                }
                className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent text-[11.5px] font-medium"
                data-testid="button-refresh-photo-spotify"
              >
                {refreshSpotifyMut.isPending ? (
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SiSpotify className="w-3.5 h-3.5" />
                )}
                {refreshSpotifyMut.isPending ? "Refreshing\u2026" : "Refresh"}
              </button>
            )}
            <button
              type="button"
              onClick={() => !lockMut.isPending && lockMut.mutate(!locked)}
              disabled={lockMut.isPending}
              aria-pressed={locked}
              title={
                locked
                  ? "Locked \u2014 automated refreshes will skip this field"
                  : "Unlocked \u2014 automated refreshes may update this field"
              }
              className={[
                "inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40",
                locked
                  ? "text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
                lockMut.isPending && "opacity-50",
              ]
                .filter(Boolean)
                .join(" ")}
              data-testid={`button-lock-${field}`}
            >
              {locked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <LockOpen className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
        <div
          className={[
            "relative overflow-hidden bg-slate-100 ring-1 ring-slate-200",
            ratioClass,
            shapeClass,
            isCover ? "" : "max-w-xs mx-auto",
          ].join(" ")}
        >
          {shownUrl ? (
            <img
              src={shownUrl}
              alt={person.name}
              className="w-full h-full object-cover"
              data-testid={`img-${field}-current`}
            />
          ) : isCover ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <ImageIcon className="w-10 h-10" />
            </div>
          ) : (
            <div className="w-full h-full bg-[var(--brand-blue)] flex items-center justify-center">
              <span className="text-white text-5xl font-bold">
                {getInitials(person.name, "?")}
              </span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Spinner className="w-6 h-6 text-[var(--brand-blue)] animate-spin" />
              <span className="text-[12px] text-slate-700 font-semibold">
                Uploading…
              </span>
            </div>
          )}
        </div>
      </Card>

      <Card
        className="rounded-2xl shadow-sm p-6 flex flex-col"
        data-testid={`panel-${field}-upload`}
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Replace {field}
        </div>
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            if (locked) {
              toast({
                title: "Unlock first",
                description: `Tap the lock on the Current ${field} card to allow changes.`,
              });
              return;
            }
            fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy && !locked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy || locked) return;
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          aria-disabled={locked}
          data-testid={`dropzone-${field}`}
          className={[
            "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
            dragging
              ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            busy && "opacity-60 cursor-not-allowed",
            locked && "opacity-40 cursor-not-allowed hover:border-slate-200 hover:bg-transparent",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {locked ? (
            <>
              <Lock className="w-6 h-6 text-slate-400" />
              <div className="text-slate-700 text-[13px] font-semibold">
                Unlock to replace
              </div>
              <div className="text-slate-400 text-[11.5px]">
                Tap the lock on the current {field} to allow changes.
              </div>
            </>
          ) : (
            <>
              <Upload
                className={[
                  "w-7 h-7",
                  dragging ? "text-[var(--brand-blue)]" : "text-slate-400",
                ].join(" ")}
              />
              <div className="text-slate-700 text-[13px] font-semibold">
                {dragging
                  ? "Drop to upload"
                  : "Drag an image here, or click to pick"}
              </div>
              <div className="text-slate-400 text-[11.5px]">
                JPG, PNG, or WebP · up to 8 MB
              </div>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          data-testid={`input-${field}-file`}
        />
        <p className="mt-4 text-[11.5px] text-slate-500 leading-relaxed">
          {helperCopy}
        </p>
      </Card>
    </div>
  );
}


/* ─── GoodTunes® Releases tab ─────────────────────────────────────── */

// Albums actually in the GoodTunes catalog for this person. We match by
// `primaryArtistId === person.id` OR by case-insensitive artist-name
// equality, because primaryArtistId isn't always backfilled on older
// albums but the display name almost always is. Mirrors the union
// strategy on the fan-side ArtistDetail page so what the admin sees
// here matches what fans will see in the app.
function ReleasesPanel({
  person,
  allAlbums,
  pressMode = false,
  editableById,
}: {
  person: PersonFull;
  allAlbums: PersonPreviewAlbum[];
  // Task #2253 — in press mode the grid hides operator-only affordances
  // (Buyers roster, Add Album) and locks any album homed to another press.
  pressMode?: boolean;
  editableById?: Record<string, boolean>;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // Task #468 — name the album up-front instead of shipping a "New album"
  // placeholder. The title dialog opens after "+ Add Album"; on submit we
  // fire the create POST with the typed title. The smart-back hand-off
  // (`?from=person&personId=…`) also lets the Album page's delete handler
  // return here when the operator deletes this shell.
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  // Task #447 — "+ Add Album" on the artist's profile skips the
  // "Who's the artist?" gate from Task #445 entirely: we already know
  // the artist, so create the GoodTunes shell with primaryArtistId
  // pre-attached and drop straight into the onboarding flow. Mirrors
  // the createAlbum mutation on AdminAlbums.tsx (same endpoint, same
  // defaults, same `?onboarding=1` landing).
  const createAlbum = useMutation({
    mutationFn: async (args: { title: string }) => {
      const res = await apiRequest("POST", "/api/admin/albums", {
        title: args.title,
        artist: person.name,
        artwork: "/album-placeholder.svg",
        type: "LP",
        isGoodTunesRelease: true,
        isPrepping: true,
        primaryArtistId: person.id,
      });
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-albums"] });
      setTitleDialogOpen(false);
      // Carry the person id forward so the Album page's delete handler
      // can land the operator back here on success.
      navigate(
        `/admin/albums/${a.id}?onboarding=1&from=person&personId=${person.id}`,
      );
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't create album",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const needle = person.name.trim().toLowerCase();
  const releases = allAlbums
    .filter((a) => {
      // Only actual GoodTunes-distributed releases belong in this tab.
      // Streaming-imported Apple/Spotify rows for the same artist live
      // in the Streaming tab — see docs/admin-conventions.md §
      // "Streaming rows vs GoodTunes releases".
      if (!a.isGoodTunesRelease) return false;
      if (a.primaryArtistId === person.id) return true;
      const artist = (a.artist || "").trim().toLowerCase();
      return needle && artist === needle;
    })
    // Most recent first; albums missing a year sink to the bottom.
    .slice()
    .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));

  const hiddenCount = releases.filter((r) => r.isHidden).length;
  const visibleCount = releases.length - hiddenCount;
  const subline =
    releases.length === 0
      ? "No GoodTunes\u00AE releases for this artist yet."
      : `${visibleCount} ${visibleCount === 1 ? "release" : "releases"} fans can play in-app${hiddenCount ? ` · ${hiddenCount} hidden` : ""}`;

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };
  const q = query.trim().toLowerCase();
  const filtered = q
    ? releases.filter((r) => r.title.toLowerCase().includes(q))
    : releases;

  return (
    <Card
      className="rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-releases"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <Disc3 className="w-4 h-4 text-slate-400" />
            GoodTunes&reg; Releases
          </h2>
          <p className="text-slate-400 text-[11.5px]">{subline}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!pressMode && releases.length > 0 && (
            <Link
              href={`/admin/people/${person.id}/buyers`}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors inline-flex items-center gap-1.5 text-xs font-medium"
              data-testid="link-buyer-roster"
            >
              <Users className="w-3.5 h-3.5" />
              Buyers
            </Link>
          )}
          {searchOpen && (
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search releases…"
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] placeholder:text-slate-400 focus:outline-none focus:border-slate-300 w-44"
              data-testid="input-search-releases"
            />
          )}
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            disabled={releases.length === 0}
            title={searchOpen ? "Close search" : "Search releases"}
            className="px-2 h-8 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center"
            data-testid="button-search-releases"
          >
            {searchOpen ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
          </button>
          {/* Task #447 — skip the "Who's the artist?" gate: we're already
              on the artist's page, so create the shell with their id
              attached and jump straight into onboarding. Hidden in press
              mode — a press doesn't mint GoodTunes release shells. */}
          {!pressMode && (
            <button
              type="button"
              disabled={createAlbum.isPending}
              onClick={() => {
                if (createAlbum.isPending) return;
                setTitleDialogOpen(true);
              }}
              className="px-2.5 h-8 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-new-album-for-person"
            >
              <Plus className="w-3 h-3" />
              Add Album
            </button>
          )}
        </div>
      </div>
      <div className="p-6">
        {releases.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-[12.5px] max-w-md mx-auto">
            When an album is flagged as a GoodTunes&reg; release and this
            artist is its primary artist (or the album's artist field
            matches their name), the release will appear here. Streaming-only
            Apple/Spotify rows for this artist live in the Streaming tab.
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-[12.5px] max-w-md mx-auto">
            No releases match &ldquo;{query}&rdquo;
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((r) => {
              // Task #2253 — in press mode, only albums homed to THIS press
              // are editable. Other-press albums are shown but locked: a
              // greyed, non-clickable tile with a lock badge + tooltip.
              const editable = editableById ? !!editableById[r.id] : true;
              const cover = (
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 group-hover:ring-slate-300 transition-shadow relative">
                  {r.artwork ? (
                    <img
                      src={r.artwork}
                      alt={r.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  {!editable && (
                    <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/90 ring-1 ring-slate-200 text-slate-500 shadow-sm">
                      <Lock className="w-3 h-3" />
                    </span>
                  )}
                </div>
              );
              const meta = (
                <>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="text-slate-900 text-[12.5px] font-semibold truncate flex-1">
                      {r.title}
                    </div>
                    {r.isHidden && (
                      <span className="text-[9.5px] uppercase tracking-wider text-slate-400 font-semibold flex-shrink-0">
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-[11px] truncate">
                    {r.type}
                    {r.year ? ` \u00B7 ${r.year}` : ""}
                  </div>
                </>
              );
              if (!editable) {
                return (
                  <div
                    key={r.id}
                    className="text-left opacity-60 cursor-not-allowed select-none"
                    title="This album is associated with another Press"
                    data-testid={`release-row-locked-${r.id}`}
                  >
                    {cover}
                    {meta}
                  </div>
                );
              }
              return (
                <Link
                  key={r.id}
                  // Task #468 — carry the person id forward so the Album
                  // page's delete handler can land the operator back on
                  // this Person page on success (smart-back convention).
                  href={`/admin/albums/${r.id}?from=person&personId=${person.id}`}
                  className="text-left group"
                  data-testid={`release-row-${r.id}`}
                >
                  {cover}
                  {meta}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <NewAlbumTitleDialog
        open={titleDialogOpen}
        onOpenChange={(next) => {
          if (createAlbum.isPending && !next) return;
          setTitleDialogOpen(next);
        }}
        artistName={person.name}
        busy={createAlbum.isPending}
        onSubmit={(title) => {
          if (createAlbum.isPending) return;
          createAlbum.mutate({ title });
        }}
      />
    </Card>
  );
}

/* ─── Streaming tab (cached Apple Music discography) ──────────────── */

interface DiscographyRow {
  collectionId: string;
  name: string;
  artworkUrl: string | null;
  year: number | null;
  type: string;
}

// Loose response shape from POST /api/admin/people/scrape — we only
// touch the fields we forward into PUT /api/admin/people/:id/discography.
interface ScrapeResponse {
  albums?: Array<{
    collectionId: number;
    name: string;
    artworkUrl: string;
    year: number | null;
    trackCount: number | null;
    type: "album" | "EP";
    appleMusicUrl: string | null;
  }>;
}

function DiscographyPanel({ person }: { person: PersonFull }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery<DiscographyRow[]>({
    queryKey: ["/api/people", person.id, "discography"],
    enabled: !!user?.isAdmin && !!person.id,
  });

  const hasAppleUrl = !!person.appleMusicUrl;

  // Pull = scrape the Apple Music artist page (iTunes Lookup) → full
  // discography replace. The endpoint returns name/photo/bio too, but
  // we intentionally only touch the discography from this button —
  // editing the artist's name + bio is the Overview tab's job. This
  // keeps Pull a single-purpose, idempotent "refresh from Apple Music"
  // action the admin can re-run without surprises.
  const pullMut = useMutation({
    mutationFn: async () => {
      if (!person.appleMusicUrl) {
        throw new Error("Set the Apple Music URL on the Overview tab first.");
      }
      const scrape = await apiRequest("POST", "/api/admin/people/scrape", {
        url: person.appleMusicUrl,
      });
      const data = (await scrape.json()) as ScrapeResponse;
      const albums = Array.isArray(data.albums) ? data.albums : [];
      if (albums.length === 0) {
        throw new Error(
          "Apple Music didn't return any releases for that URL.",
        );
      }
      const items = albums.map((a, idx) => ({
        collectionId: String(a.collectionId),
        name: a.name,
        artworkUrl: a.artworkUrl,
        year: a.year,
        trackCount: a.trackCount,
        type: a.type,
        appleMusicUrl: a.appleMusicUrl,
        spotifyUrl: null,
        position: idx,
      }));
      await apiRequest(
        "PUT",
        `/api/admin/people/${person.id}/discography`,
        { items },
      );
      return albums.length;
    },
    onSuccess: async (count: number) => {
      await qc.invalidateQueries({
        queryKey: ["/api/people", person.id, "discography"],
      });
      toast({
        title: "Discography refreshed",
        description: `Pulled ${count} ${count === 1 ? "release" : "releases"} from Apple Music.`,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't pull discography",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const subline = hasAppleUrl
    ? `${rows.length} ${rows.length === 1 ? "release" : "releases"} cached from Apple Music · streaming links only, not in-app playback`
    : "Set the Apple Music URL on the Overview tab to enable the pull";

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q))
    : rows;

  return (
    <Card
      className="rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-discography"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <MusicIcon className="w-4 h-4 text-slate-400" />
            Streaming
          </h2>
          <p className="text-slate-400 text-[11.5px]">{subline}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {searchOpen && (
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search releases…"
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] placeholder:text-slate-400 focus:outline-none focus:border-slate-300 w-44"
              data-testid="input-search-streaming"
            />
          )}
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
            disabled={rows.length === 0}
            title={searchOpen ? "Close search" : "Search releases"}
            className="px-2 h-8 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center"
            data-testid="button-search-streaming"
          >
            {searchOpen ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => pullMut.mutate()}
            disabled={!hasAppleUrl || pullMut.isPending}
            title={
              hasAppleUrl
                ? "Pull the latest discography from Apple Music"
                : "Set the Apple Music URL on the Overview tab first"
            }
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid="button-pull-discography"
          >
            {pullMut.isPending ? (
              <Spinner className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {pullMut.isPending
              ? "Pulling…"
              : rows.length === 0
                ? "Pull from Apple Music"
                : "Refresh Streaming"}
          </button>
        </div>
      </div>
      <div className="p-6">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Spinner className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-[12.5px] max-w-sm mx-auto">
            {hasAppleUrl
              ? 'No discography pulled yet. Click "Pull from Apple Music" above to import this artist\'s full release list.'
              : "Paste this artist's Apple Music URL on the Overview tab, then come back to pull their discography."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-[12.5px] max-w-sm mx-auto">
            No releases match &ldquo;{query}&rdquo;
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((r) => (
              <div
                key={r.collectionId}
                className="text-left"
                data-testid={`discography-row-${r.collectionId}`}
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200">
                  {r.artworkUrl ? (
                    <img
                      src={r.artworkUrl}
                      alt={r.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="mt-2 text-slate-900 text-[12.5px] font-semibold truncate">
                  {r.name}
                </div>
                <div className="text-slate-400 text-[11px]">
                  {r.type}
                  {r.year ? ` · ${r.year}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}


// ─── Referral summary (Task #78) ───────────────────────────────────────
// Super-admin only — shows who this artist has referred + accrued
// $1/unit credits + recent ledger. Rendered above the Identity panel
// on Overview.
function ReferralSummaryPanel({ kind, id }: { kind: "artist" | "non_profit"; id: string }) {
  const { data, isLoading } = useQuery<{
    pendingCents: number;
    pendingCount: number;
    paidCents: number;
    referredPartners: { id: string; name: string; photoUrl: string | null; paidUnits: number }[];
    recent: { id: string; orderId: string; amountCents: number; currency: string; status: string; createdAt: string; artistName: string | null }[];
    provenance: {
      referredBy: { kind: "artist" | "non_profit"; id: string; name: string } | null;
      invitedBy: { id: string; name: string; email: string; at: string | null } | null;
    };
  }>({
    queryKey: [`/api/admin/partners/${kind}/${id}/referral-summary`],
    retry: false,
  });
  const fmt = (c: number) => formatUsdCents(c);
  if (isLoading) return null;
  if (!data) return null;
  const hasProvenance = !!(data.provenance?.referredBy || data.provenance?.invitedBy);
  // Hide entirely when there's nothing to show — keeps the Overview
  // tab clean for the 99% of artists who aren't acting as referrers.
  // Provenance counts as "something to show" — super-admins want to
  // know who invited/referred a partner even if they haven't earned
  // credits yet.
  if (
    data.referredPartners.length === 0 &&
    data.pendingCents === 0 &&
    data.paidCents === 0 &&
    !hasProvenance
  ) return null;
  return (
    <div data-testid="panel-referral-summary">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Referral credits</h3>
        <span className="text-[11px] uppercase tracking-wide font-semibold text-[#FF5470]">$1 per unit</span>
      </div>
      {hasProvenance && (
        <dl className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12.5px]" data-testid="dl-provenance">
          {data.provenance.referredBy && (
            <div className="rounded-lg bg-slate-50 px-3 py-2" data-testid="row-referred-by">
              <dt className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Referred by</dt>
              <dd className="mt-0.5 text-slate-900 font-medium">
                <Link
                  href={data.provenance.referredBy.kind === "artist"
                    ? `/admin/people/${data.provenance.referredBy.id}`
                    : `/admin/non-profits/${data.provenance.referredBy.id}`}
                  className="hover:text-[var(--brand-blue)] hover:underline"
                >
                  {data.provenance.referredBy.name}
                </Link>
                <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">
                  {data.provenance.referredBy.kind === "artist" ? "Artist" : "Non-profit"}
                </span>
              </dd>
            </div>
          )}
          {data.provenance.invitedBy && (
            <div className="rounded-lg bg-slate-50 px-3 py-2" data-testid="row-invited-by">
              <dt className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Invited by</dt>
              <dd className="mt-0.5 text-slate-900 font-medium">
                {data.provenance.invitedBy.name}
                {data.provenance.invitedBy.at && (
                  <span className="ml-2 text-[10px] text-slate-500">
                    {new Date(data.provenance.invitedBy.at).toLocaleDateString()}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Pending</p>
          <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums" data-testid="text-ref-pending">{fmt(data.pendingCents)}</p>
          <p className="text-[11px] text-slate-500">{data.pendingCount} unit{data.pendingCount === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Paid</p>
          <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums" data-testid="text-ref-paid">{fmt(data.paidCents)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Referred</p>
          <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums" data-testid="text-ref-count">{data.referredPartners.length}</p>
          <p className="text-[11px] text-slate-500">artist{data.referredPartners.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      {data.referredPartners.length > 0 && (
        <ul className="divide-y divide-slate-100" data-testid="list-ref-partners">
          {data.referredPartners.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2" data-testid={`row-ref-partner-${p.id}`}>
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-100" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100" />
              )}
              <Link href={`/admin/people/${p.id}`} className="flex-1 min-w-0 text-[13px] font-medium text-slate-900 truncate hover:text-[var(--brand-blue)] hover:underline">
                {p.name}
              </Link>
              <span className="text-[11px] text-slate-500 tabular-nums">{p.paidUnits} paid</span>
            </li>
          ))}
        </ul>
      )}
      {data.recent.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">Recent credits</p>
          <ul className="divide-y divide-slate-100" data-testid="list-ref-recent">
            {data.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-[12.5px]" data-testid={`row-ref-recent-${r.id}`}>
                <span className="flex-1 min-w-0 text-slate-700 truncate">{r.artistName ?? "(unknown artist)"}</span>
                <span className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                <span className={`text-[10px] uppercase tracking-wide font-semibold ${r.status === "paid" ? "text-[var(--brand-blue)]" : "text-amber-600"}`}>{r.status === "paid" ? "Paid" : "Pending"}</span>
                <span className="text-slate-900 tabular-nums font-semibold w-16 text-right">{formatUsdCents(r.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Exported so AdminNonProfit can reuse the same panel without
// re-implementing the layout.
export { ReferralSummaryPanel };

// ─── Task #190 — MembersPanel ────────────────────────────────────────
// Admin surface for curating a band/duo/orchestra's roster. Only
// rendered when the Person is_group=true (see tabsForPerson above).
//
// Each row is one (band ↔ member Person) relationship with optional
// roles, joined/left years, and a manual display order. Members are
// other Person rows — typing the name in the picker either selects an
// existing row or no-ops; creating a brand-new Person should still
// happen via the People admin (we don't fork a creation flow here to
// keep the data model honest).
type MembersPanelMemberRow = {
  id: string;
  bandId: string;
  memberId: string;
  roles: string[] | null;
  joinedYear: number | null;
  leftYear: number | null;
  displayOrder: number;
  person: {
    id: string;
    name: string;
    photoUrl: string | null;
    isGroup?: boolean;
  } | null;
};

function MembersPanel({ person }: { person: PersonFull }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const membersKey = ["/api/admin/people", person.id, "members"] as const;
  const { data: members = [], isLoading } = useQuery<MembersPanelMemberRow[]>({
    queryKey: membersKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/people/${person.id}/members`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  // Full people list for the picker. We exclude the current band itself
  // and anyone already in the roster client-side.
  const { data: allPeople = [] } = useQuery<
    Array<{ id: string; name: string; photoUrl: string | null; isGroup?: boolean }>
  >({
    queryKey: ["/api/people"],
  });
  const taken = new Set(members.map((m) => m.memberId));
  const candidates = useMemo(
    () =>
      [...allPeople]
        .filter((p) => p.id !== person.id && !taken.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allPeople, person.id, taken],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: membersKey });
    qc.invalidateQueries({ queryKey: ["/api/people", person.id, "members"] });
  };

  const addMutation = useMutation({
    mutationFn: async (memberId: string) =>
      apiRequest("POST", `/api/admin/people/${person.id}/members`, {
        memberId,
        displayOrder: members.length,
      }),
    onSuccess: () => {
      setPickerOpen(false);
      setPickerQuery("");
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't add member", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) =>
      apiRequest("PUT", `/api/admin/band-members/${id}`, patch),
    onSuccess: invalidate,
    onError: (e: any) =>
      toast({ title: "Couldn't save", description: String(e?.message ?? e), variant: "destructive" }),
  });
  // Drag/↑↓ reorder. Optimistically reorders the cached list, then PUTs
  // the new displayOrder for every row whose position changed (cheaper
  // and simpler than diffing — a few extra PUTs are fine here).
  const reorderMutation = useMutation({
    mutationFn: async (nextOrder: MembersPanelMemberRow[]) => {
      await Promise.all(
        nextOrder.map((row, idx) =>
          row.displayOrder === idx
            ? Promise.resolve()
            : apiRequest("PUT", `/api/admin/band-members/${row.id}`, {
                displayOrder: idx,
              }),
        ),
      );
    },
    onSuccess: invalidate,
    onError: (e: any) => {
      invalidate();
      toast({
        title: "Couldn't reorder",
        description: String(e?.message ?? e),
        variant: "destructive",
      });
    },
  });
  const swap = (from: number, to: number) => {
    if (to < 0 || to >= members.length || from === to) return;
    const next = [...members];
    [next[from], next[to]] = [next[to], next[from]];
    qc.setQueryData<MembersPanelMemberRow[]>(
      membersKey,
      next.map((r, idx) => ({ ...r, displayOrder: idx })),
    );
    reorderMutation.mutate(next);
  };
  const removeMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/band-members/${id}`),
    onSuccess: invalidate,
    onError: (e: any) =>
      toast({ title: "Couldn't remove", description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm" data-testid="panel-members">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Members</h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            People in {person.name}. Use the ↑/↓ buttons on each row to reorder.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 active:bg-slate-900"
          data-testid="button-add-member"
        >
          {pickerOpen ? "Cancel" : "Add member"}
        </button>
      </div>
      {pickerOpen && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <input
            type="text"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Search people…"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-[13px]"
            data-testid="input-member-search"
            autoFocus
          />
          <div className="mt-3 max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
            {candidates
              .filter((c: { id: string; name: string; photoUrl: string | null; isGroup?: boolean }) =>
                pickerQuery.trim() === ""
                  ? true
                  : c.name.toLowerCase().includes(pickerQuery.trim().toLowerCase()),
              )
              .slice(0, 50)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addMutation.mutate(c.id)}
                  disabled={addMutation.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left disabled:opacity-50"
                  data-testid={`option-add-member-${c.id}`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                    {c.photoUrl && (
                      <img src={c.photoUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="text-[13px] text-slate-900 flex-1 truncate">{c.name}</span>
                  {c.isGroup && (
                    <span className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-400">
                      Group
                    </span>
                  )}
                </button>
              ))}
            {candidates.length === 0 && (
              <p className="px-3 py-3 text-[12.5px] text-slate-500">
                Everyone's already on this roster. Create a new person from the People admin first.
              </p>
            )}
          </div>
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {isLoading && (
          <p className="px-5 py-6 text-[13px] text-slate-500">Loading…</p>
        )}
        {!isLoading && members.length === 0 && (
          <p className="px-5 py-6 text-[13px] text-slate-500" data-testid="empty-members">
            No members yet. Add the first lineup above.
          </p>
        )}
        {members.map((m, i) => (
          <MemberRow
            key={m.id}
            row={m}
            index={i}
            total={members.length}
            onSave={(patch) => updateMutation.mutate({ id: m.id, patch })}
            onMoveUp={() => swap(i, i - 1)}
            onMoveDown={() => swap(i, i + 1)}
            reordering={reorderMutation.isPending}
            onRemove={() => {
              if (window.confirm(`Remove ${m.person?.name ?? "this person"} from ${person.name}?`)) {
                removeMutation.mutate(m.id);
              }
            }}
            saving={updateMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function MemberRow({
  row,
  index,
  total,
  onSave,
  onMoveUp,
  onMoveDown,
  reordering,
  onRemove,
  saving,
}: {
  row: MembersPanelMemberRow;
  index: number;
  total: number;
  onSave: (patch: any) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reordering: boolean;
  onRemove: () => void;
  saving: boolean;
}) {
  // Local draft so the admin can edit roles/years without firing
  // a PUT on every keystroke. Save reconciles via the patch.
  // Display order is no longer edited here — it's driven by the
  // ↑/↓ buttons, which fire their own PUTs from the parent panel.
  const [rolesText, setRolesText] = useState((row.roles ?? []).join(", "));
  const [joinedYear, setJoinedYear] = useState(
    row.joinedYear === null ? "" : String(row.joinedYear),
  );
  const [leftYear, setLeftYear] = useState(
    row.leftYear === null ? "" : String(row.leftYear),
  );
  const dirty =
    rolesText !== (row.roles ?? []).join(", ") ||
    joinedYear !== (row.joinedYear === null ? "" : String(row.joinedYear)) ||
    leftYear !== (row.leftYear === null ? "" : String(row.leftYear));
  const save = () => {
    onSave({
      roles: rolesText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      joinedYear: joinedYear.trim() === "" ? null : Number(joinedYear),
      leftYear: leftYear.trim() === "" ? null : Number(leftYear),
    });
  };
  const isFormer = row.leftYear !== null;
  return (
    <div
      className="group px-5 py-4 grid grid-cols-12 gap-3 items-center"
      data-testid={`row-band-member-${row.memberId}`}
    >
      <div className="col-span-3 flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
          {row.person?.photoUrl && (
            <img src={row.person.photoUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-slate-900 truncate">
            {row.person?.name ?? "(unknown)"}
          </p>
          {isFormer && (
            <p className="text-[10.5px] uppercase tracking-wide font-semibold text-amber-600">
              Former
            </p>
          )}
        </div>
      </div>
      <div className="col-span-4">
        <label className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-400">
          Roles
        </label>
        <input
          type="text"
          value={rolesText}
          onChange={(e) => setRolesText(e.target.value)}
          placeholder="lead vocals, guitar"
          className="w-full mt-1 px-2 py-1.5 rounded-md border border-slate-200 text-[12.5px]"
          data-testid={`input-member-roles-${row.memberId}`}
        />
      </div>
      <div className="col-span-1">
        <label className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-400">
          Joined
        </label>
        <input
          type="number"
          value={joinedYear}
          onChange={(e) => setJoinedYear(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md border border-slate-200 text-[12.5px]"
          data-testid={`input-member-joined-${row.memberId}`}
        />
      </div>
      <div className="col-span-1">
        <label className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-400">
          Left
        </label>
        <input
          type="number"
          value={leftYear}
          onChange={(e) => setLeftYear(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md border border-slate-200 text-[12.5px]"
          data-testid={`input-member-left-${row.memberId}`}
        />
      </div>
      <div className="col-span-1">
        <label className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-400">
          Order
        </label>
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={reordering || index === 0}
            className="flex-1 px-1.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 inline-flex items-center justify-center"
            aria-label="Move up"
            data-testid={`button-member-up-${row.memberId}`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={reordering || index === total - 1}
            className="flex-1 px-1.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 inline-flex items-center justify-center"
            aria-label="Move down"
            data-testid={`button-member-down-${row.memberId}`}
          >
            ↓
          </button>
        </div>
      </div>
      <div className="col-span-2 flex items-center gap-2 justify-end">
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50"
            data-testid={`button-save-member-${row.memberId}`}
          >
            Save
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
          data-testid={`button-remove-member-${row.memberId}`}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
