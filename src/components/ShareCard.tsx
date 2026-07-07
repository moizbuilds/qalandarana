// ShareCard — a quiet share affordance at the foot of the folio. Copies the
// entry's link (so it unfurls with the OG card wherever it's pasted) and offers
// the card image to save. Deliberately understated: it must not compete with the
// medallion or the verse.
'use client'

import { useState } from 'react'

export function ShareCard({ entryId }: { entryId: string }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard can be blocked (insecure context, permissions) — fail quietly;
      // the "Save card" link below still gives the user a way to share.
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="eyebrow" style={{ opacity: 0.45 }}>Share</p>
      <div className="flex items-center gap-6">
        <button onClick={copyLink} className="eyebrow text-gold">
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <a
          href={`/api/card/${entryId}?format=square`}
          target="_blank"
          rel="noopener noreferrer"
          className="eyebrow text-gold"
        >
          Save card
        </a>
      </div>
    </div>
  )
}
