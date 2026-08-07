// Admin/partner appearance (Light / Dark / System) — the Apple-canon dark
// theme for operator surfaces. docs/apple-canon.md: dark is the CHARCOAL
// ladder (#161617 canvas, #1c1c1e rail, #1e1e20 cards, #26262a raised,
// #3a3a3e chips) — NEVER navy; navy is fan-facing only.
//
// Mechanism: the `.gt-admin-dark` body class flips every `--apple-*` CSS
// variable (and the shadcn semantic tokens) defined in index.css. Pages
// that style through the variables — which is all of them, via the blanket
// `.gt-admin-dark` utility overrides — inherit dark automatically; no
// per-screen work. Fan surfaces are untouched: the class only ever rides
// alongside `gt-admin`.
//
// The choice persists in localStorage and "system" tracks the OS
// `prefers-color-scheme` live.

export type AdminAppearance = "light" | "dark" | "system";

const STORAGE_KEY = "gt:admin-appearance";
const DARK_CLASS = "gt-admin-dark";

export function getAdminAppearance(): AdminAppearance {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function resolveDark(pref: AdminAppearance): boolean {
  return pref === "dark" || (pref === "system" && systemPrefersDark());
}

const listeners = new Set<() => void>();

/** Paint the current preference onto <body>. Safe to call any time —
 * it only toggles the dark class; `gt-admin` scoping stays whoever's job
 * it already was (main.tsx boot / AdminFrame / OperatorShell). */
export function applyAdminAppearance(): void {
  const dark = resolveDark(getAdminAppearance());
  document.body.classList.toggle(DARK_CLASS, dark);
  listeners.forEach((fn) => fn());
}

export function setAdminAppearance(pref: AdminAppearance): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {}
  applyAdminAppearance();
}

/** True when the admin dark theme is currently painted. */
export function isAdminDark(): boolean {
  return document.body.classList.contains(DARK_CLASS);
}

/** Subscribe to appearance changes (returns unsubscribe). */
export function onAdminAppearanceChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Track the OS setting live while "system" is selected. Installed once at
// module load; cheap no-op when a fixed preference is set.
try {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getAdminAppearance() === "system") applyAdminAppearance();
    });
} catch {}
