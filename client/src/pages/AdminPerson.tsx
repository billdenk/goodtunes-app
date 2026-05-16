import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Upload,
  Loader2,
  ImageIcon,
  User as UserIcon,
  Globe,
  Music as MusicIcon,
} from "lucide-react";
import { SiApplemusic, SiSpotify, SiInstagram, SiTiktok, SiX, SiBluesky, SiFacebook } from "react-icons/si";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin · Single person. Wrapped in AdminFrame so it shares the top bar +
 * left entity sidebar with /admin/people.
 *
 * Tabs:
 *   Overview · Photo · Cover · Streaming — real read + drag-drop image upload
 *   Discography — small jump-to-classic card (full discography editor is
 *   the next phase; the classic admin's PersonEditor handles iTunes pulls
 *   and per-row toggles today).
 */
interface PersonFull {
  id: string;
  name: string;
  photoUrl: string | null;
  coverUrl: string | null;
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
}

interface LabelLite {
  id: string;
  name: string;
}

type Tab = "overview" | "photo" | "cover" | "streaming" | "discography";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "photo", label: "Photo" },
  { key: "cover", label: "Cover" },
  { key: "streaming", label: "Streaming" },
  { key: "discography", label: "Discography" },
];

export function AdminPerson() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/people/:id");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("overview");
  const personId = params?.id ?? "";

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

  const labelName =
    person?.labelId
      ? labels.find((l) => l.id === person.labelId)?.name ?? null
      : null;

  const openInClassicAdmin = () => {
    try {
      localStorage.setItem("gt:admin:entity", "people");
      localStorage.setItem("gt:admin:focus-person", personId);
    } catch {}
    navigate("/admin");
  };

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="people">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
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
          <Link
            href="/admin/people"
            className="text-[#319ED8] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-people"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to people
          </Link>
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="people">
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link
            href="/admin/people"
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-people"
          >
            People
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {person.name}
          </span>
        </div>

        {/* HEADER */}
        <div className="flex items-start gap-5">
          <PersonAvatar
            name={person.name}
            photoUrl={person.photoUrl}
            size={96}
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
          <button
            onClick={openInClassicAdmin}
            className="px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5 flex-shrink-0"
            data-testid="button-open-classic-admin"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Open in classic admin
          </button>
        </div>

        {/* TABS */}
        <div
          className="flex items-center gap-5 border-b border-slate-200 overflow-x-auto"
          data-testid="tabs-admin-person"
        >
          {TABS.map((t) => (
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
                <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[#319ED8] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        {tab === "overview" && (
          <OverviewPanel person={person} labels={labels} />
        )}
        {tab === "photo" && <ImageUploadPanel person={person} field="photo" />}
        {tab === "cover" && <ImageUploadPanel person={person} field="cover" />}
        {tab === "streaming" && (
          <StreamingPanel person={person} />
        )}
        {tab === "discography" && (
          <DiscographyPanel personId={person.id} onEdit={openInClassicAdmin} />
        )}
      </div>
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
      className="rounded-full overflow-hidden bg-[#319ED8] ring-1 ring-slate-200 shadow-sm flex-shrink-0"
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-2">
        <EditablePanel
          title="Identity"
          testId="panel-overview-identity"
          endpoint={endpoint}
          values={{
            name: person.name,
            bio: person.bio,
            labelId: person.labelId ?? "",
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
              key: "bio",
              label: "Bio",
              type: "textarea",
              placeholder: "A short paragraph about the artist.",
            },
          ]}
        />
      </div>
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
  const successLabel = isCover ? "Cover updated" : "Photo updated";
  const errorLabel = isCover
    ? "Couldn't update the cover"
    : "Couldn't update the photo";
  const ratioClass = isCover ? "aspect-[3/1]" : "aspect-square";
  const shapeClass = isCover ? "rounded-xl" : "rounded-full";
  const helperCopy = isCover
    ? "Recommended: wide landscape, at least 2400×800 px. Used as the hero banner on the fan-side artist page."
    : "Recommended: square, at least 1000×1000 px. Used as the avatar everywhere — credits sheet, search, top of the artist page.";

  const mut = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      const patch = isCover ? { coverUrl: url } : { photoUrl: url };
      await apiRequest("PUT", `/api/admin/people/${person.id}`, patch);
      return url;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/people", person.id] });
      await qc.invalidateQueries({ queryKey: ["/api/people"] });
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
      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6"
        data-testid={`panel-${field}-current`}
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Current {field}
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
            <div className="w-full h-full bg-[#319ED8] flex items-center justify-center">
              <span className="text-white text-5xl font-bold">
                {(person.name.trim().charAt(0) || "?").toUpperCase()}
              </span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-[#319ED8] animate-spin" />
              <span className="text-[12px] text-slate-700 font-semibold">
                Uploading…
              </span>
            </div>
          )}
        </div>
      </section>

      <section
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 flex flex-col"
        data-testid={`panel-${field}-upload`}
      >
        <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-3">
          Replace {field}
        </div>
        <button
          type="button"
          onClick={() => !busy && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (busy) return;
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          data-testid={`dropzone-${field}`}
          className={[
            "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
            dragging
              ? "border-[#319ED8] bg-[#319ED8]/5"
              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
            busy && "opacity-60 cursor-not-allowed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Upload
            className={[
              "w-7 h-7",
              dragging ? "text-[#319ED8]" : "text-slate-400",
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
      </section>
    </div>
  );
}

/* ─── Streaming tab ───────────────────────────────────────────────── */

function StreamingPanel({ person }: { person: PersonFull }) {
  return (
    <div className="max-w-2xl space-y-3">
      <EditablePanel
        title="Streaming services"
        testId="panel-streaming"
        endpoint={`/api/admin/people/${person.id}`}
        values={{
          appleMusicUrl: person.appleMusicUrl,
          spotifyUrl: person.spotifyUrl,
        }}
        invalidate={[["/api/people", person.id], ["/api/people"]]}
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
  );
}

/* ─── Discography tab (placeholder for now) ───────────────────────── */

interface DiscographyRow {
  collectionId: string;
  name: string;
  artworkUrl: string | null;
  year: number | null;
  type: string;
}

function DiscographyPanel({
  personId,
  onEdit,
}: {
  personId: string;
  onEdit: () => void;
}) {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useQuery<DiscographyRow[]>({
    queryKey: ["/api/people", personId, "discography"],
    enabled: !!user?.isAdmin && !!personId,
  });

  return (
    <section
      className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden"
      data-testid="panel-discography"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <MusicIcon className="w-4 h-4 text-slate-400" />
            Discography
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            {rows.length} {rows.length === 1 ? "release" : "releases"} cached
            from Apple Music · pull + edit lives in the classic editor
          </p>
        </div>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
          data-testid="button-edit-discography"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Edit in classic
        </button>
      </div>
      <div className="p-6">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-[12.5px]">
            No discography pulled yet. Paste an Apple Music artist URL in the
            classic editor's "Pull from Apple Music" panel to import.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {rows.map((r) => (
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
    </section>
  );
}

