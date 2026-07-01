import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorReporter } from "@/components/GlobalErrorBoundary";
import { armBootWatchdog } from "@/lib/bootHeal";
import { setAuthToken } from "@/lib/queryClient";
import { setPreviewPass } from "@/lib/previewPass";

// Task #1631 — Cross-host purchase handoff pickup. After a sale on the buy
// funnel (get./store.goodtunes.music), the fan is redirected to
// my.goodtunes.music/album/:id#token=<fresh-bearer>&gtwelcome=1. The session
// cookie and the localStorage bearer token are both host-scoped, so the token
// in the fragment is the only thing that crosses subdomains. Consume it BEFORE
// React mounts so the first /api/me call is already authed — the album renders
// owned with no flash of the locked preview. We then scrub the token from the
// URL + history and leave `?gtwelcome=1` behind so AlbumDetail can pop the
// thank-you modal once. (Fragments are never sent to the server, so the bearer
// token never appears in an access log.)
try {
  const hash = window.location.hash;
  if (hash.startsWith("#token=") && hash.includes("gtwelcome")) {
    const params = new URLSearchParams(hash.slice(1));
    const t = params.get("token");
    if (t) setAuthToken(t);
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("gtwelcome", "1");
    window.history.replaceState({}, "", url.toString());
  }
} catch {}

// Task #1766 — staged-launch review "preview pass" pickup. The operator's
// "See Preview Flow" link lands on the get-host page with the pass in the URL
// fragment (#previewpass=<token>). Stash it BEFORE React mounts so the very
// first by-slug / buy-options call resolves the prepping release in staging
// mode, then scrub it from the URL + history (fragments never hit an access
// log, but a reviewer shouldn't accidentally re-share the live link with it).
// The pass is read-only by construction — the server rejects any checkout that
// carries it.
try {
  const hash = window.location.hash;
  if (hash.includes("previewpass=")) {
    const params = new URLSearchParams(hash.slice(1));
    const pp = params.get("previewpass");
    if (pp) {
      setPreviewPass(pp);
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }
  }
} catch {}

// View-as impersonation fragment pickup. A super-admin opens a new tab at
// /<portal>#viewas=<token>&viewaslabel=<enc> via the "View as this partner"
// button. Pick up the token + label BEFORE React mounts, stash in
// sessionStorage (tab-scoped — other tabs are unaffected), and scrub the
// fragment so the token never appears in access logs or the URL bar.
try {
  const hash = window.location.hash;
  if (hash.includes("viewas=")) {
    const params = new URLSearchParams(hash.slice(1));
    const vat = params.get("viewas");
    const val = params.get("viewaslabel");
    if (vat) {
      sessionStorage.setItem("gt:viewAsToken", vat);
      sessionStorage.setItem("gt:viewAsLabel", decodeURIComponent(val ?? "Partner portal"));
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }
  }
} catch {}

// Task #424 — Apply the admin light-theme body class BEFORE React mounts.
// Previously this lived in AdminFrame's useEffect, so any delay or
// failure in AdminFrame's render/commit left the fan-player's dark
// gradient (radial purple + brand bg) painted across the viewport. On
// iPad Safari that combo (`background-attachment: fixed` + radial
// gradients + html/body `overflow-x: hidden`) is enough to paint a
// blank dark-purple canvas even when the admin DOM tree is otherwise
// present. Setting the class here means body bg is light from the
// very first paint regardless of what happens downstream.
try {
  const h = window.location.host.toLowerCase().split(":")[0];
  const p = window.location.pathname || "";
  // Invited-partner portals are light admin surfaces too. Match their EXACT
  // landing paths (not prefixes — `/artist/:slug` is the dark fan artist page,
  // only the bare `/artist` is the portal) plus the invite-accept page so the
  // body is light from the very first paint with no dark flash.
  const lightPortal =
    p === "/artist" || p === "/label" || p === "/manager" ||
    p === "/vendor" || p === "/non-profit" || p === "/publisher" ||
    p === "/invite" || p.indexOf("/invite/") === 0;
  const isAdmin =
    h === "admin.goodtunes.music" || p.indexOf("/admin") === 0 || lightPortal;
  if (isAdmin) document.body.classList.add("gt-admin");
} catch {}

installGlobalErrorReporter();
createRoot(document.getElementById("root")!).render(<App />);

// Task #921 — Backstop the stale-bundle self-heal. If the shell hasn't
// painted anything into #root shortly after this entry runs, treat it as
// a failed boot and recover with one guarded reload (then fall through to
// a visible diagnosis if it's a genuinely broken deploy). The capture-
// phase <script>/<link> 404 listener in installGlobalErrorReporter()
// catches the common case faster; App clears the guard on real mount via
// markBootSucceeded(). Do NOT remove — this is what turns Bill's manual
// "just reload it" into an automatic recovery.
armBootWatchdog();
