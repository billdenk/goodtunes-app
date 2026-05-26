import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorReporter } from "@/components/GlobalErrorBoundary";

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
  const isAdmin = h === "admin.goodtunes.music" || p.indexOf("/admin") === 0;
  if (isAdmin) document.body.classList.add("gt-admin");
} catch {}

installGlobalErrorReporter();
createRoot(document.getElementById("root")!).render(<App />);
