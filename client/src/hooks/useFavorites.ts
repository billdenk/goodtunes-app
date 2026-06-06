import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { track } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #395 — Favorites are now server-backed for signed-in fans (the heart
// on a song, the star on an artist). Anonymous fans and admin sessions keep
// the legacy localStorage path so the player works without an account and
// admin previews don't litter the customer favorites table.
//
// On a customer's first authenticated mount the hook one-shot migrates any
// localStorage entries up to the server and clears the keys, so a fan who
// favorited things before signing up doesn't lose them.
//
// The public API stays { set, ordered, has, toggle, add, remove } so every
// consumer (PlayerContext / AlbumDetail / Playlists / FavoriteArtists /
// Collection / ArtistDetail / Account) keeps working unchanged.

const SONGS_KEY = "gt:fav:songs";
const ARTISTS_KEY = "gt:fav:artists";
const EVENT_NAME = "gt:favorites-changed";

const SONGS_QK = ["/api/favorites/songs"] as const;
const ARTISTS_QK = ["/api/favorites/artists"] as const;

type SongFavRow = { songId: string; createdAt: string | null };
type ArtistFavRow = { artistName: string; createdAt: string | null };

function readLocal(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

// ───────────────────────── Local (anonymous / admin) ─────────────────────────

function useLocalFavoriteSet(key: string) {
  const [ids, setIds] = useState<string[]>(() => readLocal(key));

  useEffect(() => {
    const refresh = () => setIds(readLocal(key));
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [key]);

  const set = useMemo(() => new Set(ids), [ids]);
  const has = useCallback((id: string) => set.has(id), [set]);

  const add = useCallback(
    (id: string) => {
      const cur = readLocal(key);
      if (cur.includes(id)) return;
      writeLocal(key, [...cur, id]);
    },
    [key],
  );
  const remove = useCallback(
    (id: string) => {
      const cur = readLocal(key);
      if (!cur.includes(id)) return;
      writeLocal(key, cur.filter((x) => x !== id));
    },
    [key],
  );
  const toggle = useCallback(
    (id: string) => {
      const cur = readLocal(key);
      writeLocal(key, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    },
    [key],
  );

  return { set, ordered: ids, has, toggle, add, remove };
}

// ───────────────────────── Server (signed-in fan) ────────────────────────────

type FavoritesKind = "songs" | "artists";

type FavRow = SongFavRow | ArtistFavRow;
type FavMutationContext = { previous: FavRow[] | null | undefined };

function useServerFavoriteSet(kind: FavoritesKind) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = kind === "songs" ? SONGS_QK : ARTISTS_QK;
  const urlBase = kind === "songs" ? "/api/favorites/songs" : "/api/favorites/artists";
  const idField: "songId" | "artistName" = kind === "songs" ? "songId" : "artistName";

  const { data } = useQuery<Array<SongFavRow | ArtistFavRow> | null>({
    queryKey,
    staleTime: 1000 * 60 * 5,
  });

  const ordered = useMemo<string[]>(() => {
    if (!Array.isArray(data)) return [];
    return data.map((row) => (row as any)[idField] as string);
  }, [data, idField]);

  const set = useMemo(() => new Set(ordered), [ordered]);
  const has = useCallback((id: string) => set.has(id), [set]);

  const idsFromCache = useCallback((): string[] => {
    const cached = queryClient.getQueryData<FavRow[] | null>(queryKey);
    if (!Array.isArray(cached)) return [];
    return cached.map((row) => (row as any)[idField] as string);
  }, [queryClient, queryKey, idField]);

  const writeOptimistic = useCallback(
    (next: string[]) => {
      // Mirror the legacy shape (rows with createdAt) so cached reads stay
      // valid until the refetch lands; createdAt is only used for ordering.
      const now = new Date().toISOString();
      queryClient.setQueryData(
        queryKey,
        next.map((id) => ({ [idField]: id, createdAt: now })),
      );
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    },
    [queryClient, queryKey, idField],
  );

  // Roll the cache back to the pre-toggle snapshot and surface an honest
  // error. Without this, a non-persisting write (e.g. a 401 in an in-app
  // browser) would silently flicker the heart back via a bare invalidate.
  const rollback = useCallback(
    (ctx: FavMutationContext | undefined) => {
      if (ctx && ctx.previous !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previous);
        window.dispatchEvent(new CustomEvent(EVENT_NAME));
      }
      toast({
        title: "Couldn't update favorites",
        description: "Please make sure you're signed in and try again.",
        variant: "destructive",
      });
    },
    [queryClient, queryKey, toast],
  );

  const addMutation = useMutation<void, unknown, string, FavMutationContext>({
    mutationFn: async (id: string) => {
      const body = kind === "songs" ? { songId: id } : { artistName: id };
      await apiRequest("POST", urlBase, body);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FavRow[] | null>(queryKey);
      const prevIds = idsFromCache();
      if (!prevIds.includes(id)) writeOptimistic([...prevIds, id]);
      return { previous };
    },
    onError: (_err, _id, ctx) => rollback(ctx),
  });
  const removeMutation = useMutation<void, unknown, string, FavMutationContext>({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${urlBase}/${encodeURIComponent(id)}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FavRow[] | null>(queryKey);
      writeOptimistic(idsFromCache().filter((x) => x !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => rollback(ctx),
  });

  const add = useCallback(
    (id: string) => {
      if (set.has(id)) return;
      addMutation.mutate(id);
    },
    [set, addMutation],
  );
  const remove = useCallback(
    (id: string) => {
      if (!set.has(id)) return;
      removeMutation.mutate(id);
    },
    [set, removeMutation],
  );
  const toggle = useCallback(
    (id: string) => {
      if (set.has(id)) remove(id);
      else add(id);
    },
    [set, add, remove],
  );

  return { set, ordered, has, toggle, add, remove };
}

// ───────────────────────── One-shot localStorage → server ────────────────────

// Tracks per-userId whether we've already attempted the migration this session
// so re-mounts of useFavoriteSongs / useFavoriteArtists across pages don't
// re-fire the upload batch.
const migratedUsers = new Set<string>();

function useOneShotMigration(userId: string | undefined) {
  const queryClient = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (ranRef.current) return;
    if (migratedUsers.has(userId)) return;
    ranRef.current = true;
    migratedUsers.add(userId);

    const songIds = readLocal(SONGS_KEY);
    const artistNames = readLocal(ARTISTS_KEY);
    if (songIds.length === 0 && artistNames.length === 0) return;

    (async () => {
      try {
        await Promise.all([
          ...songIds.map((id) =>
            apiRequest("POST", "/api/favorites/songs", { songId: id, migration: true }).catch(
              () => null,
            ),
          ),
          ...artistNames.map((name) =>
            apiRequest("POST", "/api/favorites/artists", {
              artistName: name,
              migration: true,
            }).catch(() => null),
          ),
        ]);
        writeLocal(SONGS_KEY, []);
        writeLocal(ARTISTS_KEY, []);
        queryClient.invalidateQueries({ queryKey: SONGS_QK });
        queryClient.invalidateQueries({ queryKey: ARTISTS_QK });
      } catch {
        // Leave localStorage intact so a future mount can retry; the
        // migratedUsers gate is session-scoped, so a page reload retries.
        migratedUsers.delete(userId);
      }
    })();
  }, [userId, queryClient]);
}

// ───────────────────────── Public hooks ──────────────────────────────────────

function useIsFanSignedIn(): { isFan: boolean; userId: string | undefined } {
  const { user } = useAuth();
  const isFan = !!user && user.kind === "customer";
  return { isFan, userId: isFan ? user!.id : undefined };
}

export function useFavoriteSongs() {
  const { isFan, userId } = useIsFanSignedIn();
  useOneShotMigration(userId);
  const local = useLocalFavoriteSet(SONGS_KEY);
  const server = useServerFavoriteSet("songs");
  return isFan ? server : local;
}

// Artist favorites get their own analytics events so the discovery rollup
// can distinguish "fan loved this song" vs "fan loved this artist" without
// inspecting which set the id belongs to. (Song favorites are tracked in
// PlayerContext.toggleFavorite.)
export function useFavoriteArtists() {
  const { isFan, userId } = useIsFanSignedIn();
  useOneShotMigration(userId);
  const local = useLocalFavoriteSet(ARTISTS_KEY);
  const server = useServerFavoriteSet("artists");
  const inner = isFan ? server : local;

  const toggle = useCallback(
    (id: string) => {
      const was = inner.has(id);
      inner.toggle(id);
      track(was ? "unfavorite_artist" : "favorite_artist", { artistId: id });
      // Star = follow in GoodTunes (see shared/analytics.ts comment).
      // Mirror to `follow_artist` on the additive transition only so
      // dashboards can pivot on the follow concept independent of which
      // surface fired the event.
      if (!was) track("follow_artist", { artistId: id });
    },
    [inner],
  );
  const add = useCallback(
    (id: string) => {
      if (inner.has(id)) return;
      inner.add(id);
      track("favorite_artist", { artistId: id });
      track("follow_artist", { artistId: id });
    },
    [inner],
  );
  const remove = useCallback(
    (id: string) => {
      if (!inner.has(id)) return;
      inner.remove(id);
      track("unfavorite_artist", { artistId: id });
    },
    [inner],
  );
  return { ...inner, toggle, add, remove };
}
