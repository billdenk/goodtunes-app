import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  ImageIcon,
  User as UserIcon,
  Globe,
  Music as MusicIcon,
  RefreshCw,
  Pencil,
  Trash2,
  Lock,
  LockOpen,
  Disc3,
  Guitar,
  Search,
  X,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiApplemusic, SiSpotify, SiInstagram, SiTiktok, SiX, SiBluesky, SiFacebook } from "react-icons/si";
import { useAuth } from "@/hooks/useAuth";
import { useSmartBackCrumb } from "@/hooks/useSmartBackCrumb";
import { AdminFrame } from "@/components/admin/AdminFrame";
import {
  PersonPreviewCard,
  type PersonPreviewAlbum,
} from "@/components/admin/previews/PersonPreviewCard";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { PayoutAccountPanel } from "@/components/admin/PayoutAccountPanel";
import { PartnerPermissionsPanel } from "@/components/admin/PartnerPermissionsPanel";
import { InvitedByPressPanel } from "@/components/admin/InvitedByPressPanel";
import { apiRequest, getAuthToken, queryClient } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
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
  // Task #199 — if this artist was invited by a specific press, their
  // Sell-panel Presses surface is hard-locked to that press until
  // their first run ships. Super-admin can clear/switch via Identity.
  invitedByPressId: string | null;
}

interface LabelLite {
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
type Tab = "overview" | "cover" | "members" | "releases" | "streaming" | "gear" | "payouts" | "permissions";
const BASE_TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "cover", label: "Cover" },
  { key: "releases", label: "GoodTunes\u00AE Releases" },
  { key: "streaming", label: "Streaming" },
  { key: "gear", label: "Gear" },
  { key: "payouts", label: "Payouts" },
  { key: "permissions", label: "Permissions" },
];
// Task #190 — Members tab is only relevant when this Person represents
// a band/duo/orchestra (is_group=true). Splice it in next to Overview so
// the band-curation surfaces sit together.
function tabsForPerson(person: PersonFull): { key: Tab; label: string }[] {
  if (!person.isGroup) return BASE_TABS;
  const out = [...BASE_TABS];
  const after = out.findIndex((t) => t.key === "cover");
  const insertAt = after === -1 ? 1 : after + 1;
  out.splice(insertAt, 0, { key: "members", label: "Members" });
  return out;
}

// Track row shape from `/api/people/:id/profile` — used to derive the
// dedup'd instrument list for the Gear tab.
interface PersonProfileTrack {
  songId: string;
  songTitle: string;
  albumTitle: string;
  albumArtwork: string;
  instrumentId: string | null;
  instrumentName: string | null;
  instrumentShortCategory: string | null;
  instrumentCategory: string | null;
  instrumentPhotoUrl: string | null;
  role: string | null;
}
interface PersonProfile {
  person: PersonFull;
  tracks: PersonProfileTrack[];
}

export function AdminPerson() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/people/:id");
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  // Photo editor lives as a modal hanging off the header avatar (same
  // pencil-on-thumbnail pattern as AdminAlbum's Artwork editor). The
  // dedicated Photo tab was removed; Cover is still its own tab because
  // the wide background banner needs more real estate.
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const personId = params?.id ?? "";
  const backCrumb = useSmartBackCrumb();

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

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  const { data: person, isLoading, error } = useQuery<PersonFull>({
    queryKey: ["/api/people", personId],
    enabled: !!user?.isAdmin && !!personId,
  });
  const { data: labels = [] } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });
  // Albums feed for the right-pane preview card. Cheap and already
  // cached by the admin sidebar's count query — TanStack dedupes the
  // request so this is effectively free.
  const { data: allAlbums = [] } = useQuery<PersonPreviewAlbum[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });

  const labelName =
    person?.labelId
      ? labels.find((l) => l.id === person.labelId)?.name ?? null
      : null;

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
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          {backCrumb ? (
            <Link
              href={backCrumb.href}
              className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors truncate max-w-[420px]"
              data-testid={backCrumb.testId}
            >
              {backCrumb.name}
            </Link>
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

        {/* HEADER */}
        <div className="flex items-start gap-5">
          {/* Avatar doubles as the photo editor trigger — same hover-scrim
              + pencil-chip pattern as AdminAlbum's cover thumbnail. */}
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
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                <Pencil className="w-4 h-4" />
              </span>
            </span>
          </button>
          <PhotoEditorDialog
            person={person}
            open={photoEditorOpen}
            onOpenChange={setPhotoEditorOpen}
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              {labelName ? `Signed to ${labelName}` : "Independent"}
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
          className="sticky top-0 z-20 bg-white flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-person"
        >
          <div className="flex items-center gap-5 overflow-x-auto">
            {tabsForPerson(person).map((t) => (
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
                  <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
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
        </div>

        {/* TAB CONTENT */}
        {tab === "overview" && (
          <OverviewPanel person={person} labels={labels} />
        )}
        {tab === "cover" && <ImageUploadPanel person={person} field="cover" />}
        {tab === "members" && person.isGroup && <MembersPanel person={person} />}
        {tab === "releases" && (
          <ReleasesPanel person={person} allAlbums={allAlbums} />
        )}
        {tab === "streaming" && <DiscographyPanel person={person} />}
        {tab === "gear" && <GearPanel person={person} />}
        {tab === "payouts" && (
          <PayoutAccountPanel
            ownerKind="person"
            ownerId={person.id}
            ownerName={person.name}
            ownerEmail={(person as any).email ?? null}
          />
        )}
        {tab === "permissions" && (
          <PartnerPermissionsPanel scopeKind="artist" scopeId={person.id} scopeName={person.name} />
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
      className="rounded-full overflow-hidden bg-[var(--brand-blue)] ring-1 ring-slate-200 shadow-sm flex-shrink-0"
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
            {(name.trim().charAt(0) || "?").toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Overview tab ─────────────────────────────────────────────────── */

function OverviewPanel({
  person,
  labels,
}: {
  person: PersonFull;
  labels: LabelLite[];
}) {
  // Streaming services (Apple Music / Spotify) now live inline at the
  // bottom of the Overview tab — they used to be their own tab, but
  // there are only two fields, which didn't justify a separate tab.
  const invalidate: (readonly unknown[])[] = [
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
      <InvitedByPressPanel kind="people" id={person.id} currentPressId={person.invitedByPressId} />
      <EditablePanel
        title="Identity"
        testId="panel-overview-identity"
        endpoint={endpoint}
        values={{
          name: person.name,
          bio: person.bio,
          labelId: person.labelId ?? "",
          // Task #190 — group kind. Empty = solo artist; non-empty value
          // flips `isGroup` true server-side and unlocks the Members tab
          // + the per-album Lineup panel.
          groupKind: person.groupKind ?? "",
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
            key: "groupKind",
            label: "Type",
            type: "select",
            options: groupKindOptions,
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

async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

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
                {(person.name.trim().charAt(0) || "?").toUpperCase()}
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
}: {
  person: PersonFull;
  allAlbums: PersonPreviewAlbum[];
}) {
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
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/admin/albums/${r.id}`}
                className="text-left group"
                data-testid={`release-row-${r.id}`}
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 group-hover:ring-slate-300 transition-shadow">
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
                </div>
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
              </Link>
            ))}
          </div>
        )}
      </div>
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


/* ─── Gear tab — read-and-pivot view of instruments credited ──────── */

function GearPanel({ person }: { person: PersonFull }) {
  // Reuses the existing `/api/people/:id/profile` endpoint. We dedupe
  // tracks by instrumentId here so the same D-28 used on three tracks
  // shows once with a trackCount of 3. Role-only credits (instrumentId
  // null) are skipped — they aren't gear, they're roles.
  const { data, isLoading, error } = useQuery<PersonProfile>({
    queryKey: ["/api/people", person.id, "profile"],
    enabled: !!person.id,
  });

  if (isLoading) {
    return (
      <div className="py-10 flex items-center justify-center" data-testid="gear-panel-loading">
        <Spinner className="w-5 h-5 text-[var(--brand-blue)] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700"
        data-testid="gear-panel-error"
      >
        Couldn't load this person's gear credits. Try refreshing.
      </div>
    );
  }

  type GearRow = {
    instrumentId: string;
    instrumentName: string;
    instrumentCategory: string | null;
    instrumentShortCategory: string | null;
    instrumentPhotoUrl: string | null;
    trackCount: number;
  };
  const tracks = data?.tracks ?? [];
  const byId = new Map<string, GearRow>();
  for (const t of tracks) {
    if (!t.instrumentId || !t.instrumentName) continue;
    const existing = byId.get(t.instrumentId);
    if (existing) {
      existing.trackCount += 1;
    } else {
      byId.set(t.instrumentId, {
        instrumentId: t.instrumentId,
        instrumentName: t.instrumentName,
        instrumentCategory: t.instrumentCategory,
        instrumentShortCategory: t.instrumentShortCategory,
        instrumentPhotoUrl: t.instrumentPhotoUrl,
        trackCount: 1,
      });
    }
  }
  const rows = Array.from(byId.values()).sort((a, b) =>
    a.instrumentName.localeCompare(b.instrumentName),
  );

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center"
        data-testid="gear-panel-empty"
      >
        <Guitar className="w-7 h-7 text-slate-300 mx-auto mb-2" />
        <p className="text-[13.5px] text-slate-500">
          No instrument credits for this person yet.
        </p>
        <p className="text-[11.5px] text-slate-400 mt-1">
          Add a performer credit with an attached piece of gear on any album's Tracks tab.
        </p>
      </div>
    );
  }

  return (
    <ul
      className="rounded-lg border bg-white divide-y divide-slate-100"
      data-testid="list-person-gear"
    >
      {rows.map((r) => (
        <li
          key={r.instrumentId}
          className="group hover:bg-slate-50/50 transition-colors"
          data-testid={`row-instrument-${r.instrumentId}`}
        >
          <Link
            href={`/admin/instruments/${r.instrumentId}?from=person&personId=${person.id}`}
            className="flex items-center gap-4 px-6 py-3.5"
            data-testid={`link-instrument-${r.instrumentId}`}
          >
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
              {r.instrumentPhotoUrl ? (
                <img
                  src={r.instrumentPhotoUrl}
                  alt={r.instrumentName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Guitar className="w-5 h-5 text-slate-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-slate-900 truncate group-hover:text-[var(--brand-blue)] group-hover:underline underline-offset-2 transition-colors">
                {r.instrumentName}
              </div>
              <div className="text-[11.5px] text-slate-400 truncate">
                {r.instrumentShortCategory || r.instrumentCategory || "Gear"} ·{" "}
                {r.trackCount} {r.trackCount === 1 ? "track" : "tracks"}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
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
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="panel-referral-summary">
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
                <span className="text-slate-900 tabular-nums font-semibold w-16 text-right">${(r.amountCents / 100).toFixed(2)}</span>
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
      className="px-5 py-4 grid grid-cols-12 gap-3 items-center"
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
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          data-testid={`button-remove-member-${row.memberId}`}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
