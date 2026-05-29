import { useEffect, useState } from "react";

// Task #722 — keyboard-aware mobile search.
//
// Reports how many CSS pixels the on-screen keyboard currently covers at
// the bottom of the layout viewport, so fixed-to-bottom UI (the fan
// search field + its results overlay) can lift itself above the keyboard
// instead of hiding behind it.
//
// On iOS Safari / in-app webviews the keyboard floats OVER the page —
// `window.innerHeight` stays put while `visualViewport.height` shrinks.
// The covered region is therefore:
//
//   innerHeight - (visualViewport.height + visualViewport.offsetTop)
//
// `offsetTop` accounts for the page being scrolled up to reveal the
// focused input. We clamp to >= 0 and treat sub-threshold values as 0 so
// browser-chrome jitter (URL bar collapse, etc.) doesn't register as a
// keyboard. Returns 0 when the API is unavailable (older browsers,
// desktop) so callers fall back to their normal bottom-dock layout.
//
// Per the iOS-WebKit memo we touch nothing GPU-heavy here — this is a
// pure measurement listener, no new backdrop-blur surfaces.

// Below this, treat the gap as browser-chrome noise rather than a keyboard.
const KEYBOARD_THRESHOLD = 120;

export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) {
      setInset(0);
      return;
    }

    const measure = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(covered > KEYBOARD_THRESHOLD ? Math.round(covered) : 0);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [active]);

  return active ? inset : 0;
}
