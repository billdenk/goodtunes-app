import { Component, type ReactNode } from "react";
import { FriendlyError } from "@/components/FriendlyError";

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
    const stack = (e.stack ?? "").split("\n").slice(0, 12).join("\n");
    const comp = (this.state.info ?? "").split("\n").slice(0, 12).join("\n");
    const composedStack = [stack, comp && `\nComponent stack:\n${comp}`].filter(Boolean).join("\n");
    return (
      <div data-testid="global-error-boundary">
        <FriendlyError
          headline="Something went wrong"
          explanation="The app hit an unexpected snag. Try again or reload — and if it keeps happening, tap below so we can take a look."
          context={{ source: "global-boundary" }}
          error={{ name: e.name || "Error", message: e.message || "(no message)", stack: composedStack }}
          onRetry={this.reset}
          onReload={this.reload}
          testIdPrefix="global-error"
        />
      </div>
    );
  }
}
