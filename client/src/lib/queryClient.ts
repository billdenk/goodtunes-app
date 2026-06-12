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

// Error thrown by `apiRequest` / the default query fetcher on a non-OK
// response. `message` stays clean/non-leaky (`${status}: ${message}` — never
// a raw HTML/edge-proxy body); the parsed JSON body and status are attached
// as structured fields so callers can recover a typed payload (e.g. a 409's
// `{ vendor, parentCandidate }`) without re-parsing the message string.
export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

// Read the structured JSON body the API client attached to a thrown error
// (undefined when the response had no JSON body). Prefer this over parsing
// `err.message`, which only carries the human-readable `message` field.
export function apiErrorBody<T = unknown>(err: unknown): T | undefined {
  if (err && typeof err === "object" && "body" in err) {
    return (err as ApiError).body as T | undefined;
  }
  return undefined;
}

// Read the HTTP status the API client attached to a thrown error.
export function apiErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    return (err as ApiError).status;
  }
  return undefined;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Never let a raw response body (notably an edge-proxy HTML 403/5xx page)
    // leak into `err.message`. Prefer a JSON `message`; otherwise fall back to
    // a clean status-based message. The `${status}: ${message}` shape is kept
    // for backward compatibility with callers that key off the leading code.
    let message = res.statusText || "Request failed";
    let parsedBody: unknown;
    try {
      const text = await res.text();
      const trimmed = (text || "").trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const j = JSON.parse(trimmed);
          // Keep the full parsed body so callers can recover structured
          // payloads (e.g. a duplicate-domain 409's `vendor` / `parentCandidate`)
          // without JSON-parsing it back out of the message string.
          parsedBody = j;
          if (j && typeof j.message === "string" && j.message.trim()) {
            message = j.message.trim();
          }
        } catch {
          // Malformed JSON — keep the generic status message.
        }
      }
      // Any non-JSON body (HTML doctype pages, plain text) is intentionally
      // discarded; we only surface the status-based message above.
    } catch {
      // Body already consumed / unreadable — keep the generic status message.
    }
    const err = new Error(`${res.status}: ${message}`) as ApiError;
    err.status = res.status;
    if (parsedBody !== undefined) err.body = parsedBody;
    throw err;
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
