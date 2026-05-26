// Task #454 — Path-to-press chip navigation.
//
// The chips live in PressingOrderStepper (rendered above the admin
// album tabs). The targets they jump to live in different components
// (the cover-art thumbnail in AdminAlbum, the Formats card + per-SKU
// inputs in SellPanel, the Go-to-Press button at the bottom of
// SellPanel). Rather than thread imperative refs across that whole
// tree, the stepper dispatches a window CustomEvent and each owner
// component listens for it and handles its own anchor. Cheap, no
// context plumbing, survives the SellPanel re-mounting on tab switch.

export type PathToPressKey = "package" | "art" | "price" | "quantity" | "submit";

export const PATH_TO_PRESS_NAVIGATE_EVENT = "pathToPress:navigate";

export type PathToPressNavigateDetail = { key: PathToPressKey };

// Module-level slot for the most recently dispatched key. SellPanel
// isn't mounted when the operator is on Overview/Tracks/Bonus, so when
// AdminAlbum's listener flips the page to the Sell tab the SellPanel's
// own listener arrives a tick too late and misses the live event. The
// pending slot lets SellPanel "drain" the most recent key on mount.
// Auto-clears after ~1.5s so a stale chip click can't fire much later.
let pendingNavigateKey: PathToPressKey | null = null;

export function consumePendingPathToPressKey(): PathToPressKey | null {
  const k = pendingNavigateKey;
  pendingNavigateKey = null;
  return k;
}

export function dispatchPathToPressNavigate(key: PathToPressKey): void {
  if (typeof window === "undefined") return;
  pendingNavigateKey = key;
  window.dispatchEvent(
    new CustomEvent<PathToPressNavigateDetail>(PATH_TO_PRESS_NAVIGATE_EVENT, {
      detail: { key },
    }),
  );
  window.setTimeout(() => {
    if (pendingNavigateKey === key) pendingNavigateKey = null;
  }, 1500);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll `el` into view, optionally focus it, and flash the brand-blue
 *  ring for ~1.2s so the eye catches where the page jumped to. Uses
 *  inline boxShadow rather than a Tailwind class so the cue layers
 *  cleanly on top of whatever existing focus styles the target has. */
export function scrollAndFlash(
  el: HTMLElement | null | undefined,
  opts: { focus?: boolean } = {},
): void {
  if (!el) return;
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  try {
    el.scrollIntoView({ behavior, block: "center" });
  } catch {
    el.scrollIntoView();
  }
  if (opts.focus !== false) {
    // Defer focus a tick so the smooth scroll has started before the
    // browser tries to reveal the focused element.
    requestAnimationFrame(() => {
      try {
        (el as HTMLElement & { focus: (o?: { preventScroll?: boolean }) => void }).focus({
          preventScroll: true,
        });
      } catch {
        try { el.focus(); } catch { /* noop */ }
      }
    });
  }
  const prevShadow = el.style.boxShadow;
  const prevTransition = el.style.transition;
  el.style.transition = "box-shadow 200ms ease-out";
  el.style.boxShadow =
    "0 0 0 2px var(--brand-blue), 0 0 0 5px rgba(49, 158, 216, 0.25)";
  window.setTimeout(() => {
    el.style.boxShadow = prevShadow;
    window.setTimeout(() => {
      el.style.transition = prevTransition;
    }, 220);
  }, 1200);
}
