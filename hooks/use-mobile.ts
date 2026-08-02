import * as React from "react"

/**
 * Tracks a max-width media query.
 *
 * Uses `useSyncExternalStore` rather than `useEffect` + `setState`: the match
 * is external state we subscribe to, so this is both the idiomatic React 19
 * pattern and the one that avoids a cascading render on mount. Returns false
 * during SSR, matching the previous `undefined -> !!` behaviour.
 */
export function useIsMobile(mobileBreakpoint = 768) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(`(max-width: ${mobileBreakpoint - 1}px)`)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    [mobileBreakpoint],
  )

  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < mobileBreakpoint,
    () => false,
  )
}
