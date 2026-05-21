import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";

const SONGS_KEY = "gt:fav:songs";
const ARTISTS_KEY = "gt:fav:artists";
const EVENT_NAME = "gt:favorites-changed";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function useFavoriteSet(key: string) {
  const [set, setSet] = useState<Set<string>>(() => readSet(key));

  useEffect(() => {
    const refresh = () => setSet(readSet(key));
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [key]);

  const has = useCallback((id: string) => set.has(id), [set]);
  const ordered: string[] = Array.from(set);

  const toggle = useCallback(
    (id: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        writeSet(key, next);
        return next;
      });
    },
    [key],
  );

  const add = useCallback(
    (id: string) => {
      setSet((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        writeSet(key, next);
        return next;
      });
    },
    [key],
  );

  const remove = useCallback(
    (id: string) => {
      setSet((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        writeSet(key, next);
        return next;
      });
    },
    [key],
  );

  return { set, ordered, has, toggle, add, remove };
}

export function useFavoriteSongs() {
  return useFavoriteSet(SONGS_KEY);
}

// Artist favorites get their own analytics events so the discovery
// rollup can distinguish "fan loved this song" vs "fan loved this
// artist" without inspecting which set the id belongs to. (Song
// favorites are tracked in PlayerContext.toggleFavorite.)
export function useFavoriteArtists() {
  const inner = useFavoriteSet(ARTISTS_KEY);
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
