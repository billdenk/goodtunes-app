import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
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

/**
 * Floating pill that flips between the owner view and the locked fan view.
 * Renders nothing for non-privileged accounts.
 */
export function FanPreviewToggle() {
  const { fanView, canToggle, setFanView } = useFanPreview();
  if (!canToggle) return null;
  return (
    <button
      type="button"
      onClick={() => setFanView(!fanView)}
      data-testid="button-fan-preview-toggle"
      aria-pressed={fanView}
      className={
        "fixed z-[70] bottom-24 right-4 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold shadow-lg ring-1 backdrop-blur transition-colors " +
        (fanView
          ? "bg-white text-black ring-black/10 hover:bg-white/90"
          : "bg-black/70 text-white ring-white/20 hover:bg-black/80")
      }
      title={
        fanView
          ? "You're seeing the locked Preview & Purchase view a fan gets. Click to return to your full owner view."
          : "Preview the locked Preview & Purchase page exactly as a visitor sees it (30s previews + Buy)."
      }
    >
      {fanView ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
      <span>{fanView ? "Viewing as fan" : "View as fan"}</span>
    </button>
  );
}
