import { useEffect, useState } from "react";

export type RecentPerson = {
  id: string;
  name: string;
  photoUrl: string | null;
};

const MAX_RECENTS = 6;
const STORAGE_KEY = "gt:admin:credit-recents";

type Listener = (list: RecentPerson[]) => void;

const listeners = new Set<Listener>();
let cached: RecentPerson[] | null = null;

function load(): RecentPerson[] {
  if (cached) return cached;
  if (typeof window === "undefined") {
    cached = [];
    return cached;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cached = [];
      return cached;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cached = [];
      return cached;
    }
    cached = parsed
      .filter(
        (p): p is RecentPerson =>
          p &&
          typeof p === "object" &&
          typeof p.id === "string" &&
          typeof p.name === "string",
      )
      .slice(0, MAX_RECENTS)
      .map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl ?? null }));
    return cached;
  } catch {
    cached = [];
    return cached;
  }
}

function persist(list: RecentPerson[]) {
  cached = list;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  }
  listeners.forEach((l) => l(list));
}

export function pushRecentPerson(person: RecentPerson) {
  if (!person?.id || !person?.name) return;
  const current = load();
  const next = [
    { id: person.id, name: person.name, photoUrl: person.photoUrl ?? null },
    ...current.filter((p) => p.id !== person.id),
  ].slice(0, MAX_RECENTS);
  persist(next);
}

export function usePersonCreditRecents(): RecentPerson[] {
  const [list, setList] = useState<RecentPerson[]>(() => load());
  useEffect(() => {
    const l: Listener = (next) => setList(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return list;
}
