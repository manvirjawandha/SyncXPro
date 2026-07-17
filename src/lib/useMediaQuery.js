import { useState, useEffect } from 'react'

// Small hook to react to viewport width without a CSS framework.
// Returns true when the viewport is at least `minWidth` px wide.
export function useMediaQuery(minWidth) {
  const query = `(min-width: ${minWidth}px)`
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = e => setMatches(e.matches)
    // Set immediately in case it changed between render and effect
    setMatches(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

// Named breakpoints used across the app.
export function useBreakpoints() {
  const isTablet = useMediaQuery(768)   // tablet and up
  const isDesktop = useMediaQuery(1024) // desktop and up
  return { isTablet, isDesktop, isMobile: !isTablet }
}
