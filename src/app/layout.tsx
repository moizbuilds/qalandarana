// Root layout — wraps every page. Its one job in Phase 2 is to load the four
// fonts once and set the night ground + ivory text that the whole site inherits.
import type { Metadata } from 'next'
import { nastaliq, nastaliqFallback, display, body } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Qalandarana',
    template: '%s — Qalandarana',
  },
  description:
    'An archive of Fawad Rana reciting and explaining the sufi kalam of Punjab — a journey through the seven valleys.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${nastaliq.variable} ${nastaliqFallback.variable} ${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
