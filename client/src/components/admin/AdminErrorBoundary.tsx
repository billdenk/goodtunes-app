import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/queryClient";

/**
 * Recoverable error UI for admin pages. Extracted from AdminReports so
 * every admin index page can wrap itself in the same boundary (and so
 * the AdminFrame children area can wrap them all by default).
 *
 * Task #139 made the Reports page resilient — if an endpoint errors,
 * the user sees a recoverable error card instead of a blank screen.
 * Task #147 fans that pattern out: the next prod schema drift won't
 * blank Albums / People / Vendors / Orders silently — the boundary
 * catches the render crash and the operator can hit "Try again".
 */

/** Throw on non-OK so React Query flips into isError. */
export async function fetchJson(url: string): Promise<any> {
  // Task #2487 — carry the same auth context the shared `apiRequest` sends:
  // the Bearer token, the staged-launch preview pass, and crucially the
  // `X-View-As-Token` header. Without the view-as token the server resolved
  // an operator's "View as this partner" report calls to their own bare
  // super_admin scope (god-view) and leaked every other partner's releases
  // and metrics into the scoped portal. Sending it makes the server resolve
  // the impersonated artist's hat so the reports scope to that artist only.
  const res = await fetch(url, { credentials: "include", headers: authHeaders() });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export function extractErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this page",
  testId,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
  testId?: string;
}) {
  const message = extractErrorMessage(error, "Something went wrong loading this page.");
  return (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50/60 p-5 text-sm"
      data-testid={testId ?? "error-state"}
    >
      <div className="font-medium text-rose-900">{title}</div>
      <div className="text-rose-800/80 mt-1 break-words">{message}</div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-3 h-8 border-rose-300 text-rose-900 hover:bg-rose-100"
        data-testid="button-retry"
      >
        Try again
      </Button>
    </div>
  );
}

export function LoadingState({ testId }: { testId?: string }) {
  return (
    <div className="py-12 text-slate-500 text-sm" data-testid={testId ?? "loading-state"}>
      Loading…
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  /** Title shown in the error card. Defaults to a generic admin message. */
  title?: string;
  /** test id for the boundary card. */
  testId?: string;
}

export class AdminErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // Log so a future investigator can find it; the UI already shows
    // a recoverable error card.
    console.error("[AdminErrorBoundary] render error:", error);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      const title = this.props.title ?? "This page hit an error";
      return (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-sm"
          data-testid={this.props.testId ?? "admin-error-boundary"}
        >
          <div className="font-semibold text-rose-900">{title}</div>
          <div className="text-rose-800/80 mt-1 break-words">
            {this.state.error.message || "An unexpected error occurred."}
          </div>
          <div className="text-rose-800/60 mt-2 text-xs">
            If this keeps happening, the database schema may have drifted from the
            app. Check the server logs and the prod schema.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={this.reset}
            className="mt-3 h-8 border-rose-300 text-rose-900 hover:bg-rose-100"
            data-testid="button-reset-error-boundary"
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
