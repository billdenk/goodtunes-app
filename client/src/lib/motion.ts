import type { Transition } from "framer-motion";

// Shared motion language for the GoodTunes player + sheets.
//
// One source of truth so every overlay opens and closes the same way as the
// full-screen player + mini-player/bottom-nav dock: a springy overshoot on
// open, a quick eased settle on close. Always gate with prefers-reduced-
// motion via the helpers below so call sites honor the OS setting for free.
//
// Transform/opacity only at the call sites (translateY + fade) — never add a
// new backdrop-blur layer to animate, per the iOS-WebKit stacked-blur memo.

export const EASE_OUT: [number, number, number, number] = [0.32, 0.72, 0, 1];

const sheetOpenSpring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
const sheetCloseTween: Transition = { duration: 0.3, ease: EASE_OUT };
const sheetOpenReduced: Transition = { duration: 0.2, ease: EASE_OUT };
const sheetCloseReduced: Transition = { duration: 0.16, ease: EASE_OUT };

// Bottom-sheet open/close transitions, reduced-motion aware.
export const sheetOpen = (reduce: boolean): Transition => (reduce ? sheetOpenReduced : sheetOpenSpring);
export const sheetClose = (reduce: boolean): Transition => (reduce ? sheetCloseReduced : sheetCloseTween);

// Scrim (dimmed backdrop) fade — pairs with the sheet slide. Reduced-motion
// users get a near-instant fade so the dim still appears without animating.
export const scrimFade = (reduce: boolean): Transition =>
  reduce ? { duration: 0.05, ease: EASE_OUT } : { duration: 0.22, ease: EASE_OUT };

// A small popover/menu that bounces open from its anchor (title menu, etc.).
export const popBounce = (reduce: boolean): Transition =>
  reduce ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 22, mass: 0.8 };

// Press feedback scale used across tappable surfaces (rows, chips, buttons)
// so a tap "gives" by the same amount everywhere.
export const PRESS_SCALE = 0.96;
