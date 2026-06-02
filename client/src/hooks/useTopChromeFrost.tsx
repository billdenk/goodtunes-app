import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Single source of truth for who owns the *top* fan-chrome frosted layer
 * (Task #913).
 *
 * On `/album/:id` the bottom-nav search field and the album chrome both live
 * in the top band and manage independent state, so "search open" + "album
 * options menu open" is reachable and would otherwise stack two
 * backdrop-filters in the same region (the iOS-WebKit one-blur-per-region
 * hazard). This context lets whichever surface is the foreground action
 * (the bottom-nav search) claim the top frost; the album chrome then drops
 * its own backdrop-filter (top ChromeScrim band + share/⋯ capsule) so exactly
 * one frosted surface exists in the top band at any moment.
 *
 * Admin previews render `AlbumDetailMobileSurface` without this provider; the
 * default `searchOwnsTop: false` keeps their behaviour unchanged.
 */
type TopChromeFrost = {
  /** True while the bottom-nav search owns the top frosted layer. */
  searchOwnsTop: boolean;
  setSearchOwnsTop: (v: boolean) => void;
};

const TopChromeFrostContext = createContext<TopChromeFrost>({
  searchOwnsTop: false,
  setSearchOwnsTop: () => {},
});

export function TopChromeFrostProvider({ children }: { children: ReactNode }) {
  const [searchOwnsTop, setSearchOwnsTop] = useState(false);
  return (
    <TopChromeFrostContext.Provider value={{ searchOwnsTop, setSearchOwnsTop }}>
      {children}
    </TopChromeFrostContext.Provider>
  );
}

export function useTopChromeFrost() {
  return useContext(TopChromeFrostContext);
}
