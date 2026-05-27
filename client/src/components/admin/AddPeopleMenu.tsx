import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Loader2, Plus, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Task #421 — unified "+ Add ▾" trigger for partner-detail People
// panels. Replaces the old "Search existing / Paste LinkedIn" tabs on
// NPO / Press / Fulfillment / Label / Vendor with a single dropdown
// that opens one of three focused dialogs:
//   • Add Admin       — attach a Person as a Contact AND grant the
//                       matching partner-scoped admin role via
//                       /api/admin/people/:id/grant-admin-role.
//   • Add Ambassador  — NPO-only; attach + flip can_invite_ambassadors.
//   • Invite Artist   — two-step: pick or create a Person (with a
//                       Spotify fallback search), then collect email
//                       and/or phone and POST /api/admin/invites.
//
// Referrer attribution rolls up to the current partner for NPO and
// Press today (the only kinds the existing /api/admin/invites
// referrer shape accepts). Label / Fulfillment / Vendor invites still
// go out scoped to the current partner — we tag the welcomeNote with
// the partner kind+name so the invite is traceable in the queue, but
// payout credit attribution for those kinds is a follow-up.

export type AddPeopleMenuEntityKind =
  | "non_profit"
  | "manufacturer"
  | "fulfillment"
  | "label"
  | "vendor";

const ENTITY_LABEL: Record<AddPeopleMenuEntityKind, string> = {
  non_profit: "non-profit",
  manufacturer: "press",
  fulfillment: "fulfillment partner",
  label: "label",
  vendor: "vendor",
};

const ENTITY_ROLE: Record<AddPeopleMenuEntityKind, string> = {
  non_profit: "non_profit",
  manufacturer: "manufacturer",
  fulfillment: "fulfillment",
  label: "label",
  vendor: "vendor",
};

export interface AddPeopleMenuProps {
  /** Entity this People panel belongs to. Drives ambassador visibility, role grant, and invite referrer attribution. */
  entityKind: AddPeopleMenuEntityKind;
  entityId: string;
  entityName: string;
  /** Contacts collection endpoint — POST {personId, role} to attach. */
  contactsApiPath: string;
  /** queryKey base for invalidating the contacts list. */
  contactsQueryKey: readonly unknown[];
  /** Suffix for data-testid attributes. */
  testIdPrefix: string;
  /** People already attached — hidden from the picker. */
  attachedIds: Set<string>;
}

type PersonLite = { id: string; name: string; photoUrl: string | null };

function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^(\d{3}):\s*(.*)$/);
  if (m) {
    try {
      const body = JSON.parse(m[2]);
      if (body?.message) return String(body.message);
    } catch {
      /* fall through */
    }
    return m[2];
  }
  return raw || "Something went wrong.";
}

function errorStatus(err: unknown): number | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^(\d{3}):/);
  return m ? Number(m[1]) : null;
}

export function AddPeopleMenu(props: AddPeopleMenuProps) {
  const [openDialog, setOpenDialog] = useState<
    null | "admin" | "ambassador" | "invite"
  >(null);

  const showAmbassador = props.entityKind === "non_profit";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            data-testid={`button-${props.testIdPrefix}-add-people`}
          >
            <Plus className="w-3 h-3" />
            Add
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() => setOpenDialog("admin")}
            data-testid={`menu-${props.testIdPrefix}-add-admin`}
          >
            Add Admin
          </DropdownMenuItem>
          {showAmbassador && (
            <DropdownMenuItem
              onSelect={() => setOpenDialog("ambassador")}
              data-testid={`menu-${props.testIdPrefix}-add-ambassador`}
            >
              Add Ambassador
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => setOpenDialog("invite")}
            data-testid={`menu-${props.testIdPrefix}-invite-artist`}
          >
            Invite Artist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AttachContactDialog
        open={openDialog === "admin"}
        onOpenChange={(v) => !v && setOpenDialog(null)}
        title="Add Admin"
        description={`Pick a Person to attach to ${props.entityName} as a Contact, and grant them the partner-scoped admin role.`}
        submitLabel="Add admin"
        kind="admin"
        {...props}
      />
      {showAmbassador && (
        <AttachContactDialog
          open={openDialog === "ambassador"}
          onOpenChange={(v) => !v && setOpenDialog(null)}
          title="Add Ambassador"
          description={`Attach a Person and grant the ambassador-inviter flag so they can credit fan invites back to ${props.entityName}.`}
          submitLabel="Add ambassador"
          kind="ambassador"
          {...props}
        />
      )}
      <InviteArtistDialog
        open={openDialog === "invite"}
        onOpenChange={(v) => !v && setOpenDialog(null)}
        {...props}
      />
    </>
  );
}

// ─── Shared Person picker (with Spotify fallback) ────────────────────

type SpotifyCandidate = {
  spotifyArtistId: string;
  name: string;
  imageUrl?: string | null;
};

type ScrapePersonResult = {
  source: "apple" | "spotify" | "bandcamp" | "generic" | "unknown";
  name: string | null;
  title?: string | null;
  bio: string | null;
  photoUrl: string | null;
  links?: Array<{ kind: string; url: string }>;
};

function PersonPicker({
  value,
  onChange,
  excludeIds,
  testIdPrefix,
  enableSpotify,
  onPrefilled,
}: {
  value: PersonLite | null;
  onChange: (p: PersonLite | null) => void;
  excludeIds: Set<string>;
  testIdPrefix: string;
  /** Adds a "Search Spotify" fallback button (only used by Invite Artist). */
  enableSpotify?: boolean;
  /** Fires after a paste-a-URL prefill resolves with extra scraped
      fields the parent dialog can hydrate (e.g. AttachContactDialog
      prefilling its Role input from JSON-LD `jobTitle`). */
  onPrefilled?: (info: { title: string | null }) => void;
}) {
  const [q, setQ] = useState("");
  const [spotifyQuery, setSpotifyQuery] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  // Staged scrape result — the operator confirms (or discards) this
  // before any Person row is created. Mirrors the staged-prefill UX
  // in NewAlbumArtistDialog so admins can review what the scraper
  // pulled before it lands in the database.
  const [pastePrefill, setPastePrefill] = useState<{
    name: string;
    title: string | null;
    bio: string | null;
    photoUrl: string | null;
    links: Array<{ kind: string; url: string }>;
  } | null>(null);

  const results = useQuery<PersonLite[]>({
    queryKey: ["/api/admin/people", { q }],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/people?q=${encodeURIComponent(q)}&limit=8`,
      );
      return r.json();
    },
    enabled: !value && q.trim().length >= 2,
  });

  const spotify = useQuery<{ query: string; candidates: SpotifyCandidate[] }>({
    queryKey: ["/api/admin/spotify/artist-search", { q: spotifyQuery }],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/spotify/artist-search?q=${encodeURIComponent(spotifyQuery!)}`,
      );
      return r.json();
    },
    enabled: !value && !!spotifyQuery && spotifyQuery.trim().length >= 2,
  });

  const { toast } = useToast();
  // Inline "+ Create '<name>' as a new Person" — fires when the People
  // search returns zero matches and the operator wants to mint a bare
  // row from just the typed name. Mirrors the same POST /api/admin/people
  // the Spotify and Prefill paths use; the parent dialog's flow then
  // takes over (attach as Contact, grant admin role, etc.). For Add
  // Admin specifically the subsequent grant-admin-role call will return
  // a clear error if there's no matching admin account, pointing the
  // operator at Invite Artist.
  const createBareMut = useMutation({
    mutationFn: async (name: string) => {
      const created = await apiRequest("POST", "/api/admin/people", { name });
      return (await created.json()) as PersonLite;
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      onChange({ id: p.id, name: p.name, photoUrl: p.photoUrl ?? null });
      setQ("");
      toast({ title: `Added ${p.name}` });
    },
    onError: (e) =>
      toast({
        title: "Couldn't create Person",
        description: humanizeApiError(e),
        variant: "destructive",
      }),
  });

  const createFromSpotify = useMutation({
    mutationFn: async (cand: SpotifyCandidate) => {
      // Mint a Person row from the Spotify candidate using the existing
      // PUT /api/admin/people/:id route. We mint with a temporary id and
      // let the server reject if it already exists — but the simpler
      // path is to POST a bare row, then PATCH the spotify_artist_id via
      // the candidate apply endpoint. Today the cleanest endpoint we
      // have is the "save candidate" pattern on a freshly-created
      // Person, so we create the row first then attach the Spotify id.
      const created = await apiRequest("POST", "/api/admin/people", {
        name: cand.name,
        photoUrl: cand.imageUrl ?? null,
      });
      const personJson = (await created.json()) as PersonLite & {
        id: string;
      };
      try {
        await apiRequest(
          "POST",
          `/api/admin/people/${personJson.id}/apply-spotify-candidate`,
          { spotifyArtistId: cand.spotifyArtistId },
        );
      } catch {
        // Apply-candidate endpoint may not exist on every deploy — the
        // Person row is still usable for the invite without it.
      }
      return personJson;
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      onChange({ id: p.id, name: p.name, photoUrl: p.photoUrl ?? null });
      setSpotifyQuery(null);
    },
    onError: (e) =>
      toast({
        title: "Couldn't import from Spotify",
        description: humanizeApiError(e),
        variant: "destructive",
      }),
  });

  // Paste-a-URL prefill — Bandcamp / artist site / Apple Music / Spotify
  // / generic Person JSON-LD. Mirrors the same affordance NewAlbumArtist
  // Dialog adds on the album-create flow so the Add Admin / Add
  // Ambassador / Invite Artist dialogs all create a populated Person row
  // (name + bio + photo + social links) from one URL paste.
  // Step 1: scrape. Stages the result into pastePrefill — does NOT
  // touch the database. The operator reviews the preview card and
  // confirms via the explicit "Add to People" button below.
  const scrapeUrlMut = useMutation({
    mutationFn: async (url: string) => {
      const scrapeRes = await apiRequest("POST", "/api/admin/people/scrape", { url });
      const scrape = (await scrapeRes.json()) as ScrapePersonResult;
      const scrapedName = (scrape.name || "").trim();
      if (!scrapedName) {
        throw new Error("Couldn't find a person at that URL — search by name instead.");
      }
      return {
        name: scrapedName,
        title: scrape.title?.trim() || null,
        bio: scrape.bio ?? null,
        photoUrl: scrape.photoUrl ?? null,
        links: scrape.links ?? [],
      };
    },
    onSuccess: (prefill) => {
      setPastePrefill(prefill);
      setPasteError(null);
    },
    onError: (e) => setPasteError(humanizeApiError(e)),
  });

  // Step 2: commit. Fires when the operator confirms the staged
  // prefill is correct. Maps classified links onto the named columns
  // POST /api/admin/people already accepts; surfaces the scraped
  // title back up to the parent dialog via onPrefilled.
  const commitPrefillMut = useMutation({
    mutationFn: async () => {
      if (!pastePrefill) throw new Error("No prefill staged");
      const body: Record<string, unknown> = {
        name: pastePrefill.name,
        photoUrl: pastePrefill.photoUrl,
        bio: pastePrefill.bio,
      };
      for (const link of pastePrefill.links) {
        if (!(link.kind in body)) body[link.kind] = link.url;
      }
      const created = await apiRequest("POST", "/api/admin/people", body);
      const person = (await created.json()) as PersonLite;
      return { person, title: pastePrefill.title };
    },
    onSuccess: ({ person, title }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      onChange({ id: person.id, name: person.name, photoUrl: person.photoUrl ?? null });
      onPrefilled?.({ title });
      setPasteUrl("");
      setPasteError(null);
      setPastePrefill(null);
      toast({ title: `Added ${person.name}` });
    },
    onError: (e) => setPasteError(humanizeApiError(e)),
  });

  if (value) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2"
        data-testid={`picked-${testIdPrefix}`}
      >
        {value.photoUrl ? (
          <img
            src={value.photoUrl}
            alt=""
            className="w-7 h-7 rounded-full object-cover bg-slate-100"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-slate-200" />
        )}
        <span className="text-sm text-slate-800 flex-1 truncate">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-slate-400 hover:text-rose-600"
          aria-label="Clear selection"
          data-testid={`button-${testIdPrefix}-clear`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const localMatches = (results.data ?? []).filter((p) => !excludeIds.has(p.id));
  const showSpotifyButton =
    enableSpotify && q.trim().length >= 2 && !spotifyQuery;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="Paste a URL (Bandcamp, Apple Music, Spotify, bio page)"
          value={pasteUrl}
          onChange={(e) => { setPasteUrl(e.target.value); setPasteError(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pasteUrl.trim() && !scrapeUrlMut.isPending) {
              e.preventDefault();
              scrapeUrlMut.mutate(pasteUrl.trim());
            }
          }}
          disabled={scrapeUrlMut.isPending || commitPrefillMut.isPending}
          data-testid={`input-${testIdPrefix}-paste-url`}
        />
        <button
          type="button"
          onClick={() => scrapeUrlMut.mutate(pasteUrl.trim())}
          disabled={scrapeUrlMut.isPending || commitPrefillMut.isPending || !pasteUrl.trim()}
          className="h-9 px-3 rounded-md bg-[var(--brand-blue)] text-white text-xs font-semibold hover:bg-[#2890c8] inline-flex items-center justify-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
          data-testid={`button-${testIdPrefix}-paste-url`}
        >
          {scrapeUrlMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Prefill
        </button>
      </div>
      {pasteError && (
        <p
          className="text-xs text-amber-700 leading-snug"
          data-testid={`text-${testIdPrefix}-paste-url-error`}
        >
          {pasteError}
        </p>
      )}
      {pastePrefill && (
        // Staged scrape preview — operator confirms via "Add to People"
        // before the row is created. Discarding clears the staged data
        // so the same paste field can be reused for another URL.
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
          data-testid={`card-${testIdPrefix}-paste-prefill`}
        >
          <div className="flex gap-3">
            {pastePrefill.photoUrl ? (
              <img
                src={pastePrefill.photoUrl}
                alt=""
                className="w-12 h-12 rounded-md object-cover bg-slate-100 flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-md bg-slate-100 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {pastePrefill.name}
              </div>
              {pastePrefill.title && (
                <div className="text-xs text-slate-500 truncate">
                  {pastePrefill.title}
                </div>
              )}
              {pastePrefill.bio && (
                <p className="text-xs text-slate-700 leading-snug line-clamp-2 pt-0.5">
                  {pastePrefill.bio}
                </p>
              )}
              {pastePrefill.links.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {pastePrefill.links.map((l) => (
                    <span
                      key={l.kind + l.url}
                      className="inline-flex items-center rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
                    >
                      {l.kind.replace(/Url$/, "")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setPastePrefill(null); setPasteError(null); }}
              disabled={commitPrefillMut.isPending}
              className="h-8 px-3 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-60"
              data-testid={`button-${testIdPrefix}-paste-prefill-discard`}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => commitPrefillMut.mutate()}
              disabled={commitPrefillMut.isPending}
              className="h-8 px-3 rounded-md bg-[var(--brand-blue)] text-white text-xs font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 disabled:opacity-60"
              data-testid={`button-${testIdPrefix}-paste-prefill-commit`}
            >
              {commitPrefillMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add to People
            </button>
          </div>
        </div>
      )}
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-1">
        or search
      </div>
      <Input
        type="text"
        placeholder="Search People (2+ chars)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSpotifyQuery(null);
        }}
        data-testid={`input-${testIdPrefix}-person-search`}
      />
      {q.trim().length >= 2 && (
        <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-56 overflow-y-auto">
          {results.isLoading ? (
            <li className="px-3 py-2 text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </li>
          ) : localMatches.length === 0 ? (
            <li className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">No matches in People.</span>
              <button
                type="button"
                onClick={() => createBareMut.mutate(q.trim())}
                disabled={createBareMut.isPending || !q.trim()}
                className="text-xs font-semibold text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1 disabled:opacity-60"
                data-testid={`button-${testIdPrefix}-create-bare`}
              >
                {createBareMut.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Create “{q.trim()}”
              </button>
            </li>
          ) : (
            localMatches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => onChange(p)}
                  data-testid={`button-${testIdPrefix}-pick-${p.id}`}
                >
                  {p.photoUrl ? (
                    <img
                      src={p.photoUrl}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover bg-slate-100"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-100" />
                  )}
                  <span className="text-sm text-slate-900">{p.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {showSpotifyButton && (
        <button
          type="button"
          onClick={() => setSpotifyQuery(q)}
          className="text-xs font-semibold text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1"
          data-testid={`button-${testIdPrefix}-search-spotify`}
        >
          <Search className="w-3 h-3" />
          Search Spotify for “{q.trim()}”
        </button>
      )}
      {spotifyQuery && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
            Spotify matches
          </div>
          {spotify.isLoading ? (
            <div className="px-2 py-1.5 text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching Spotify…
            </div>
          ) : spotify.isError ? (
            <div className="px-2 py-1.5 text-xs text-slate-500">
              Spotify lookup failed.
            </div>
          ) : (spotify.data?.candidates ?? []).length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-500">
              No Spotify matches.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {(spotify.data?.candidates ?? []).map((c) => (
                <li key={c.spotifyArtistId}>
                  <button
                    type="button"
                    onClick={() => createFromSpotify.mutate(c)}
                    disabled={createFromSpotify.isPending}
                    className="w-full flex items-center gap-3 px-2 py-2 text-left hover:bg-white rounded-md disabled:opacity-50"
                    data-testid={`button-${testIdPrefix}-spotify-${c.spotifyArtistId}`}
                  >
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover bg-slate-100"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200" />
                    )}
                    <span className="text-sm text-slate-900 flex-1 truncate">
                      {c.name}
                    </span>
                    {createFromSpotify.isPending && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Admin / Add Ambassador dialog ───────────────────────────────

function AttachContactDialog(
  props: AddPeopleMenuProps & {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    title: string;
    description: string;
    submitLabel: string;
    kind: "admin" | "ambassador";
  },
) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<PersonLite | null>(null);
  const [role, setRole] = useState("");

  function reset() {
    setPicked(null);
    setRole("");
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error("Pick a Person first");
      // Step 1: attach as Contact. For ambassador we tolerate a 409
      // (already attached) so the operator can re-run on an existing
      // contact just to flip the ambassador bit. Any non-409 error
      // still bubbles up.
      try {
        await apiRequest("POST", props.contactsApiPath, {
          personId: picked.id,
          role: role.trim() || null,
        });
      } catch (e) {
        const status = errorStatus(e);
        if (props.kind !== "ambassador" || status !== 409) throw e;
      }
      if (props.kind === "ambassador") {
        await apiRequest(
          "PATCH",
          `/api/admin/people/${picked.id}/can-invite-ambassadors`,
          { enabled: true },
        );
      }
      if (props.kind === "admin") {
        // Step 2: grant partner-scoped admin role via the same
        // setUserRole plumbing AdminCustomers' "Make admin…" uses.
        await apiRequest(
          "POST",
          `/api/admin/people/${picked.id}/grant-admin-role`,
          {
            role: ENTITY_ROLE[props.entityKind],
            roleScopeId: props.entityId,
          },
        );
      }
      return picked;
    },
    onSuccess: (person) => {
      queryClient.invalidateQueries({ queryKey: props.contactsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      toast({
        title:
          props.kind === "admin"
            ? `Added ${person.name} as admin`
            : `${person.name} is now an ambassador`,
      });
      reset();
      props.onOpenChange(false);
    },
    onError: (e) =>
      toast({
        title:
          props.kind === "admin"
            ? "Couldn't add admin"
            : "Couldn't add ambassador",
        description: humanizeApiError(e),
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (!v) reset();
        props.onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-md"
        data-testid={`dialog-${props.testIdPrefix}-${props.kind}`}
      >
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PersonPicker
            value={picked}
            onChange={setPicked}
            excludeIds={props.attachedIds}
            testIdPrefix={`${props.testIdPrefix}-${props.kind}`}
            // Bill 2026-05-27: press/NPO/label/maker/reseller admins
            // are often the same people who already have a Spotify
            // artist row (label founders who release records, NPO
            // ambassadors who tour), so surface the same Spotify
            // fallback here that Invite Artist uses — not just the
            // paste-a-URL prefill.
            enableSpotify
            // Paste-a-URL prefill: a scraped JSON-LD `jobTitle`
            // (vendor team pages, label staff pages) maps onto the Role
            // input here so the operator doesn't retype it. Only fills
            // when the field is still empty — never clobber.
            onPrefilled={(info) => {
              if (info.title && !role.trim()) setRole(info.title);
            }}
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Role (optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. Director"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              data-testid={`input-${props.testIdPrefix}-${props.kind}-role`}
            />
          </div>
          {props.kind === "admin" && (
            <p className="text-xs text-slate-500">
              The Person must have a contact email on file that matches an
              existing admin account. If not, use Invite Artist instead.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              props.onOpenChange(false);
            }}
            data-testid={`button-${props.testIdPrefix}-${props.kind}-cancel`}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!picked || submit.isPending}
            data-testid={`button-${props.testIdPrefix}-${props.kind}-submit`}
          >
            {submit.isPending ? "Adding…" : props.submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Artist dialog (two-step) ─────────────────────────────────

function InviteArtistDialog(
  props: AddPeopleMenuProps & {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  },
) {
  const { toast } = useToast();
  // Step 1: pick (or import) a Person, OR skip to invite an unknown
  // artist. Step 2: contact info + send.
  const [step, setStep] = useState<"pick" | "contact">("pick");
  const [picked, setPicked] = useState<PersonLite | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  function reset() {
    setStep("pick");
    setPicked(null);
    setEmail("");
    setPhone("");
    setLastUrl(null);
    setCopied(false);
    setDuplicate(null);
  }

  // Referrer attribution maps cleanly onto the existing /api/admin/invites
  // referrer shape for NPO and Press. For Label / Fulfillment / Vendor we
  // stamp the welcomeNote with a "[via <kind> <name>]" tag so the invite
  // is traceable to the partner in the invites queue; full payout
  // attribution for those kinds is a follow-up.
  const referrer = useMemo(() => {
    if (props.entityKind === "non_profit")
      return { kind: "non_profit" as const, id: props.entityId };
    if (props.entityKind === "manufacturer")
      return { kind: "manufacturer" as const, id: props.entityId };
    return null;
  }, [props.entityKind, props.entityId]);

  const scopeTag = useMemo(() => {
    if (referrer) return null;
    return `[via ${ENTITY_LABEL[props.entityKind]}: ${props.entityName}]`;
  }, [referrer, props.entityKind, props.entityName]);

  const send = useMutation({
    mutationFn: async (vars: { confirmDuplicate?: boolean }) => {
      const noteParts: string[] = [];
      if (scopeTag) noteParts.push(scopeTag);
      if (phone.trim()) noteParts.push(`Phone: ${phone.trim()}`);
      const welcomeNote = noteParts.length ? noteParts.join("\n") : null;

      const body: any = {
        email: email.trim(),
        role: "artist",
        roleScopeId: picked?.id ?? null,
        referrerKind: referrer?.kind ?? null,
        referrerScopeId: referrer?.id ?? null,
        welcomeNote,
      };
      if (vars.confirmDuplicate) body.confirmDuplicate = true;
      const r = await apiRequest("POST", "/api/admin/invites", body);
      return (await r.json()) as {
        email: string;
        acceptUrl: string;
        emailDelivered: boolean;
        reviewStatus?: string;
      };
    },
    onSuccess: (data) => {
      setLastUrl(data.acceptUrl);
      setCopied(false);
      setDuplicate(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title:
          data.reviewStatus === "pending_review"
            ? "Held for review"
            : data.emailDelivered
              ? "Invite sent"
              : "Invite created (email failed — copy the link)",
        description: data.emailDelivered ? `Emailed ${data.email}.` : undefined,
      });
    },
    onError: (e: Error) => {
      try {
        const m = e.message.match(/\{[\s\S]*\}/);
        const payload = m ? JSON.parse(m[0]) : null;
        if (payload?.code === "duplicate_in_subtree" && payload?.existing?.name) {
          setDuplicate(payload.existing.name);
          return;
        }
      } catch {
        /* fall through */
      }
      toast({
        title: "Couldn't send invite",
        description: humanizeApiError(e),
        variant: "destructive",
      });
    },
  });

  async function copyUrl() {
    if (!lastUrl) return;
    try {
      await navigator.clipboard.writeText(lastUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the URL is still visible to copy by hand */
    }
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /^[\d\s+\-()]{7,}$/;
  const canSubmit =
    emailRe.test(email.trim()) &&
    (!phone.trim() || phoneRe.test(phone.trim())) &&
    !send.isPending;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(v) => {
        if (!v) reset();
        props.onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-md"
        data-testid={`dialog-${props.testIdPrefix}-invite`}
      >
        <DialogHeader>
          <DialogTitle>Invite Artist</DialogTitle>
          <DialogDescription>
            {step === "pick"
              ? `Find an existing artist (or import one from Spotify), then send them a one-time link.`
              : `Send a one-time link so ${picked?.name ?? "this artist"} can claim their account.`}
            {referrer
              ? ` Credit rolls up to ${props.entityName}.`
              : scopeTag
                ? ` Tagged to ${props.entityName} in the invites queue.`
                : ""}
          </DialogDescription>
        </DialogHeader>

        {lastUrl ? (
          <div className="space-y-3">
            <div
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              data-testid={`last-invite-url-${props.testIdPrefix}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">
                  Invite link
                </div>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="text-xs font-semibold text-[var(--brand-blue)] hover:underline flex items-center gap-1"
                  data-testid={`button-${props.testIdPrefix}-copy-url`}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-700 break-all font-mono">
                {lastUrl}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  reset();
                }}
                data-testid={`button-${props.testIdPrefix}-invite-another`}
              >
                Invite another
              </Button>
              <Button
                type="button"
                onClick={() => {
                  reset();
                  props.onOpenChange(false);
                }}
                data-testid={`button-${props.testIdPrefix}-invite-done`}
              >
                Done
              </Button>
            </div>
          </div>
        ) : step === "pick" ? (
          <div className="space-y-3">
            <PersonPicker
              value={picked}
              onChange={setPicked}
              excludeIds={new Set()}
              testIdPrefix={`${props.testIdPrefix}-invite`}
              enableSpotify
            />
            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPicked(null);
                  setStep("contact");
                }}
                data-testid={`button-${props.testIdPrefix}-invite-skip-pick`}
              >
                Skip — unknown artist
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    reset();
                    props.onOpenChange(false);
                  }}
                  data-testid={`button-${props.testIdPrefix}-invite-cancel`}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep("contact")}
                  disabled={!picked}
                  data-testid={`button-${props.testIdPrefix}-invite-next`}
                >
                  Next
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {picked ? (
              <div
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                data-testid={`picked-${props.testIdPrefix}-invite-summary`}
              >
                {picked.photoUrl ? (
                  <img
                    src={picked.photoUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover bg-slate-100"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-200" />
                )}
                <span className="text-sm text-slate-800 flex-1 truncate">
                  {picked.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setStep("pick");
                  }}
                  className="text-xs font-semibold text-[var(--brand-blue)] hover:underline"
                  data-testid={`button-${props.testIdPrefix}-invite-change-person`}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                No Person tied — the invitee will claim a fresh artist row on
                sign-up.{" "}
                <button
                  type="button"
                  onClick={() => setStep("pick")}
                  className="font-semibold text-[var(--brand-blue)] hover:underline"
                  data-testid={`button-${props.testIdPrefix}-invite-back-to-pick`}
                >
                  Pick a Person
                </button>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Email
              </label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid={`input-${props.testIdPrefix}-invite-email`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Phone (optional)
              </label>
              <Input
                type="tel"
                placeholder="+1 555 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid={`input-${props.testIdPrefix}-invite-phone`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Captured on the invite note for outreach — the link still gets
                emailed.
              </p>
            </div>

            {duplicate && (
              <div
                className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900"
                data-testid={`banner-${props.testIdPrefix}-duplicate`}
              >
                <div>
                  <strong>{duplicate}</strong> already appears under this
                  referrer. Sending again creates a parallel attribution.
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDuplicate(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-amber-100 rounded-md"
                    data-testid={`button-${props.testIdPrefix}-duplicate-cancel`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => send.mutate({ confirmDuplicate: true })}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md"
                    data-testid={`button-${props.testIdPrefix}-duplicate-confirm`}
                  >
                    Send anyway
                  </button>
                </div>
              </div>
            )}

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("pick")}
                data-testid={`button-${props.testIdPrefix}-invite-back`}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    reset();
                    props.onOpenChange(false);
                  }}
                  data-testid={`button-${props.testIdPrefix}-invite-cancel`}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => send.mutate({})}
                  disabled={!canSubmit}
                  data-testid={`button-${props.testIdPrefix}-invite-send`}
                >
                  {send.isPending ? "Sending…" : "Generate invite link"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
