import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gift, Loader2, Plus, Search, Upload, X } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, getAuthToken, queryClient } from "@/lib/queryClient";

// Task #844 — Super-admin surface for operator-created custom ("Gift of
// Hope") add-ons. Each add-on is owned by a non-profit, attached to one
// or more artists (people), and surfaces as a single optional checkbox in
// the Buy sheet of every album by an attached artist. Reads need any
// admin; writes are super-admin only (server enforces it regardless).

type AddonArtist = {
  personId: string;
  name: string;
  photoUrl: string | null;
};

export type CustomAddon = {
  id: string;
  organizationId: string;
  orgName: string;
  orgLogoUrl: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  fulfiller: string | null;
  active: boolean;
  appliesToAllArtists: boolean;
  position: number;
  artists: AddonArtist[];
};

type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type PersonLite = { id: string; name: string; photoUrl: string | null };

function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (body?.message) return String(body.message);
    } catch {
      /* fall through */
    }
    return m[1];
  }
  return raw || "Something went wrong.";
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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

const ADDONS_KEY = ["/api/admin/custom-addons"] as const;

export function AdminCustomAddons() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CustomAddon[]>({
    queryKey: ADDONS_KEY,
    enabled: !!user?.isAdmin,
  });

  const [editing, setEditing] = useState<CustomAddon | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.orgName.toLowerCase().includes(q) ||
        a.artists.some((p) => p.name.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  if (authLoading) {
    return (
      <AdminFrame active="custom-addons">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <AdminFrame active="custom-addons">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="custom-addons">
      <div className="space-y-5" data-testid="page-admin-custom-addons">
        <AdminPageHeader
          title="Custom add-ons"
          subtitle="Non-profit-owned products offered as an optional checkbox in the Buy sheet of attached artists (e.g. the Nightbirde Foundation’s Gift of Hope)."
          actions={
            <>
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search add-ons"
                  className="w-44 text-sm bg-transparent outline-none placeholder:text-slate-400"
                  data-testid="input-search-custom-addons"
                />
              </div>
              <AddEntityButton
                label="Add"
                onClick={() => setAddOpen(true)}
                testId="button-open-add-custom-addon"
              />
            </>
          }
        />

        {isLoading ? (
          <div className="py-20 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load add-ons"
            testId="custom-addons-error"
          />
        ) : filtered.length === 0 ? (
          <div
            className="py-16 flex flex-col items-center justify-center text-center"
            data-testid="empty-custom-addons"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <Gift className="w-6 h-6" />
            </div>
            <p className="text-slate-700 text-sm font-semibold">
              {search.trim() ? "No matches" : "No custom add-ons yet"}
            </p>
            <p className="text-slate-400 text-xs mt-1 max-w-xs">
              {search.trim()
                ? "Try a different name, non-profit, or artist."
                : "Click Add to build a non-profit-owned add-on and attach it to an artist."}
            </p>
          </div>
        ) : (
          <div
            className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
            data-testid="list-custom-addons"
          >
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setEditing(a)}
                className="group w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                data-testid={`row-custom-addon-${a.id}`}
              >
                <div className="w-11 h-11 rounded-md overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" />
                  ) : (
                    <Gift className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-slate-900 text-sm font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
                      data-testid={`text-custom-addon-name-${a.id}`}
                    >
                      {a.name}
                    </span>
                    {!a.active && (
                      <span className="text-xs uppercase tracking-wide font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-xs truncate">
                    {a.orgName}
                    {a.appliesToAllArtists
                      ? " · all artists"
                      : a.artists.length > 0
                        ? ` · ${a.artists.map((p) => p.name).join(", ")}`
                        : " · no artists yet"}
                  </div>
                </div>
                <div className="text-slate-700 text-sm font-semibold flex-shrink-0">
                  {formatPrice(a.priceCents)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <AddonDialog
        mode="create"
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <AddonDialog
        mode="edit"
        addon={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </AdminFrame>
  );
}

/* ─── Create / edit dialog ─────────────────────────────────────────── */

export function AddonDialog({
  mode,
  addon,
  open,
  onOpenChange,
  inline = false,
  albumArtist = null,
  onCreated,
}: {
  mode: "create" | "edit";
  addon?: CustomAddon | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  // Task #987 — inline-from-Sell-page context. When inline, the scope
  // picker offers "Just {artist}" vs "All artists"; on create with the
  // artist scope we attach the album's primary artist after the POST so
  // the operator doesn't have to open the dedicated page.
  inline?: boolean;
  albumArtist?: { personId: string | null; name: string } | null;
  onCreated?: () => void;
}) {
  const { toast } = useToast();
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [fulfiller, setFulfiller] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [position, setPosition] = useState("0");
  // "specific" = attach to particular artists (the join table); "all" =
  // applies to every eligible album regardless of attachments.
  const [scope, setScope] = useState<"specific" | "all">("specific");
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // When opened inline from an album with no primary artist linked, the
  // "Just this artist" scope has nothing to attach to, so force/offer
  // "All artists" only.
  const canScopeToArtist = !inline || !!albumArtist?.personId;

  // Re-seed the form whenever the target add-on (or dialog open) changes.
  useEffect(() => {
    if (!open) return;
    if (isEdit && addon) {
      setName(addon.name);
      setOrganizationId(addon.organizationId);
      setPriceDollars((addon.priceCents / 100).toFixed(2));
      setFulfiller(addon.fulfiller ?? "");
      setDescription(addon.description ?? "");
      setImageUrl(addon.imageUrl);
      setActive(addon.active);
      setPosition(String(addon.position ?? 0));
      setScope(addon.appliesToAllArtists ? "all" : "specific");
    } else if (!isEdit) {
      setName("");
      setOrganizationId("");
      setPriceDollars("");
      setFulfiller("");
      setDescription("");
      setImageUrl(null);
      setActive(true);
      setPosition("0");
      setScope(inline && !albumArtist?.personId ? "all" : "specific");
    }
    setFormError(null);
  }, [open, isEdit, addon, inline, albumArtist?.personId]);

  const { data: npos = [] } = useQuery<NonProfit[]>({
    queryKey: ["/api/non-profits"],
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const priceCents = Math.round(parseFloat(priceDollars) * 100);
      const positionNum = Math.round(parseFloat(position));
      const appliesToAllArtists = scope === "all";
      const payload = {
        name: name.trim(),
        organizationId,
        priceCents,
        fulfiller: fulfiller.trim() || null,
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        position: Number.isFinite(positionNum) ? positionNum : 0,
        appliesToAllArtists,
        ...(isEdit ? { active } : {}),
      };
      if (isEdit && addon) {
        await apiRequest("PUT", `/api/admin/custom-addons/${addon.id}`, payload);
        return addon.id;
      }
      const res = await apiRequest("POST", "/api/admin/custom-addons", payload);
      const j = (await res.json()) as { id: string };
      // Inline create scoped to this artist: attach the album's primary
      // artist right away so the add-on surfaces on its Buy sheet without
      // a trip to the dedicated page. (All-artists scope needs no attach.)
      if (!appliesToAllArtists && albumArtist?.personId) {
        await apiRequest("POST", `/api/admin/custom-addons/${j.id}/artists`, {
          personId: albumArtist.personId,
        });
      }
      return j.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADDONS_KEY });
      toast({ title: isEdit ? "Add-on saved" : "Add-on created" });
      if (!isEdit) onCreated?.();
      onOpenChange(false);
    },
    onError: (err) => setFormError(humanizeApiError(err)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) return setFormError("Give the add-on a name.");
    if (!organizationId) return setFormError("Pick the owning non-profit.");
    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      return setFormError("Enter a price of $0.00 or more.");
    }
    save.mutate();
  };

  const onPickFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast({ title: "That's not an image", description: "Use a JPG, PNG, or WebP file.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setImageUrl(url);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent
        className="max-w-lg bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4 max-h-[90vh] overflow-y-auto"
        data-testid={`dialog-${mode}-custom-addon`}
      >
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-base font-semibold text-slate-900">
            {isEdit ? "Edit add-on" : "Add a custom add-on"}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 leading-relaxed">
            A non-profit-owned product offered as a single optional checkbox in
            the Buy sheet of every attached artist's albums.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 bg-slate-50 ring-1 ring-slate-200"
              data-testid="button-upload-custom-addon-image"
              aria-label="Upload image"
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Upload className="w-6 h-6 text-slate-300" />
              )}
              {uploading && (
                <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              data-testid="input-custom-addon-image-file"
            />
            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-xs font-semibold text-slate-600">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gift of Hope"
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="input-custom-addon-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Non-profit</label>
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full h-10 px-2 rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="select-custom-addon-npo"
              >
                <option value="">Select…</option>
                {npos
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">Price (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="25.00"
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="input-custom-addon-price"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Who sees it</label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Add-on scope">
              <button
                type="button"
                role="radio"
                aria-checked={scope === "specific"}
                disabled={!canScopeToArtist}
                onClick={() => setScope("specific")}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  scope === "specific"
                    ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 text-slate-900"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                } ${!canScopeToArtist ? "opacity-50 cursor-not-allowed" : ""}`}
                data-testid="button-custom-addon-scope-specific"
              >
                <span className="block font-semibold">
                  {inline && albumArtist?.name ? `Just ${albumArtist.name}` : "Specific artists"}
                </span>
                <span className="block text-xs text-slate-400">
                  {inline
                    ? "Only this artist's albums"
                    : "Pick artists below after saving"}
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "all"}
                onClick={() => setScope("all")}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  scope === "all"
                    ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 text-slate-900"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                }`}
                data-testid="button-custom-addon-scope-all"
              >
                <span className="block font-semibold">All artists</span>
                <span className="block text-xs text-slate-400">Every eligible album</span>
              </button>
            </div>
            {!canScopeToArtist && (
              <p className="text-xs text-slate-400">
                Link a primary artist to this album to scope the add-on to just them.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">
              Fulfiller <span className="text-slate-400 font-normal">(who ships / handles it)</span>
            </label>
            <input
              type="text"
              value={fulfiller}
              onChange={(e) => setFulfiller(e.target.value)}
              placeholder="e.g. The Nightbirde Foundation"
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="input-custom-addon-fulfiller"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">
              Display order <span className="text-slate-400 font-normal">(lower shows first in the Buy sheet)</span>
            </label>
            <input
              type="number"
              step="1"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="0"
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="input-custom-addon-position"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Shown to fans under the checkbox."
              className="w-full px-3 py-2 rounded-md border border-slate-300 bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 resize-none"
              data-testid="input-custom-addon-description"
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 accent-[var(--brand-blue)]"
                data-testid="checkbox-custom-addon-active"
              />
              Active — show in the Buy sheet
            </label>
          )}

          {formError && (
            <p className="text-xs text-red-600" data-testid="text-custom-addon-error">
              {formError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
              data-testid="button-custom-addon-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={save.isPending || uploading}
              size="sm"
              className="text-xs font-semibold"
              data-testid="button-custom-addon-save"
            >
              {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>

        {isEdit && addon && scope === "specific" && <AddonArtists addon={addon} />}
        {inline && (
          <p className="text-xs text-slate-400 pt-1" data-testid="text-custom-addon-inline-note">
            Manage every custom add-on — including attaching more artists — on the{" "}
            <a
              href="/admin/custom-addons"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--brand-blue)] hover:underline underline-offset-2"
            >
              Custom add-ons
            </a>{" "}
            page.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Attached-artist manager (edit only) ──────────────────────────── */

function AddonArtists({ addon }: { addon: CustomAddon }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const { data: people = [] } = useQuery<PersonLite[]>({
    queryKey: ["/api/people"],
    queryFn: async () => {
      const r = await fetch(`/api/people`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: adding,
  });

  const attachedIds = useMemo(
    () => new Set(addon.artists.map((a) => a.personId)),
    [addon.artists],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as PersonLite[];
    return people
      .filter((p) => !attachedIds.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [people, query, attachedIds]);

  const attach = useMutation({
    mutationFn: async (personId: string) => {
      await apiRequest("POST", `/api/admin/custom-addons/${addon.id}/artists`, { personId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADDONS_KEY });
      setQuery("");
      setAdding(false);
    },
    onError: (err) =>
      toast({ title: "Couldn't attach artist", description: humanizeApiError(err), variant: "destructive" }),
  });

  const detach = useMutation({
    mutationFn: async (personId: string) => {
      await apiRequest("DELETE", `/api/admin/custom-addons/${addon.id}/artists/${personId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDONS_KEY }),
    onError: (err) =>
      toast({ title: "Couldn't remove artist", description: humanizeApiError(err), variant: "destructive" }),
  });

  return (
    <div className="border-t border-slate-200 pt-4 space-y-3" data-testid="panel-custom-addon-artists">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Attached artists</h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs font-semibold text-[var(--brand-blue)] inline-flex items-center gap-1 hover:underline underline-offset-2"
          data-testid="button-add-custom-addon-artist"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {adding && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
              data-testid="input-search-custom-addon-artist"
            />
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAdding(false);
              }}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {matches.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => attach.mutate(p.id)}
                  disabled={attach.isPending}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                  data-testid={`option-custom-addon-artist-${p.id}`}
                >
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-100" />
                  )}
                  <span className="text-sm text-slate-800">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {addon.artists.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="text-custom-addon-no-artists">
          No artists attached yet — fans won't see this add-on until you add one.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {addon.artists.map((p) => (
            <li
              key={p.personId}
              className="group flex items-center gap-3 py-2"
              data-testid={`row-custom-addon-artist-${p.personId}`}
            >
              {p.photoUrl ? (
                <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-100" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100" />
              )}
              <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{p.name}</span>
              <button
                type="button"
                onClick={() => detach.mutate(p.personId)}
                disabled={detach.isPending}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                data-testid={`button-remove-custom-addon-artist-${p.personId}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AdminCustomAddons;
