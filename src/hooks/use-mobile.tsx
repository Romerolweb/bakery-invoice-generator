import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => {};
    }
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  };

  const getSnapshot = () => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth < MOBILE_BREAKPOINT;
  };

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
