import { Component, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { sendErrorReport } from "@/lib/errorReport";

/**
 * Task #424 — Top-level safety net for the admin shell.
 *
 * The existing `AdminErrorBoundary` inside `AdminFrame` only wraps
 * `{children}` — i.e. the per-page editor body. If `AdminFrame` itself
 * throws during render (a sidebar query, a framer-motion hook, a
 * device-specific CSS-induced exception, etc.), that boundary never
 * sees the error and we'd silently fall back to the global player
 * boundary further up the tree. In the iPad Safari blank-shell
 * incident, the symptom was even worse: render succeeded but the
 * chrome painted invisibly, so the user saw a blank dark canvas and
 * no diagnostic.
 *
 * This boundary wraps every admin route at the App level. On a throw
 * it paints a visible, light-bg "Admin failed to load — reload"
 * card with the error message, so we never ship another silent blank
 * regression in the admin shell.
 */
export class AdminShellErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string | null }
> {
  state = { error: null as Error | null, info: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[AdminShellErrorBoundary]", error, info);
    this.setState({ info: info?.componentStack ?? null });
    // Task #426 — forward the crash to the error-report inbox so a
    // real iPad/admin regression pings us automatically instead of
    // relying on someone happening to look at the visible card.
    // Failures stay silent: we don't want a broken send to make the
    // already-bad crash card worse.
    try {
      const cached = queryClient.getQueryData<{ email?: string | null } | null>(["/api/me"]);
      const reporterEmail = cached?.email ?? null;
      void sendErrorReport({
        summary: "The admin shell crashed during render.",
        context: {
          source: "admin-shell",
          step: info?.componentStack ? "componentDidCatch" : null,
          serverBody: info?.componentStack ?? null,
        },
        error: {
          name: error?.name ?? null,
          message: error?.message ?? null,
          stack: error?.stack ?? null,
        },
        reporterEmail,
      }).catch(() => {});
    } catch {
      // never let the reporter make the crash card worse
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    const stack = (e.stack ?? "").split("\n").slice(0, 10).join("\n");
    const comp = (this.state.info ?? "").split("\n").slice(0, 10).join("\n");
    return (
      <main
        className="min-h-screen w-full bg-slate-50 text-slate-900 p-6 sm:p-10 overflow-auto"
        data-testid="admin-shell-error-boundary"
      >
        <div className="max-w-2xl mx-auto rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-rose-900">
            Admin failed to load
          </div>
          <div className="text-sm text-rose-800/80 mt-1">
            Something in the admin shell threw an error during render. Try
            reloading; if it keeps happening, check the browser console and
            server logs for the trace below.
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-9 px-4 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
              data-testid="button-admin-shell-reload"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null, info: null })}
              className="h-9 px-4 rounded-md border border-slate-300 text-slate-900 text-sm font-semibold hover:bg-slate-100"
              data-testid="button-admin-shell-retry"
            >
              Try again
            </button>
          </div>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="font-mono font-bold text-slate-900 mb-1 break-all">
              {e.name || "Error"}: {e.message || "(no message)"}
            </div>
            {stack && (
              <pre className="font-mono text-xs whitespace-pre-wrap break-all text-slate-700">
{stack}
              </pre>
            )}
            {comp && (
              <pre className="font-mono text-xs whitespace-pre-wrap break-all text-slate-600 mt-2">
Component stack:
{comp}
              </pre>
            )}
          </div>
        </div>
      </main>
    );
  }
}
