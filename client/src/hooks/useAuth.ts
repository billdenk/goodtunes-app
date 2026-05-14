import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken, getAuthToken } from "@/lib/queryClient";

interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  realName?: string | null;
  photoUrl?: string | null;
  isAdmin?: boolean;
}

interface AuthResponse extends AuthUser {
  token: string;
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

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Login failed");
      }
      return res.json() as Promise<AuthResponse>;
    },
    onSuccess: (data) => {
      if (data.token) setAuthToken(data.token);
      const { token, ...user } = data;
      queryClient.setQueryData(["/api/me"], user);
      queryClient.invalidateQueries();
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
      if (data.token) setAuthToken(data.token);
      const { token, ...user } = data;
      queryClient.setQueryData(["/api/me"], user);
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      setAuthToken(null);
      queryClient.setQueryData(["/api/me"], null);
      queryClient.clear();
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { displayName?: string; username?: string; realName?: string | null }) => {
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
