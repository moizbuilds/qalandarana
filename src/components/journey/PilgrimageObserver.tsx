// The color pilgrimage engine. Watches the valley sections and, as each one
// reaches the middle of the viewport, stamps its slug onto <body data-valley>.
// The transmutation itself is pure CSS (globals.css) — this only decides *when*.
//
// CONCEPT: IntersectionObserver reports when an element enters a chosen band of
// the viewport, cheaply and off the main scroll thread. We watch a thin band at
// the vertical center, so the background changes as a valley takes the stage.
'use client'

import { useEffect } from 'react'

export function PilgrimageObserver() {
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-valley-section]'),
    )
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const slug = (entry.target as HTMLElement).dataset.valleySection
            if (slug) document.body.dataset.valley = slug
          }
        }
      },
      // a thin trigger band across the vertical center of the viewport
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )

    sections.forEach((s) => observer.observe(s))

    return () => {
      observer.disconnect()
      // leaving the journey shouldn't strand a valley tint on other pages
      delete document.body.dataset.valley
    }
  }, [])

  return null
}
