// The four voices of Qalandarana.
//
// CONCEPT: next/font self-hosts Google fonts at build time — the font files are
// served from our own domain, so there is no runtime request to Google and no
// flash of unstyled text. Each font exposes a CSS variable we wire into the
// <html> tag once (layout.tsx), then reference from globals.css.
import { Gulzar, Noto_Nastaliq_Urdu, Cormorant_Garamond, EB_Garamond } from 'next/font/google'

// Nastaliq — the hero script the kalam is set in. Gulzar is the soulful cut;
// Noto Nastaliq is the fallback so no glyph ever goes missing.
export const nastaliq = Gulzar({
  weight: '400',
  subsets: ['arabic'],
  variable: '--font-nastaliq',
  display: 'swap',
})

export const nastaliqFallback = Noto_Nastaliq_Urdu({
  weight: '400',
  subsets: ['arabic'],
  variable: '--font-nastaliq-fallback',
  display: 'swap',
})

// Cormorant Garamond — the dramatic display face (English titles, valley names).
export const display = Cormorant_Garamond({
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

// EB Garamond — the humble book face for body, explanations, and the roman
// transliteration "whisper" (its italic).
export const body = EB_Garamond({
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})
