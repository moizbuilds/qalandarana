// valley-colors.ts — the JS-side mirror of the design tokens in globals.css.
//
// Why a second copy exists: the OG/quote-card images are drawn by Satori
// (next/og), which renders to a raster and CANNOT read CSS custom properties
// (`var(--valley-…)`). It needs literal hex strings at draw time. So these
// values intentionally mirror the `:root` block in globals.css. They must stay
// in sync; the contrast-check script asserts it. globals.css remains the source
// of truth for everything the browser paints — this is only for the image layer.
export const INK = '#0b0e1a'
export const IVORY = '#f2ebdc'
export const GOLD = '#c9a227'
// The deep bronze that stays legible (AA) on the Fana light ground; bright gold
// is only ~2:1 there. Cards for a Fana entry use this for their gold accents.
export const GOLD_FANA = '#6d5411'

// slug → the valley's night tone. Fana is light, so its card flips to ink text.
export const VALLEY_HEX: Record<string, string> = {
  talab: '#131a33',
  ishq: '#3a1220',
  marifat: '#0e2e2a',
  istighna: '#1c2430',
  tawhid: '#152252',
  hairat: '#2a1840',
  fana: '#f2ebdc',
}

// The background for a card whose entry has no maqam yet.
export const DEFAULT_CARD_BG = INK
