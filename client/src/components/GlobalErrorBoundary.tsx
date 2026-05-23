import { Component, type ReactNode } from "react";

/**
 * Customer-facing error boundary. Renders a dark, brand-styled card with
 * the actual error message + a short stack so when something throws on
 * mobile Safari we get a screenshot we can act on, instead of a silent
 * blank gradient. Wraps the whole Router in App.tsx.
 *
 * `installGlobalErrorReporter()` (called once from main.tsx) catches the
 * errors that React boundaries can't — pre-mount module-load failures,
 * window.onerror, and unhandled promise rejections — and paints a
 * minimal red banner directly into the DOM so we still get a
 * screenshot-able diagnosis when React never even started.
 */

let installed = false;
export function installGlobalErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const paint = (kind: string, message: string, stack?: string) => {
    try {
      const id = "__gt_fatal_banner";
      const existing = document.getElementById(id);
      if (existing) existing.remove();
      const el = document.createElement("div");
      el.id = id;
      el.setAttribute("data-testid", "global-fatal-banner");
      el.style.cssText = [
        "position:fixed",
        "left:0",
        "right:0",
        "top:0",
        "z-index:2147483647",
        "background:#FF5470",
        "color:white",
        "font:600 12px/1.4 -apple-system,system-ui,sans-serif",
        "padding:10px 12px",
        "max-height:50vh",
        "overflow:auto",
        "border-bottom:1px solid rgba(0,0,0,0.2)",
      ].join(";");
      const safeMsg = String(message).slice(0, 800);
      const safeStack = stack ? String(stack).split("\n").slice(0, 5).join("\n") : "";
      el.innerHTML =
        '<div style="font-weight:700;margin-bottom:4px">' +
        kind +
        '</div><div style="font-family:ui-monospace,monospace;font-weight:400;white-space:pre-wrap;word-break:break-all">' +
        safeMsg.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)) +
        "</div>" +
        (safeStack
          ? '<pre style="margin:6px 0 0;font:400 10px/1.3 ui-monospace,monospace;opacity:0.85;white-space:pre-wrap;word-break:break-all">' +
            safeStack.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)) +
            "</pre>"
          : "");
      (document.body || document.documentElement).appendChild(el);
    } catch {
      /* never throw from the error reporter */
    }
  };
  window.addEventListener("error", (ev) => {
    const err = (ev as ErrorEvent).error;
    paint("Uncaught error", (err && (err.message || String(err))) || (ev as ErrorEvent).message || "(no message)", err && err.stack);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r: any = (ev as PromiseRejectionEvent).reason;
    paint("Unhandled promise rejection", (r && (r.message || String(r))) || "(no reason)", r && r.stack);
  });
}

export class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[GlobalErrorBoundary]", error, info);
    this.setState({ info: info?.componentStack ?? null });
  }
  reset = () => this.setState({ error: null, info: null });
  reload = () => window.location.reload();
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    const stack = (e.stack ?? "").split("\n").slice(0, 6).join("\n");
    const comp = (this.state.info ?? "").split("\n").slice(0, 6).join("\n");
    return (
      <main
        className="min-h-screen w-full bg-[#00062B] text-white p-5 overflow-auto"
        data-testid="global-error-boundary"
      >
        <div className="max-w-[440px] mx-auto pt-10">
          <h1 className="text-[22px] font-bold mb-1">Something broke</h1>
          <p className="text-white/70 text-[13px] mb-4">
            Screenshot this and send it over — it tells us exactly what crashed.
          </p>
          <div className="rounded-xl bg-[#FF5470]/10 border border-[#FF5470]/30 p-4 mb-4">
            <div className="text-[#FF5470] font-semibold text-[14px] mb-2">
              {e.name || "Error"}
            </div>
            <div className="text-white text-[13px] break-words mb-3 font-mono">
              {e.message || "(no message)"}
            </div>
            {stack && (
              <pre className="text-white/60 text-[10px] font-mono whitespace-pre-wrap break-all mb-2">
                {stack}
              </pre>
            )}
            {comp && (
              <pre className="text-white/40 text-[10px] font-mono whitespace-pre-wrap break-all">
                {comp}
              </pre>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 h-11 rounded-lg bg-[#319ED8] text-white font-semibold text-[14px] active:opacity-70"
              data-testid="button-error-retry"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="flex-1 h-11 rounded-lg bg-white/10 text-white font-semibold text-[14px] active:opacity-70"
              data-testid="button-error-reload"
            >
              Reload
            </button>
          </div>
        </div>
      </main>
    );
  }
}
