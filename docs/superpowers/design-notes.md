# Qalandarana — Design Notes (Phase 2 execution layer)

Output of the `superpowers:frontend-design` session. Spec §5 is the binding creative brief; this file records the **executable decisions §5 leaves open** — exact scale, rhythm, composition. Where §5 pins a value (hexes, fonts, the signature concepts), it wins; nothing here overrides it.

## The thesis
One nightscape, scrolled as a path. The background *is* the content: it transmutes through the seven valleys and, at Fana, **inverts into light** — ivory ground, ink text, dark-gold thread. That inversion is the emotional climax (annihilation into the Beloved); we spend the whole scroll earning it. Gold stays rare so it stays precious: thread, hairlines, active states, the khatam mark — never body text.

## Type scale (fluid, manuscript-generous)
A Garamond family pairing — Cormorant (dramatic display sibling) over EB Garamond (humble book face) — gives coherence with contrast. Nastaliq is the hero at display size.

| Role | Face | Size | Leading | Notes |
|---|---|---|---|---|
| Kalam (Nastaliq hero) | Gulzar → Noto Nastaliq | `clamp(2rem, 4.5vw, 3.25rem)` | **2.3** | `dir=rtl lang=ur`; block `padding-block: .6em` (descender safety) |
| Valley name (Urdu) | Gulzar | `clamp(2.75rem, 6vw, 4.5rem)` | 2.1 | the station's crown |
| Display (English titles, valley EN) | Cormorant Garamond 500 | `clamp(2rem, 4vw, 3.25rem)` | 1.1 | letter-spacing `-0.01em` |
| Body / explanation | EB Garamond 400 | `1.1875rem` | 1.75 | measure ≤ 62ch |
| Roman whisper | EB Garamond 400 *italic* | `1.0625rem` | 1.6 | ivory @ 58% — quieter than both neighbors |
| UI micro-label | EB Garamond 500 | `0.75rem` | — | `text-transform:uppercase; letter-spacing:0.22em` |

## Spacing rhythm
Base `0.5rem`. Couplet blocks separated by `2.75rem` of air. Folio column `max-width: 42rem`, inset `clamp(1.5rem, 5vw, 3.5rem)` inside its gold hairline frame. Valley sections `min-height: 100vh`, content vertically centered, so each valley is a held breath. Section vertical padding `clamp(4rem, 12vh, 9rem)`.

## Color tokens (from §5, exact)
Ink `#0B0E1A` · ivory `#F2EBDC` · gold `#C9A227`. Valleys in order: talab `#131A33`, ishq `#3A1220`, marifat `#0E2E2A`, istighna `#1C2430`, tawhid `#152252`, hairat `#2A1840`, fana → `#F2EBDC` (light). All hexes live once in `globals.css` `:root`; Tailwind v4 `@theme` maps them; no hex literal anywhere else. Contrast verified AA in Task 11 (`scripts/contrast-check.ts`): ivory on every night tone ≥ 7:1; ink `#0B0E1A` on fana ivory ≥ 15:1.

## Signature composition — the Journey
- **Silsila thread:** 1px gold vertical line. Desktop: fixed in the left gutter at `clamp(2rem, 8vw, 7rem)` from the edge; content column to its right. Mobile: `1.25rem` from left edge. Draws in top→bottom over 1.2s once (`stroke-dashoffset`), reduced-motion = instant full line.
- **Lamp nodes:** one per valley, sitting *on* the thread at the valley's vertical center. Lit (has entries) = filled gold khatam-dot with a 4s breathing halo (box-shadow scale/opacity). Unlit = 1px gold ring @ 40% opacity. Fana's lamp, on the light ground, is a **dark** khatam — the inversion in miniature.
- **Entries are NOT cards** (banned). Each is a hairline-separated row hanging beside its valley: Cormorant title, small-caps poet · duration, a hair-thin gold underline that widens on hover. Empty valley: one quiet ivory@50% line, "No lamp lit here yet."
- **Fana inversion:** as the observer enters the fana section, `body` reaches ivory and a `.inverted` state flips text to ink, thread/lamp to a deeper gold `#9A7B1E` (AA on ivory). The one moment the whole palette turns over.

## The Folio (entry page)
Centered `42rem` column on the entry's own valley tone, wrapped in a 1px gold hairline frame with generous inset (the manuscript margin). Order: **Medallion** (voice first) → title (Cormorant) → kalam couplets (Nastaliq → roman whisper → English, `2.75rem` between couplets, each fades up 12px on scroll) → khatam-centered gold rule → explanation prose → poet name as gold small-caps link. No tabs, ever.

## The Medallion (talisman player)
128px disc. 1.5px gold progress ring (`stroke-dashoffset`), center play/pause glyph in gold, a soft radial `box-shadow` that breathes only while playing (the zikr pulse). Time readout below in small caps. Keyboard operable, `aria-pressed`, focus-visible gold outline. No native `<audio controls>` chrome.

## Ornament discipline
- **Khatam:** eight-pointed star = two squares overlaid at 45°, 1px gold stroke, no fill. The wordmark lockup, dividers' centerpiece, and lamp glyph all derive from it.
- **Watermark:** a faint girih tessellation, ≤4% opacity, at most one per screen (gateway + folio only).
- Banned, restated: mosque/lantern/crescent clichés, arabesque stock borders, card grids, purple gradients, Inter/Roboto, emoji in public UI.

## Motion
600–900ms ease-out throughout; couplet fade-up 12px on viewport enter; thread draw 1.2s once; halo 4s ease-in-out infinite; background transmute 1200ms ease-out on valley change. `prefers-reduced-motion: reduce` → all animation/transition off, final states shown.

## Gateway
Night ink, centered. Breathing khatam mark; one Bulleh Shah line in Nastaliq (`علموں بس کریں او یار`) with an EB-italic whisper beneath; a single passphrase field styled as a **ruled manuscript line** (bottom border only, gold on focus), Enter as small-caps. One girih watermark ≤4%. The gate is a threshold, not a form.

## Satori Nastaliq verdict (Phase 2 Task 2 spike)
**Satori (next/og) CANNOT render Nastaliq.** Rendering a Gulzar couplet through
`ImageResponse` throws `lookupType: 6 - substFormat: 1 is not yet supported` —
Satori's opentype shaper doesn't implement the chaining-contextual GSUB lookups
every real Nastaliq font relies on for its ligatures and contextual forms. Noto
Nastaliq is no simpler. So the OG/quote-card image is **Latin-only** (Roman
transliteration + English + poet + khatam + valley tone + QALANDARANA), which
Satori handles perfectly and which still carries the *sound* of the verse. The
downloadable full-Nastaliq image card is **deferred to Phase 3**, where it rides
the same headless-Chromium/Remotion rendering infra as the audiograms (a
screenshot of the real browser-rendered card is the only reliable path, and it's
too heavy a dependency to add on the Hobby plan just for this). The public
`/entry/[id]` page already renders the full Nastaliq beautifully for anyone who
wants to screenshot it by hand today.

## Risk taken (and why it's justified)
The scroll-linked full-page color pilgrimage **ending in an inverted light palette** is the one bold move. It's justified because it renders the subject's actual metaphysics — the sufi path from seeking to annihilation-into-light — as the primary interaction, not decoration. Everything else stays disciplined and quiet so this reads clearly.
