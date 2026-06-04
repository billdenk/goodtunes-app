import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken, getAuthToken } from "@/lib/queryClient";
import { identifyAnalyticsUser, track } from "@/lib/analytics";

interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  realName?: string | null;
  photoUrl?: string | null;
  isAdmin?: boolean;
  kind?: "admin" | "customer";
  // Task #537 — finish-signup gating fields. `signupCompletedAt` is
  // null for OAuth-minted fans until they submit /finish-setup; the
  // router redirects them there on every nav until it's stamped.
  // `isPrivateRelay` is server-computed from the email so the picker
  // can require a deliverable contact email/phone when true.
  handle?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  signupCompletedAt?: string | null;
  isPrivateRelay?: boolean;
  // Task #734 — fan's chosen streaming service for stream-elsewhere
  // handoffs ("spotify" | "apple_music"). Null until they pick one.
  favoriteStreamingService?: string | null;
  // Task #1251 — caller's resolved admin role + (for partner roles)
  // their scope id and display name. God roles (super_admin/admin) carry
  // a null scope. Used to skip the "Who's the artist?" picker for
  // artist-role users and label the auto-attached artist.
  role?: string | null;
  roleScopeId?: string | null;
  roleScopeName?: string | null;
}

// Login can return one of:
//   { ...AuthUser, token }                    — customer success (or admin OAuth post-TOTP)
//   { requires2fa: true, userId, kind }       — admin password OK, ask for TOTP
//   { requiresEnrollment: true, userId, kind } — admin password OK, enroll TOTP
interface AuthResponse extends Partial<AuthUser> {
  token?: string;
  requires2fa?: boolean;
  requiresEnrollment?: boolean;
  userId?: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/me"],
    queryFn: async () => {
      const token = getAuthToken();
      const res = await fetch("/api/me", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // Stitch analytics events to the authenticated user (or clear on sign-out).
  // Runs whenever /api/me resolves so refreshes / OAuth round-trips re-identify.
  useEffect(() => {
    identifyAnalyticsUser(user?.id ?? null);
  }, [user?.id]);

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      // On the dev/preview host there's no admin.* vs my.* split, so the
      // server can't pick admin vs customer from the host. Pass an explicit
      // ?kind=admin when we're on the admin shell (server honors it via
      // kindFromRequest's query override).
      const isAdminShell = window.location.pathname.startsWith("/admin");
      const url = isAdminShell ? "/api/login?kind=admin" : "/api/login";
      // Send `kind` in the body too — the server accepts a body-level
      // override and it's the only signal that survives if a proxy or
      // misconfigured route strips the query string.
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, kind: isAdminShell ? "admin" : "customer" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Login failed");
      }
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      // Only stash + redirect on a real token — TOTP follow-ups have no
      // token yet and the caller (Login.tsx) handles the next step.
      if (data.token) {
        setAuthToken(data.token);
        const { token, requires2fa, requiresEnrollment, userId, ...user } = data;
        queryClient.setQueryData(["/api/me"], user);
        queryClient.invalidateQueries();
      }
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { username: string; email: string; displayName: string; realName?: string | null; password: string }) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Registration failed");
      }
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      if (data.token) {
        setAuthToken(data.token);
        const { token, ...user } = data;
        queryClient.setQueryData(["/api/me"], user);
        queryClient.invalidateQueries();
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Fire sign_out before clearing the session — the analytics SDK
      // stitches it to the still-known userId so the event lands on the
      // correct identity. We capture the auth kind from the cached `/api/me`
      // response so admin vs customer sign-outs are distinguishable in the
      // funnel.
      try {
        const me = queryClient.getQueryData<AuthUser | null>(["/api/me"]);
        track("sign_out", { kind: me?.kind });
      } catch {}
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      setAuthToken(null);
      queryClient.setQueryData(["/api/me"], null);
      queryClient.clear();
      identifyAnalyticsUser(null);
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { displayName?: string; username?: string; realName?: string | null; favoriteStreamingService?: string | null }) => {
      const res = await apiRequest("PUT", "/api/me", data);
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/me"], data);
    },
  });

  const updatePhotoMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      const res = await apiRequest("PUT", "/api/me/photo", { dataUrl });
      return res.json() as Promise<{ photoUrl: string | null }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AuthUser | null>(["/api/me"], (prev) =>
        prev ? { ...prev, photoUrl: data.photoUrl } : prev,
      );
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/me/photo");
      return res.json() as Promise<{ photoUrl: string | null }>;
    },
    onSuccess: () => {
      queryClient.setQueryData<AuthUser | null>(["/api/me"], (prev) =>
        prev ? { ...prev, photoUrl: null } : prev,
      );
    },
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    updateProfile: updateProfileMutation.mutateAsync,
    updatePhoto: updatePhotoMutation.mutateAsync,
    removePhoto: removePhotoMutation.mutateAsync,
    isLoginPending: loginMutation.isPending,
    isRegisterPending: registerMutation.isPending,
    isUpdatePending: updateProfileMutation.isPending,
    isPhotoPending: updatePhotoMutation.isPending,
    loginError: loginMutation.error?.message,
    registerError: registerMutation.error?.message,
    updateError: updateProfileMutation.error?.message,
  };
}
