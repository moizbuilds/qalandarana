// The silsila — the chain of transmission, made literal. A single 1px gold
// line down the journey's left gutter, drawing itself downward once on load.
// The lamps that sit on it live in each ValleySection, so they land at their
// own valley's center without any measurement.
'use client'

import { useEffect, useState } from 'react'

export function SilsilaThread() {
  const [drawn, setDrawn] = useState(false)

  // Kick the draw-in on mount. Reduced-motion users get no transition (globals),
  // so this simply snaps to full length for them.
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 bottom-0"
      style={{
        left: 'var(--thread-x)',
        width: '1px',
        backgroundColor: 'var(--gold)',
        opacity: 0.5,
        transformOrigin: 'top',
        transform: drawn ? 'scaleY(1)' : 'scaleY(0)',
        transition: 'transform 1200ms ease-out',
      }}
    />
  )
}
