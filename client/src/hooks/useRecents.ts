import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { FanRecent, FanRecentKind } from "@shared/schema";

// Server-backed fan recents (Task #530). Replaces the in-memory
// `recentAlbums` list in PlayerContext as the source of truth for the
// "Recents" tab; the album carousel on Collection still derives from
// the same list (so it survives logout + device-switch).
//
// We post fire-and-forget — a failed write must never block the
// surface the fan just opened. Anonymous callers no-op locally.

export type RecordRecentInput = {
  entityKind: FanRecentKind;
  entityId: string;
  title: string;
  subtitle?: string | null;
  thumbUrl?: string | null;
  href: string;
};

export function useFanRecents() {
  const { user } = useAuth();
  return useQuery<FanRecent[]>({
    queryKey: ["/api/me/recents"],
    enabled: !!user && user.kind !== "admin",
  });
}

export function useRecordRecent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    (input: RecordRecentInput) => {
      if (!user || user.kind === "admin") return;
      apiRequest("POST", "/api/me/recents", input)
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/me/recents"] }))
        .catch(() => {});
    },
    [user, queryClient],
  );
}

export function useRemoveRecent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/me/recents/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/recents"] }),
  });
}

export function useClearRecents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/me/recents");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/recents"] }),
  });
}

// fan_recent_searches row — both text-only searches (entity_* null)
// and entity-tap rows live here. Search-landing renders both from a
// single query and Clear wipes the entire surface in one call.
export type RecentSearchRow = {
  userId: string;
  queryNorm: string;
  displayQuery: string;
  entityKind: string | null;
  entityId: string | null;
  title: string | null;
  subtitle: string | null;
  thumbUrl: string | null;
  href: string | null;
  lastAt: string;
};

export function useRecentSearches() {
  const { user } = useAuth();
  return useQuery<RecentSearchRow[]>({
    queryKey: ["/api/me/recent-searches"],
    enabled: !!user && user.kind !== "admin",
  });
}

export function useRecordSearch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || !user || user.kind === "admin") return;
      apiRequest("POST", "/api/me/recent-searches", { query: trimmed })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/me/recent-searches"] }))
        .catch(() => {});
    },
    [user, queryClient],
  );
}

// Stamp an entity tap to fan_recent_searches (search-landing history)
// at the same moment the same tap stamps fan_recents (Recents tab).
// Kept separate from useRecordRecent so callers can opt into one or
// both — Search.tsx onPick uses both; PlayerContext.playSong uses only
// the Recents one.
export function useRecordSearchEntity() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    (input: RecordRecentInput) => {
      if (!user || user.kind === "admin") return;
      apiRequest("POST", "/api/me/recent-searches", input)
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/me/recent-searches"] }))
        .catch(() => {});
    },
    [user, queryClient],
  );
}

export function useClearRecentSearches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/me/recent-searches");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/recent-searches"] }),
  });
}
