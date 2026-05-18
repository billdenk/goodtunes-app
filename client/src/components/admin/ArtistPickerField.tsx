import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, X, Link2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Combobox-style picker for an album's primary artist.
 *
 * Lists everyone in /api/people. Lets the admin pick an existing person OR
 * create a new one by typing a name OR pasting an Apple Music / Spotify
 * artist URL. The selection drives two draft keys at once: a display-name
 * string (canonical column on the album) plus the FK id into people.
 */

interface PersonLite {
  id: string;
  name: string;
  photoUrl?: string | null;
}

interface ScrapeResult {
  source: "apple" | "spotify" | "unknown";
  name: string | null;
  photoUrl: string | null;
  bio: string | null;
  itunesArtistId: string | null;
  appleMusicUrl: string | null;
  spotifyUrl: string | null;
}

export interface ArtistPickerFieldProps {
  label: string;
  required?: boolean;
  nameValue: string;
  idValue: string;
  onChange: (next: { name: string; id: string }) => void;
}

export function ArtistPickerField({
  label,
  required,
  nameValue,
  idValue,
  onChange,
}: ArtistPickerFieldProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [urlMode, setUrlMode] = useState(false);
  const [appleUrl, setAppleUrl] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { data: people = [], isLoading } = useQuery<PersonLite[]>({
    queryKey: ["/api/people"],
  });

  // Sort alphabetically; cmdk handles fuzzy filtering on top.
  const sorted = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  // Show the "Create '<query>'" row only when the typed name doesn't already
  // match an existing person exactly (case-insensitive). Empty queries don't
  // get a create option.
  const trimmed = query.trim();
  const hasExact = sorted.some(
    (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const showCreate = trimmed.length > 0 && !hasExact;

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<PersonLite> => {
      const res = await apiRequest("POST", "/api/admin/people", body);
      return (await res.json()) as PersonLite;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/people"] });
    },
  });

  const scrapeMut = useMutation({
    mutationFn: async (u: string): Promise<ScrapeResult> => {
      const res = await apiRequest("POST", "/api/admin/people/scrape", {
        url: u,
      });
      return (await res.json()) as ScrapeResult;
    },
  });

  const commit = (person: PersonLite) => {
    onChange({ name: person.name, id: person.id });
    setOpen(false);
    setQuery("");
    setUrlMode(false);
    setAppleUrl("");
    setSpotifyUrl("");
    // Return focus to the trigger so keyboard users land where they started.
    queueMicrotask(() => triggerRef.current?.focus());
  };

  const handleCreateFromName = async () => {
    if (!trimmed) return;
    try {
      const person = await createMut.mutateAsync({ name: trimmed });
      commit(person);
      toast({ title: `Added ${person.name}` });
    } catch (e: any) {
      toast({
        title: "Couldn't create artist",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleCreateFromUrl = async () => {
    const a = appleUrl.trim();
    const s = spotifyUrl.trim();
    if (!a && !s) return;
    try {
      // Scrape whichever URLs were provided. Run in parallel; if one fails
      // (e.g. Spotify boilerplate, Apple rate limit) we still use the other.
      const results = await Promise.allSettled([
        a ? scrapeMut.mutateAsync(a) : Promise.resolve(null as ScrapeResult | null),
        s ? scrapeMut.mutateAsync(s) : Promise.resolve(null as ScrapeResult | null),
      ]);
      const apple =
        results[0].status === "fulfilled" ? results[0].value : null;
      const spotify =
        results[1].status === "fulfilled" ? results[1].value : null;

      if (!apple && !spotify) {
        toast({
          title: "Couldn't read those pages",
          description: "Both URLs failed. Check them and try again.",
          variant: "destructive",
        });
        return;
      }

      // Merge: prefer Apple for canonical name + iTunes id (better for
      // discography). Take photo / bio from whichever has it, Apple first.
      const merged = {
        name: apple?.name || spotify?.name || null,
        photoUrl: apple?.photoUrl || spotify?.photoUrl || null,
        bio: apple?.bio || spotify?.bio || null,
        appleMusicUrl: apple?.appleMusicUrl || (a || null),
        spotifyUrl: spotify?.spotifyUrl || (s || null),
        itunesArtistId: apple?.itunesArtistId || null,
      };

      if (!merged.name) {
        toast({
          title: "Couldn't find an artist name",
          description: "Try a different URL or type the name in directly.",
          variant: "destructive",
        });
        return;
      }

      const person = await createMut.mutateAsync(merged);
      commit(person);
      toast({ title: `Added ${person.name}` });
    } catch (e: any) {
      toast({
        title: "Couldn't import artist",
        description: e?.message || "Check the URL and try again.",
        variant: "destructive",
      });
    }
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ name: "", id: "" });
  };

  const busy = createMut.isPending || scrapeMut.isPending;
  const displayName = nameValue.trim();

  return (
    <div>
      <label className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1">
        {label}
        {required && (
          <span className="ml-1 text-[#FF5470] normal-case">·  required</span>
        )}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-left text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent inline-flex items-center gap-2"
            data-testid="input-artist"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span
              className={[
                "flex-1 truncate",
                displayName ? "" : "text-slate-300 italic",
              ].join(" ")}
            >
              {displayName || "Choose artist…"}
            </span>
            {displayName && !required && (
              <span
                role="button"
                aria-label="Clear artist"
                onClick={clear}
                className="w-5 h-5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 inline-flex items-center justify-center"
                data-testid="button-clear-artist"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[min(360px,calc(100vw-2rem))]"
        >
          {urlMode ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-slate-700">
                  Import artist from streaming
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUrlMode(false);
                    setAppleUrl("");
                    setSpotifyUrl("");
                  }}
                  className="text-[11px] text-slate-500 hover:text-slate-900"
                  data-testid="button-cancel-artist-url"
                >
                  Back
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1">
                    Apple Music URL
                  </label>
                  <input
                    type="url"
                    autoFocus
                    value={appleUrl}
                    onChange={(e) => setAppleUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateFromUrl();
                      }
                    }}
                    placeholder="https://music.apple.com/us/artist/…"
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
                    data-testid="input-artist-apple-url"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider block mb-1">
                    Spotify URL
                  </label>
                  <input
                    type="url"
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateFromUrl();
                      }
                    }}
                    placeholder="https://open.spotify.com/artist/…"
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
                    data-testid="input-artist-spotify-url"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCreateFromUrl}
                disabled={(!appleUrl.trim() && !spotifyUrl.trim()) || busy}
                className="w-full h-9 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                data-testid="button-import-artist-url"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                Import artist
              </button>
              <p className="text-[11px] text-slate-400 leading-snug">
                Either field is enough. Paste both and we'll merge the name,
                photo, and bio — and link both services on the artist profile.
              </p>
            </div>
          ) : (
            <Command shouldFilter={true}>
              <CommandInput
                placeholder="Search artists…"
                value={query}
                onValueChange={setQuery}
                data-testid="input-artist-search"
              />
              <CommandList>
                {isLoading ? (
                  <div className="p-4 text-[12.5px] text-slate-500 inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading artists…
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      <div className="text-[12.5px] text-slate-500">
                        No artists match.
                      </div>
                    </CommandEmpty>
                    {sorted.length > 0 && (
                      <CommandGroup heading="Existing artists">
                        {sorted.map((p) => {
                          const selected = p.id === idValue;
                          return (
                            <CommandItem
                              key={p.id}
                              value={p.name}
                              onSelect={() => commit(p)}
                              data-testid={`option-artist-${p.id}`}
                              className="flex items-center gap-2"
                            >
                              {p.photoUrl ? (
                                <img
                                  src={p.photoUrl}
                                  alt=""
                                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 text-[10px] font-semibold inline-flex items-center justify-center flex-shrink-0">
                                  {p.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                              <span className="flex-1 truncate">{p.name}</span>
                              {selected && (
                                <Check className="w-3.5 h-3.5 text-[#319ED8] flex-shrink-0" />
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                    <CommandSeparator />
                    <CommandGroup heading="Add new">
                      {showCreate && (
                        <CommandItem
                          value={`__create__${trimmed}`}
                          onSelect={handleCreateFromName}
                          data-testid="button-create-artist-name"
                          className="flex items-center gap-2"
                        >
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 flex-shrink-0" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-[#319ED8] flex-shrink-0" />
                          )}
                          <span className="flex-1 truncate">
                            Create "{trimmed}"
                          </span>
                        </CommandItem>
                      )}
                      <CommandItem
                        value="__paste_url__"
                        onSelect={() => setUrlMode(true)}
                        data-testid="button-create-artist-url"
                        className="flex items-center gap-2"
                      >
                        <Link2 className="w-3.5 h-3.5 text-[#319ED8] flex-shrink-0" />
                        <span className="flex-1 truncate">
                          Paste Apple Music or Spotify URL…
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
