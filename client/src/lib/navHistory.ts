import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

// Whether the fan has navigated within the SPA at least once since the
// page first loaded. Module-level so it survives route changes (the
// tracker hook below lives in the always-mounted Router). Lets surfaces
// like the album back-pill decide between a true browser-history back
// (returns the fan to the exact page + scroll they came from) and a
// hard-coded fallback when there's no prior in-app context (deep link,
// share open, refresh, opened in a new tab).
let navigatedWithinApp = false;

// Components that show/hide an in-app back affordance subscribe here so
// they re-render the moment `navigatedWithinApp` flips true (the flip
// happens in an effect, after the first render of any deep-linked page).
const subscribers = new Set<() => void>();

/**
 * Mount once near the router root. Flips `navigatedWithinApp` true on the
 * first location change after the initial load so back-aware surfaces can
 * tell whether `history.back()` would stay inside the app.
 */
export function useTrackInAppNavigation(): void {
  const [location] = useLocation();
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (!navigatedWithinApp) {
      navigatedWithinApp = true;
      subscribers.forEach((fn) => fn());
    }
  }, [location]);
}

/**
 * Reactive read of `navigatedWithinApp`. Returns false on a direct landing
 * (share open, deep link, refresh, new tab) and true once the fan has
 * navigated within the app. Surfaces use this to hide a back control that
 * would otherwise be a dead end for someone who came straight here.
 */
export function useHasInAppHistory(): boolean {
  const [val, setVal] = useState(navigatedWithinApp);
  useEffect(() => {
    const update = () => setVal(navigatedWithinApp);
    update();
    subscribers.add(update);
    return () => {
      subscribers.delete(update);
    };
  }, []);
  return val;
}

/**
 * Navigate back to wherever the fan actually came from.
 *
 * When the current page was reached by an in-app navigation we defer to
 * the browser's real back stack (`history.back()`), which returns the fan
 * to the exact originating page — search results, an artist page, a
 * playlist, the collection — with scroll position intact. When there's no
 * prior in-app context (the page was the first thing loaded) we fall back
 * to `fallback` so the back control is never a dead end.
 */
export function goBack(
  navigate: (to: string) => void,
  fallback = "/home",
): void {
  if (
    navigatedWithinApp &&
    typeof window !== "undefined" &&
    window.history.length > 1
  ) {
    window.history.back();
  } else {
    navigate(fallback);
  }
}
