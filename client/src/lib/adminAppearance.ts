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

import { useSyncExternalStore } from "react";

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

// ---------------------------------------------------------------------------
// Dark-mark logo detection — some partner logos are black marks on a
// transparent background (SVGs, or PNG badges like Memphis Record Pressing's).
// Those disappear on the charcoal dark canvas and need a white invert; colored
// logos and photos must be left alone. Extension checks aren't enough (Memphis
// is a PNG), so we sample the image once: draw it into a small canvas and
// average the luminance of its opaque pixels. Same-origin `/objects/` uploads
// draw cleanly; a tainted/cross-origin failure just means "not a dark mark".
const darkMarkCache = new Map<string, boolean>();

function sampleIsDarkMark(url: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let opaque = 0;
        let lumSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 32) continue;
          opaque++;
          lumSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        if (opaque === 0) return resolve(null);
        resolve(lumSum / opaque < 70);
      } catch {
        resolve(null); // tainted canvas / decode issue — fall back to the URL heuristic
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const isSvgUrl = (url: string) => /\.svg(\?|#|$)/i.test(url);

/** Same-origin check for logo URLs: our own uploads (relative `/objects/…`
 * paths or absolute URLs on this host) sample cleanly and, when they're SVGs,
 * are dark marks often enough to assume so. Cross-origin URLs can NEVER be
 * verified (CORS taints the canvas), so they must never invert on a guess —
 * a colored external SVG brand recolored white is worse than a dark one
 * staying dim. */
function isSameOriginLogoUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Fallback verdict when pixel sampling hasn't resolved or can't run
 * (tainted canvas, decode failure): only same-origin SVG uploads are assumed
 * dark marks; every raster and every cross-origin URL is left untouched. */
export function darkMarkFallback(url: string): boolean {
  return isSvgUrl(url) && isSameOriginLogoUrl(url);
}

/** Test seam — prime the session cache so component tests can pin the
 * invert behavior without a canvas. */
export function primeDarkMarkCacheForTest(url: string, dark: boolean): void {
  darkMarkCache.set(url, dark);
}

/** React hook — true when `url` is a near-black mark (suitable for a white
 * invert on a dark backdrop). Everything — SVGs included — is pixel-sampled
 * once and cached for the session; SVGs are white marks often enough (e.g.
 * `/logo-mrp-white.svg`) that assuming dark by extension is wrong. When
 * sampling can't run or hasn't resolved yet, `darkMarkFallback` applies:
 * same-origin SVG uploads read as dark marks, everything else stays raw. */
export function useDarkMarkLogo(url: string | null | undefined): boolean {
  const subscribe = (fn: () => void) => {
    if (url && !darkMarkCache.has(url)) {
      sampleIsDarkMark(url).then((dark) => {
        darkMarkCache.set(url, dark ?? darkMarkFallback(url));
        fn();
      });
    }
    return () => {};
  };
  const getSnapshot = () => {
    if (!url) return false;
    return darkMarkCache.get(url) ?? darkMarkFallback(url);
  };
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** React hook — re-renders when the operator toggles Light/Dark/System.
 * Reads the painted dark state via `isAdminDark()`, subscribing to the same
 * listeners `applyAdminAppearance()` notifies. Use in pages that need to pick
 * dark-only token values inline (e.g. frosted popover shadows, disc rims). */
export function useAdminDark(): boolean {
  return useSyncExternalStore(onAdminAppearanceChange, isAdminDark, () => false);
}

// Dev-only screenshot helper — `?gtAppearance=dark|light|system` persists the
// preference (same localStorage key the Settings toggle writes). Never active
// in production builds.
try {
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(window.location.search).get("gtAppearance");
    if (v === "light" || v === "dark" || v === "system") setAdminAppearance(v);
  }
} catch {}

// Track the OS setting live while "system" is selected. Installed once at
// module load; cheap no-op when a fixed preference is set.
try {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getAdminAppearance() === "system") applyAdminAppearance();
    });
} catch {}
