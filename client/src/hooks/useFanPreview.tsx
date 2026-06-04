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

const FAN_TOGGLE_COLLAPSED_KEY = "gt:fan-toggle-collapsed";

/**
 * Floating pill that flips between the owner view and the locked fan view.
 * Renders nothing for non-privileged accounts. Collapses to a small eye
 * button in the bottom-right corner (the slot the ScreenTag used to occupy).
 * Collapsed state persists in localStorage.
 */
export function FanPreviewToggle() {
  const { fanView, canToggle, setFanView } = useFanPreview();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(FAN_TOGGLE_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(FAN_TOGGLE_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  if (!canToggle) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        data-testid="button-fan-preview-expand"
        className={
          "fixed z-[9999] bottom-3 right-3 h-11 w-11 rounded-full inline-flex items-center justify-center shadow-lg transition-colors " +
          (fanView
            ? "bg-white text-black hover:bg-white/90"
            : "bg-black/70 text-white hover:bg-black/80")
        }
        title="Show fan-view toggle"
      >
        {fanView ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
      </button>
    );
  }

  return (
    <div
      className={
        "fixed z-[9999] bottom-3 right-3 flex items-center gap-1.5 rounded-full shadow-lg ring-1 backdrop-blur transition-colors " +
        (fanView
          ? "bg-white text-black ring-black/10"
          : "bg-black/70 text-white ring-white/20")
      }
      data-testid="fan-preview-toggle"
    >
      <button
        type="button"
        onClick={() => setFanView(!fanView)}
        data-testid="button-fan-preview-toggle"
        aria-pressed={fanView}
        className="flex items-center gap-2 pl-3 pr-2 py-2 text-sm font-semibold hover:opacity-80 transition-opacity"
        title={
          fanView
            ? "You're seeing the locked Preview & Purchase view a fan gets. Click to return to your full owner view."
            : "Preview the locked Preview & Purchase page exactly as a visitor sees it (30s previews + Buy)."
        }
      >
        {fanView ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
        <span>{fanView ? "Viewing as fan" : "View as fan"}</span>
      </button>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        data-testid="button-fan-preview-collapse"
        className={
          "mr-1 w-5 h-5 rounded inline-flex items-center justify-center transition-colors " +
          (fanView
            ? "text-black/40 hover:text-black hover:bg-black/10"
            : "text-fan-secondary hover:text-white hover:bg-white/10")
        }
        title="Hide"
        aria-label="Hide fan-view toggle"
      >
        ×
      </button>
    </div>
  );
}
