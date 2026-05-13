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
    const el = ref.current;
    if (!el) return;
    let lastY = el.scrollTop;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = el.scrollTop;
        const dy = y - lastY;
        if (y < 80) setHidden(false);
        else if (dy > 6) setHidden(true);
        else if (dy < -6) setHidden(false);
        lastY = y;
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      setHidden(false);
    };
  }, [ref, setHidden]);
}
