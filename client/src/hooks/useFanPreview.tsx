import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useFullPlaybackAccess } from "@/hooks/useFullPlaybackAccess";

/**
 * "View as a fan" override for the Preview & Purchase page.
 *
 * Bill's own accounts (admin sessions + the small full-access allowlist in
 * useFullPlaybackAccess) are exempted from preview-first, so on every album
 * they see the *unlocked owner* view and can never tell what a real visitor
 * gets. This context lets a privileged viewer flip the whole album page into
 * the locked fan experience (30s previews + Buy CTA, no library actions) so
 * operators can see and perfect the public page before it goes live.
 *
 * It is purely a viewer-side lens: it overrides ownership/full-access to
 * `false` for the duration of the toggle. It never changes server state and
 * the toggle UI only renders for privileged accounts — real fans never see
 * it. The state is mirrored into the URL (`?fan=1`) so the fan view survives
 * a reload and can be shared as a link with another operator.
 */
type FanPreviewValue = {
  /** True when the page should render as a non-owner visitor would see it. */
  fanView: boolean;
  /** True when the current account is allowed to toggle the lens. */
  canToggle: boolean;
  setFanView: (next: boolean) => void;
};

const FanPreviewContext = createContext<FanPreviewValue>({
  fanView: false,
  canToggle: false,
  setFanView: () => {},
});

function readFanParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fan") === "1";
}

function syncFanParam(on: boolean) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (on) url.searchParams.set("fan", "1");
  else url.searchParams.delete("fan");
  window.history.replaceState(window.history.state, "", url.toString());
}

export function FanPreviewProvider({ children }: { children: React.ReactNode }) {
  const canToggle = useFullPlaybackAccess();
  // Only honor the URL flag for privileged viewers — a real fan landing on a
  // `?fan=1` link must still get the normal (already-locked) experience.
  const [fanView, setFanViewState] = useState(() => canToggle && readFanParam());

  // `canToggle` depends on the async `/api/me` query, so on a fresh load (or a
  // shared `?fan=1` link) it is usually false on first render — the initializer
  // above can't see the URL flag yet. Re-hydrate once privilege resolves so the
  // fan view survives a reload and shared links land in the locked view.
  useEffect(() => {
    if (canToggle && readFanParam()) setFanViewState(true);
  }, [canToggle]);

  const setFanView = useCallback(
    (next: boolean) => {
      setFanViewState(next);
      syncFanParam(next);
    },
    [],
  );

  return (
    <FanPreviewContext.Provider value={{ fanView: canToggle && fanView, canToggle, setFanView }}>
      {children}
    </FanPreviewContext.Provider>
  );
}

export function useFanPreview(): FanPreviewValue {
  return useContext(FanPreviewContext);
}
