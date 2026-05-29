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
// Task #753 — anchor `innerHeight` to the value captured the moment
// search opens (i.e. BEFORE the keyboard rises). On iOS Safari focusing
// an input collapses the bottom address bar into its pill, which inflates
// `window.innerHeight` by ~the toolbar's height. Measuring `covered`
// against that inflated value over-counted the keyboard region and lifted
// the field too high, exposing Safari's address pill + the form accessory
// bar in the gap between the field and the keyboard. Keeping the SMALLEST
// innerHeight we observe while active neutralizes that inflation, and is a
// no-op on browsers whose innerHeight doesn't move on focus.
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

    // Smallest layout-viewport height seen since search opened — the
    // address-bar-expanded (pre-pill) baseline. See the file header note.
    let baseInner = window.innerHeight;

    const measure = () => {
      baseInner = Math.min(baseInner, window.innerHeight);
      const covered = baseInner - (vv.height + vv.offsetTop);
      setInset(covered > KEYBOARD_THRESHOLD ? Math.round(covered) : 0);
    };

    // Orientation flips the layout viewport entirely — reset the baseline
    // so a taller orientation isn't clamped to the old shorter value.
    const onOrient = () => { baseInner = window.innerHeight; measure(); };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [active]);

  return active ? inset : 0;
}
