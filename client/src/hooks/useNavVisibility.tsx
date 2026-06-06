import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from "react";

type NavVis = { hidden: boolean; setHidden: (h: boolean) => void };

const NavVisibilityContext = createContext<NavVis>({ hidden: false, setHidden: () => {} });

export function NavVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <NavVisibilityContext.Provider value={{ hidden, setHidden }}>
      {children}
    </NavVisibilityContext.Provider>
  );
}

export function useNavVisibility() {
  return useContext(NavVisibilityContext);
}

export function useScrollHideNav(ref: RefObject<HTMLElement>) {
  const { setHidden } = useNavVisibility();
  useEffect(() => {
    // The scroll container the ref points at may not exist yet when this
    // effect first runs: pages like AlbumDetail render a loading skeleton
    // (no scroll element) on first paint and only swap in the real scroll
    // `<div>` once their data resolves. Binding once on mount would then
    // attach to nothing and never re-bind, so the nav would never collapse
    // on those pages. We instead resolve the element lazily and, if it's
    // not present yet, watch the DOM for it to appear and bind then.
    let el: HTMLElement | null = null;
    let lastY = 0;
    let ticking = false;
    // Wider hysteresis (12px each way) than the original 6px so tiny
    // rubber-band wobbles and trackpad/inertia jitters don't flip the
    // nav between hidden/visible mid-scroll. Apple Music uses ~10–14px
    // for the same reason.
    const onScroll = () => {
      if (!el || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (!el) {
          ticking = false;
          return;
        }
        const y = el.scrollTop;
        const dy = y - lastY;
        if (y < 80) setHidden(false);
        else if (dy > 12) setHidden(true);
        else if (dy < -12) setHidden(false);
        lastY = y;
        ticking = false;
      });
    };

    const bind = (): boolean => {
      if (el || !ref.current) return false;
      el = ref.current;
      lastY = el.scrollTop;
      el.addEventListener("scroll", onScroll, { passive: true });
      return true;
    };

    // Event-driven (not a busy rAF loop): if the container is already on
    // screen, bind immediately; otherwise watch the document for the
    // subtree change that mounts it, then bind once and stop observing.
    // On a terminal state that never mounts a scroll container (e.g. the
    // "album not found" page) the observer simply stays idle until unmount.
    let observer: MutationObserver | null = null;
    if (!bind() && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        if (bind()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      if (el) el.removeEventListener("scroll", onScroll);
      setHidden(false);
    };
  }, [ref, setHidden]);
}
