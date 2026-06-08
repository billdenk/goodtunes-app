import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getPreviewPass } from "./previewPass";

const TOKEN_KEY = "goodtunes_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  // Task #1766 — attach the staged-launch review "preview pass" (if present)
  // on every request so a prepping release resolves in staging mode for the
  // reviewer. The server never lets a request carrying a pass complete a
  // charge, so this is read-only by construction.
  const pass = getPreviewPass();
  if (pass) headers["X-Preview-Pass"] = pass;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders() };
  if (data) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Fetch a binary resource (e.g. the GoodDeed cert PDF) with the fan's
// Bearer token attached, returning the blob. A plain anchor/navigation
// can't carry the token (auth is a header, not a cookie), so owners hit
// "Sign in required" — this helper threads the same auth header that
// apiRequest uses. Throws an Error tagged with `.status` on a non-OK
// response so callers can show a friendly 401/403 message.
export class FetchBlobError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FetchBlobError";
    this.status = status;
  }
}

export async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        message = j.message ?? text ?? message;
      } catch {
        message = text || message;
      }
    } catch {}
    throw new FetchBlobError(res.status, message);
  }
  return res.blob();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: authHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
