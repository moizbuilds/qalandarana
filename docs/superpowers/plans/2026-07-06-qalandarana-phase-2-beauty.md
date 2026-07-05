# Qalandarana Phase 2 (The Beauty) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the working spine into the Night Journey: the color pilgrimage through the Seven Valleys, the silsila thread, the illuminated folio entry pages, the medallion player, poet rooms, the passphrase gateway, quote-card export, and the full admin.

**Architecture:** Pure presentation layer over Phase 1's data — no pipeline or schema changes except additive (nothing here touches `entries` columns). A design-token layer (CSS custom properties + Tailwind extension) is the single source of truth for the §5 palette; every page reads tokens, never raw hexes.

**Tech Stack:** Everything from Phase 1, plus: `next/font/google` (Gulzar, Noto Nastaliq Urdu, Cormorant Garamond, EB Garamond), `@vercel/og` (Satori) for quote cards with a headless-Chromium fallback (`playwright-core` + `@sparticuz/chromium`) if Satori fails Nastaliq, Playwright e2e.

**Read first:** Spec `docs/superpowers/specs/2026-07-05-qalandarana-design.md` **§5 in full — it is a binding creative brief, not inspiration.** Also §6 (quote cards). Then the Phase 1 plan's Global Constraints (all still apply: teaching comments, strict TS, env fail-closed, single-source-of-truth, commits per task).

## Global Constraints (additional to Phase 1's)

- **HARD GATE — Task 1 must begin by invoking `superpowers:frontend-design` with spec §5 pasted as the brief.** The skill's output refines execution (spacing, composition, exact type scale); it may NOT override §5's fixed decisions (palette hexes, fonts, the pilgrimage/thread/medallion/folio concepts, ornament bans).
- Valley colors, gold `#C9A227`, ivory `#F2EBDC` exist in exactly ONE place: CSS custom properties in `globals.css` (Task 1). Tailwind maps to `var(...)`; no hex literal anywhere else, ever.
- All Urdu/Punjabi text blocks: `dir="rtl"`, `lang="ur"` (or `lang="pa"` where clearly Punjabi), Nastaliq font, `line-height ≥ 2.2`, extra block padding (descenders clip otherwise — treat as a layout law).
- Every animation respects `prefers-reduced-motion: reduce` → instant/none. Motion timings: 600–900ms ease-out; breathing halo 4s ease-in-out infinite; thread draw ~1.2s once.
- Text contrast ≥ WCAG AA against EVERY valley background tone (Task 11 verifies programmatically).
- Banned (spec §5): Inter/Roboto/system-font stacks, purple gradients, card grids, emoji in public UI, mosque/lantern/crescent clichés, arabesque stock borders.
- `web-interface-guidelines` skill check + `superpowers:webapp-testing` pass + Moiz's pre-flight checklist before this phase is called done.
- Run `/code-review` after each task (Moiz's standing rule).

---

### Task 1: Design session, tokens, fonts

**Files:**
- Create: `src/app/fonts.ts`, `docs/superpowers/design-notes.md`
- Modify: `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`

**Interfaces:**
- Produces: font exports `nastaliq`, `display`, `body` (next/font objects with CSS variables `--font-nastaliq`, `--font-display`, `--font-body`); CSS custom properties consumed by every later task: `--ink`, `--ivory`, `--gold`, `--valley-talab|ishq|marifat|istighna|tawhid|hairat`, `--fana-light`; Tailwind utilities `font-nastaliq`, `font-display`, `font-body`, `text-ivory`, `text-gold`, `bg-ink`, etc.

- [ ] **Step 1: Invoke `superpowers:frontend-design`** with spec §5 as the brief. Record the session's refinements (type scale, spacing rhythm, composition decisions) in `docs/superpowers/design-notes.md` — future tasks read this file alongside §5.

- [ ] **Step 2: Fonts**

```ts
// src/app/fonts.ts
// The four voices of Qalandarana. next/font self-hosts Google fonts at build
// time — no runtime requests to Google, no layout shift.
import { Gulzar, Noto_Nastaliq_Urdu, Cormorant_Garamond, EB_Garamond } from 'next/font/google'

export const nastaliq = Gulzar({ weight: '400', subsets: ['arabic'], variable: '--font-nastaliq' })
export const nastaliqFallback = Noto_Nastaliq_Urdu({ weight: '400', subsets: ['arabic'], variable: '--font-nastaliq-fallback' })
export const display = Cormorant_Garamond({ weight: ['400', '500', '600'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-display' })
export const body = EB_Garamond({ weight: ['400', '500'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-body' })
```

- [ ] **Step 3: Tokens in `globals.css`** (the ONE place hexes live):

```css
:root {
  --ink: #0B0E1A;            /* gateway night */
  --ivory: #F2EBDC;          /* moon ivory — text */
  --gold: #C9A227;           /* old gold — thread, hairlines, actives; use sparingly */
  --valley-talab: #131A33;   /* deep indigo */
  --valley-ishq: #3A1220;    /* blackened crimson */
  --valley-marifat: #0E2E2A; /* deep emerald-teal */
  --valley-istighna: #1C2430;/* cool slate */
  --valley-tawhid: #152252;  /* pure lapis */
  --valley-hairat: #2A1840;  /* midnight violet */
  --fana-light: #F2EBDC;     /* fana ends in light, not darkness */
}
body { transition: background-color 1200ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
.urdu { direction: rtl; font-family: var(--font-nastaliq), var(--font-nastaliq-fallback); line-height: 2.4; padding-block: 0.5em; }
```

Map all tokens into `tailwind.config.ts` (`colors: { ink: 'var(--ink)', gold: 'var(--gold)', ... }`, `fontFamily: { nastaliq: [...], display: [...], body: [...] }`). Apply font variables + `bg-ink text-ivory font-body` on `<body>` in `layout.tsx`.

- [ ] **Step 4: Nastaliq proof page** — temporary `/dev/type` route rendering a long Bulleh Shah kafi in `.urdu` at display size plus English layers; verify at 360px and desktop: no clipped descenders, no horizontal scroll. Delete route in Task 11.

- [ ] **Step 5: Commit** `feat: design tokens, fonts, nastaliq layout law`

### Task 2: Satori Nastaliq spike (de-risk quote cards NOW)

**Files:**
- Create: `src/app/api/card/spike/route.tsx` (temporary)

**Interfaces:**
- Produces: a WRITTEN VERDICT in `docs/superpowers/design-notes.md`: "Satori renders Nastaliq: yes/no" — Task 9 branches on it.

- [ ] **Step 1:** Minimal `@vercel/og` `ImageResponse` route rendering one Urdu couplet with the Gulzar font file passed via `fonts: [{ name, data }]` (fetch the .ttf from Google Fonts CDN at build of the route, or vendor it into `src/assets/`).
- [ ] **Step 2:** Open the route; inspect output PNG. Nastaliq requires complex glyph shaping — Satori's shaping (via opentype) often breaks Arabic-script ligatures. Compare against the same couplet in the browser. Judge: identical shaping = PASS.
- [ ] **Step 3:** Record verdict + screenshot path in design-notes.md. If FAIL: Task 9 uses the Chromium-screenshot fallback (already planned — no re-design needed). Delete spike route. Commit `chore: satori nastaliq verdict`.

### Task 3: The Gateway (passphrase gate)

**Files:**
- Create: `src/app/gate/page.tsx`, `src/app/gate/actions.ts`, `src/lib/family-session.ts`
- Modify: `src/middleware.ts` (from Phase 1 Task 13), `src/app/page.tsx`
- Test: `src/lib/family-session.test.ts`, `src/app/gate/actions.test.ts`

**Interfaces:**
- Consumes: `getEnv().FAMILY_PASSPHRASE`, `PUBLIC_MODE`, jose helpers pattern from Phase 1 `admin-session.ts`
- Produces: `createFamilyJwt(): Promise<string>` / `verifyFamilyJwt(token): Promise<boolean>` (90-day expiry, `AUTH_SECRET`, cookie `qalandarana_family`); middleware now guards `/journey`, `/entry/:path*`, `/poets/:path*` (NOT `/review`, `/api`, `/admin` — those have their own auth) and skips entirely when `PUBLIC_MODE === 'true'`; `enterGate(formData)` server action — constant-time compare (`crypto.timingSafeEqual` over hashes), sets cookie, redirects to `/journey`, generic error on mismatch.

- [ ] **Step 1: Failing tests** — jwt round-trip/tamper (as Phase 1 Task 13); action: correct passphrase sets cookie + redirects, wrong passphrase returns error without revealing which char failed, empty input rejected server-side.
- [ ] **Step 2–3: Implement** lib + action + middleware change (TDD loop).
- [ ] **Step 4: The gate page** — first §5 moment: `bg-ink`, centered khatam mark (Task 4 builds the SVG — for now a placeholder slot), one Bulleh Shah line in `.urdu` (`علموں بس کریں او یار` — "Enough of learning, my friend"), a single passphrase input with gold focus ring, letterspaced small-caps ENTER button. `/` now redirects: family cookie → `/journey`, else → `/gate`.
- [ ] **Step 5: Verify** (wrong/right passphrase, PUBLIC_MODE=true bypass in dev) → commit `feat: family passphrase gateway`.

### Task 4: Ornament components (khatam, hairline, lamp)

**Files:**
- Create: `src/components/ornament/Khatam.tsx`, `src/components/ornament/GoldRule.tsx`, `src/components/ornament/Lamp.tsx`
- Test: visual (Task 11); components are stateless SVG.

**Interfaces:**
- Produces: `<Khatam size={number} />` — eight-pointed star (two overlapped squares, 45° rotation, gold stroke 1px, no fill); `<GoldRule />` — 1px gold horizontal hairline with center diamond; `<Lamp lit={boolean} size={number} />` — circle node on the thread: lit = gold fill + `animate-breathe` halo (4s ease-in-out infinite scale/opacity keyframes, defined in globals.css), unlit = 1px gold outline at 40% opacity. These are the ONLY ornament primitives; pages compose them.

- [ ] **Step 1:** Implement all three (pure SVG, ~30 lines each; khatam: `<path>` of two squares rotated about center). Add `@keyframes breathe` to globals.css.
- [ ] **Step 2:** Render all three on `/dev/type`, verify, commit `feat: ornament primitives`.

### Task 5: The Medallion player

**Files:**
- Create: `src/components/Medallion.tsx`
- Test: `e2e/medallion.spec.ts` (Playwright — audio behavior needs a real browser)

**Interfaces:**
- Consumes: nothing app-specific (`src` prop) — reusable on entry, review, poet pages.
- Produces: `<Medallion src={string} title={string} />` client component: circular gold progress ring (SVG `stroke-dashoffset` driven by `timeupdate`), center play/pause button (accessible: `<button aria-label>`), radial pulse ONLY while playing, time readout in small caps below. Keyboard operable (space/enter), `aria-pressed`, no native `<audio controls>` visible.

- [ ] **Step 1: Implement**

```tsx
// src/components/Medallion.tsx
// The talisman: his voice deserves better than a default audio bar.
// CONCEPT: 'use client' — this component needs browser APIs (HTMLAudioElement,
// event listeners), so it ships JS to the browser; server components can't.
'use client'
import { useRef, useState } from 'react'

const R = 54, CIRC = 2 * Math.PI * R

export function Medallion({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [time, setTime] = useState(0)

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) { void a.play() } else { a.pause() }
  }

  return (
    <figure className="flex flex-col items-center gap-3">
      <audio
        ref={audioRef} src={src} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          setTime(a.currentTime)
          if (a.duration) setProgress(a.currentTime / a.duration)
        }}
      />
      <button
        onClick={toggle} aria-pressed={playing}
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        className={`relative h-32 w-32 rounded-full outline-offset-4 focus-visible:outline focus-visible:outline-gold ${playing ? 'animate-breathe' : ''}`}
      >
        <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--gold)" strokeOpacity="0.25" strokeWidth="1.5" />
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--gold)" strokeWidth="1.5"
            strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-gold text-3xl" aria-hidden>
          {playing ? '‖' : '▶'}
        </span>
      </button>
      <figcaption className="text-xs tracking-[0.2em] uppercase text-ivory/60">
        {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}
      </figcaption>
    </figure>
  )
}
```

- [ ] **Step 2: Playwright test** — click plays (ring advances with a short fixture .ogg in `e2e/fixtures/`), click pauses, space key toggles, `aria-pressed` flips.
- [ ] **Step 3: Run** e2e → PASS → commit `feat: medallion audio player`.

### Task 6: The Journey page (color pilgrimage + silsila thread)

**Files:**
- Create: `src/components/journey/ValleySection.tsx`, `src/components/journey/SilsilaThread.tsx`, `src/components/journey/PilgrimageObserver.tsx`
- Modify: `src/app/journey/page.tsx` (replace Phase 1's plain list)

**Interfaces:**
- Consumes: `listPublishedByMaqam()` (Phase 1), maqamat rows, `Lamp`, `GoldRule`
- Produces: the §5 journey. Mechanics locked here:
  - **Color pilgrimage:** each `<ValleySection data-valley={slug}>`; `PilgrimageObserver` (client) uses IntersectionObserver (threshold 0.5) to set `document.body.dataset.valley`; globals.css maps `body[data-valley='talab'] { background-color: var(--valley-talab) }` … etc.; the body's 1200ms transition (Task 1) does the transmutation. CONCEPT note: scroll-driven CSS animations aren't cross-browser yet; observer + transition is the durable way. Final section `fana`: background `var(--valley-hairat)` fading to a full-viewport ivory gradient panel — **text inside the fana panel switches to ink** (AA contrast flips with the background).
  - **Silsila thread:** fixed-position 1px gold vertical SVG line down the center-left gutter (desktop) / left edge (mobile), `stroke-dashoffset` draw-in over 1.2s on mount, once. Station `Lamp`s sit on it, `lit={entries.length > 0}`.
  - Each valley: `nameOriginal` in `.urdu` display size, `nameEnglish` small caps, `description` in display italic, entries as minimal ivory-on-transparent link rows (title + poet + duration) with gold hover underline — **not cards** (banned).

- [ ] **Step 1: Implement** the three components + page rewrite (server page, client observer only — keep JS minimal).
- [ ] **Step 2: Verify** in browser: scroll through all seven; colors transmute; fana ends luminous; reduced-motion (emulate in devtools) = instant switches; 360px width clean.
- [ ] **Step 3:** Commit `feat: journey page — color pilgrimage and silsila thread`.

### Task 7: The Entry folio

**Files:**
- Modify: `src/app/entry/[id]/page.tsx` (replace plain version)
- Create: `src/components/KalamLayers.tsx`

**Interfaces:**
- Consumes: `Medallion`, `GoldRule`, `Khatam`, entry + poet + maqam join
- Produces: `<KalamLayers kalamOriginal kalamRoman kalamEnglish />` — splits each field on blank lines into couplet blocks; renders per couplet: `.urdu` display-size block → Roman in `font-body italic text-ivory/70` (the whisper) → English in `font-body`; couplets separated by generous space, fade-up 12px on viewport entry (IntersectionObserver + CSS class; reduced-motion exempt). Page: max-w-prose column inside a 1px gold hairline frame with corner padding (the folio), `Medallion` at top ("the voice comes first"), then `KalamLayers`, `GoldRule`, explanation (`.urdu` block then English prose), poet name as gold link, valley name small-caps footer. Background: the entry's own valley color (`body[data-valley]` set once server-side via a tiny client hook or inline `<script>` — one line, no observer needed).

- [ ] **Steps:** implement → verify (long + short kalam, missing poet → "Unknown" italic, 360px) → commit `feat: illuminated folio entry page`.

### Task 8: Poet rooms + review restyle

**Files:**
- Create: `src/app/poets/page.tsx`, `src/app/poets/[id]/page.tsx`; repository addition `listPoetsWithCounts()`, `getPoetWithEntries(id)` in `src/lib/entries.ts`
- Modify: `src/app/review/[token]/page.tsx`

**Interfaces:**
- Produces: `/poets` — quiet index: each poet as name (Urdu display + English small caps), era, entry count, gold rule between; `/poets/[id]` — bio paragraph, then that poet's published entries (same row style as valleys). Review page: same tokens/type (ink background, ivory text, `.urdu` blocks, Medallion replaces bare `<audio>`), but clarity-first per spec — corrections panel becomes gold-bordered with clear strikethrough pairs; the two big buttons stay big (thumb-height, high-contrast, NOT subtle).

- [ ] **Steps:** repository functions → pages → review restyle → verify on phone width → commit `feat: poet rooms and restyled review`.

### Task 9: Quote cards + share + OG

**Files:**
- Create: `src/app/api/card/[id]/route.tsx` (Satori path) OR `src/app/card/[id]/page.tsx` + `src/app/api/card/[id]/route.ts` (Chromium-screenshot path — per Task 2 verdict), `src/components/ShareCard.tsx` (client: format picker + download)
- Modify: `src/app/entry/[id]/page.tsx` (Share button), `src/app/layout.tsx` + entry page `generateMetadata` (OG tags)

**Interfaces:**
- Produces: `GET /api/card/[id]?format=square|story|wide` → PNG (1080×1080 / 1080×1920 / 1600×900): first couplet in Nastaliq, English line below, khatam + "QALANDARANA" small caps, entry's valley color as background, gold hairline frame. Published entries only (404 otherwise — the gate must not leak unpublished kalam). Entry `generateMetadata` points `og:image` at the wide card.
- **Branch on Task 2 verdict:** PASS → pure `ImageResponse` with vendored Gulzar ttf. FAIL → `/card/[id]` renders the card as a normal (gate-exempt, published-only) HTML page; the API route screenshots it with `playwright-core` + `@sparticuz/chromium` at the requested viewport. Cache either path: `Cache-Control: public, max-age=31536000, immutable` keyed by id+format (kalam is immutable after publish; admin edits are rare — bust with `?v=updatedAt` param in the Share links).

- [ ] **Steps:** route per verdict → ShareCard (three format buttons, `<a download>`) → OG metadata → verify all three PNGs render correct Nastaliq → commit `feat: quote cards and OG images`.

### Task 10: Full admin

**Files:**
- Create: `src/app/admin/poets/page.tsx`, `src/app/admin/poets/actions.ts`
- Modify: `src/app/admin/page.tsx`
- Test: `src/app/admin/poets/actions.test.ts`

**Interfaces:**
- Produces: poet CRUD (`createPoet`, `updatePoet` — no delete if poet has entries: action throws with clear message; test this); admin dashboard grouped by status with counts (`in_review: 2, failed: 1 …`) and one-click links to father's review URL (for re-forwarding when he loses it). Admin stays utilitarian — default fonts fine here, spec says workbench.

- [ ] **Steps:** failing action tests → implement → verify → commit `feat: full admin — poet management, status board`.

### Task 11: Guidelines, e2e, pre-flight, ship

**Files:**
- Create: `e2e/beauty.spec.ts`, `scripts/contrast-check.ts`
- Delete: `/dev/type` route

**Interfaces:** none — this task is verification.

- [ ] **Step 1: `scripts/contrast-check.ts`** — computes WCAG contrast ratio of `--ivory` (and `--gold` for interactive elements) against ALL seven valley tokens + ink, and ink against `--fana-light`; exits non-zero below 4.5:1 (body text) / 3:1 (large display text — document which is which in the script). Wire into `npm test`.
- [ ] **Step 2: Run `web-interface-guidelines` skill** over the new UI code; fix findings.
- [ ] **Step 3: Playwright `beauty.spec.ts`**: gate wrong/right passphrase; journey shows 7 valleys in order with correct `data-valley` progression; entry folio renders 3 layers RTL-correct at 360px; medallion plays; reload mid-review after approve shows Published (no double-publish); card API returns PNG for all 3 formats and 404s for unpublished; `PUBLIC_MODE=true` bypasses gate.
- [ ] **Step 4:** Moiz's six-question pre-flight against the whole phase (reload / failure / bad input / secrets / cost — note card route is compute-bounded by cache / one-source-of-truth — tokens audit: `grep -rn '#[0-9A-Fa-f]\{6\}' src/ --include='*.tsx'` must return only `globals.css`… run it as `grep -rn` over `src` excluding globals and expect zero hits).
- [ ] **Step 5:** Delete `/dev/type`, full `npm test` + e2e green, commit `feat: phase 2 complete — the beauty`, deploy, walk the real site on a phone. **Phase 2 done.**
