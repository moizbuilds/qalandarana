// Sets <body data-valley> once for pages that aren't the scrolling journey —
// the entry folio and the review page — so each wears its own valley tone (and
// Fana entries invert to light). Cleans up on unmount so the tint never leaks
// onto the next page.
//
// CONCEPT: a tiny client component whose only job is a side effect on mount.
// It renders nothing; it exists so a server page can still opt into the tint.
'use client'

import { useEffect } from 'react'

export function SetBodyValley({ slug }: { slug: string | null }) {
  useEffect(() => {
    if (!slug) return
    document.body.dataset.valley = slug
    return () => {
      delete document.body.dataset.valley
    }
  }, [slug])

  return null
}
