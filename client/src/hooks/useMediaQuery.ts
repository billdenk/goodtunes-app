import { useEffect, useState } from "react";

/**
 * Returns whether the given CSS media query currently matches.
 *
 * SSR-safe: starts `false` on the server, hydrates to the real value on
 * mount. Used by `/album/:id` to switch between the mobile Apple-Music
 * layout (<1024px) and the desktop Preview & Purchase layout (≥1024px).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
