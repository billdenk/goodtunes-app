import { useCallback, useEffect, useState } from "react";

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

  return { set, has, toggle, add, remove };
}

export function useFavoriteSongs() {
  return useFavoriteSet(SONGS_KEY);
}

export function useFavoriteArtists() {
  return useFavoriteSet(ARTISTS_KEY);
}
