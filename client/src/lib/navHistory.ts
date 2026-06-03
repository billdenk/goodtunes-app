import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// Whether the fan has navigated within the SPA at least once since the
// page first loaded. Module-level so it survives route changes (the
// tracker hook below lives in the always-mounted Router). Lets surfaces
// like the album back-pill decide between a true browser-history back
// (returns the fan to the exact page + scroll they came from) and a
// hard-coded fallback when there's no prior in-app context (deep link,
// share open, refresh, opened in a new tab).
let navigatedWithinApp = false;

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
    navigatedWithinApp = true;
  }, [location]);
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
  fallback = "/collection",
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
