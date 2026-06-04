import { Component, type ReactNode } from "react";
import { FriendlyError } from "@/components/FriendlyError";
import { reportBootFailure } from "@/lib/bootHeal";

/**
 * Customer-facing error boundary. Renders a dark, brand-styled card with
 * the actual error message + a short stack so when something throws on
 * mobile Safari we get a screenshot we can act on, instead of a silent
 * blank gradient. Wraps the whole Router in App.tsx.
 *
 * `installGlobalErrorReporter()` (called once from main.tsx) catches the
 * errors that React boundaries can't — pre-mount module-load failures,
 * window.onerror, unhandled promise rejections, AND failed asset/script
 * loads (capture-phase, Task #921) — and paints a minimal red banner
 * directly into the DOM so we still get a screenshot-able diagnosis when
 * React never even started.
 */

/**
 * Paint the minimal brand fatal banner straight into the DOM. Module-
 * level + exported so the boot self-heal (`@/lib/bootHeal`) can render
 * the same diagnosis when a stale-bundle reload has been exhausted,
 * without re-implementing the escaping/styling. Never throws.
 */
export function paintFatalBanner(kind: string, message: string, stack?: string) {
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
}

let installed = false;
export function installGlobalErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const paint = paintFatalBanner;
  // An error counts as "ours" if any frame in its stack references a URL on
  // our own origin, or — when the stack is empty — if the ErrorEvent's
  // `filename` is on our origin. Cross-origin scripts (Replit preview chrome,
  // iOS Safari extensions, injected userscripts) surface to `window.onerror`
  // as the opaque `"Script error."` with no stack and no filename; those are
  // foreign and must NOT paint the full-width red banner over our header.
  // Do NOT loosen this — painting foreign errors makes the app look broken
  // when it isn't (see task #406).
  const ourOrigin = window.location.origin;
  const isOurStack = (stack?: string) => {
    if (!stack) return false;
    const urlRe = /https?:\/\/[^\s)'"]+/g;
    const matches = stack.match(urlRe);
    if (!matches) return false;
    return matches.some((u) => u.startsWith(ourOrigin));
  };
  const isOurError = (stack: string | undefined, filename: string | undefined) => {
    if (isOurStack(stack)) return true;
    if (!stack && filename && filename.startsWith(ourOrigin)) return true;
    return false;
  };
  window.addEventListener("error", (ev) => {
    const e = ev as ErrorEvent;
    const err = e.error;
    const stack: string | undefined = err && err.stack;
    if (!isOurError(stack, e.filename)) {
      console.warn(
        "[global-error-reporter] ignoring foreign error",
        e.message,
        e.filename || "(no filename)",
      );
      return;
    }
    paint("Uncaught error", (err && (err.message || String(err))) || e.message || "(no message)", stack);
  });
  // Task #921 — Failed asset/script loads. A `<script>`/`<link>` 404 fires
  // an `error` event ON THE ELEMENT that does NOT bubble, so the
  // window-targeted listener above never sees it — that's the silent
  // white screen after a redeploy orphans a content-hashed bundle. We
  // must listen in the CAPTURE phase to catch it. Scoped to our own
  // origin the same way `isOurError` is: a foreign asset (preview chrome,
  // an extension, an analytics beacon) failing must NEVER paint a banner
  // over a healthy app (preserve Task #406). Broken <img>/<audio> are
  // intentionally ignored — a missing album cover is not a fatal boot
  // failure. A same-origin script/stylesheet 404 IS the stale-bundle
  // signature, so we also hand it to the boot self-heal for one guarded
  // reload (see @/lib/bootHeal).
  window.addEventListener(
    "error",
    (ev) => {
      const target = ev.target as (Element & { src?: string; href?: string; rel?: string }) | null;
      // Uncaught JS errors target `window` (handled above); only element-
      // targeted resource failures are interesting here.
      if (!target || !(target instanceof Element)) return;
      const tag = target.tagName;
      const isScript = tag === "SCRIPT";
      const isStylesheet = tag === "LINK" && (target as HTMLLinkElement).rel === "stylesheet";
      if (!isScript && !isStylesheet) return;
      const url = (target.src || target.href || "").toString();
      if (!url || !url.startsWith(ourOrigin)) {
        console.warn("[global-error-reporter] ignoring foreign asset load failure", url || "(no url)");
        return;
      }
      paint("Couldn't load a required file", url);
      reportBootFailure("Couldn't start the app", "A required file failed to load:\n" + url);
    },
    true,
  );
  window.addEventListener("unhandledrejection", (ev) => {
    const r: any = (ev as PromiseRejectionEvent).reason;
    const stack: string | undefined = r && r.stack;
    if (!isOurError(stack, undefined)) {
      console.warn(
        "[global-error-reporter] ignoring foreign rejection",
        (r && (r.message || String(r))) || "(no reason)",
      );
      return;
    }
    paint("Unhandled promise rejection", (r && (r.message || String(r))) || "(no reason)", stack);
  });
}

/**
 * Pull the throwing component's name out of React's `componentStack`.
 * Each frame looks like `\n    at AlbumDetail (...)` (or `at AlbumDetail`
 * with no location). The first frame is the component closest to the
 * throw; host elements (`div`, `span`, …) are lowercase so we skip them
 * and return the first real (capitalized) component, falling back to the
 * very first frame. Names are minified in prod unless the client build
 * keeps them — see `esbuild.keepNames` in vite.config.ts. Never throws.
 */
export function parseComponentName(componentStack?: string | null): string | null {
  if (!componentStack) return null;
  try {
    const frames: string[] = [];
    const re = /\n?\s*(?:at|in)\s+([A-Za-z0-9$_.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(componentStack)) !== null) frames.push(m[1]);
    if (frames.length === 0) return null;
    const component = frames.find((f) => /^[A-Z]/.test(f));
    return component ?? frames[0];
  } catch {
    return null;
  }
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
    // Self-diagnosing context (Task #1259): name the throwing component +
    // capture the route AT THROW-TIME so the report points at the screen
    // that broke even if the user navigates before tapping "Send".
    const componentName = parseComponentName(this.state.info);
    const route =
      typeof window !== "undefined" ? window.location.pathname + window.location.search : null;
    return (
      <div data-testid="global-error-boundary">
        <FriendlyError
          headline="Something went wrong"
          explanation="The app hit an unexpected snag. Try again or reload — and if it keeps happening, tap below so we can take a look."
          context={{ source: "global-boundary", componentName, route }}
          error={{ name: e.name || "Error", message: e.message || "(no message)", stack: composedStack }}
          onRetry={this.reset}
          onReload={this.reload}
          testIdPrefix="global-error"
        />
      </div>
    );
  }
}
