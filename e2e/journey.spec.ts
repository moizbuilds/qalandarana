// journey.spec.ts — the Phase 1 end-to-end walkthrough of the public spine.
//
// Five checks a user (or father) actually performs:
//   1. /journey lists the seven valleys in order.
//   2. A garbage entry id 404s (untrusted URL input can't reach the DB).
//   3. A published entry renders its three kalam layers, Urdu marked dir="rtl".
//   4. The review link's Approve button flips the entry to Published, and a
//      reload stays Published (idempotent — father can double-tap safely).
//   5. A dead audio URL doesn't blank the page — the text still renders.
//
// REQUIRES a database. These tests seed and read a real Neon DB, so they only run
// when DATABASE_URL is set (a real or branch database) AND `npm run db:migrate &&
// npm run db:seed` has been run once. Locally: fill .env.local, migrate+seed, then
// `npm run e2e`. Without DATABASE_URL the whole suite SKIPS cleanly (it must never
// fail merely because this environment has no DB) — and `npx playwright test
// --list` still enumerates every test, because nothing here touches the db client
// until a test actually runs (the seeder is imported dynamically, inside a hook).
import { test, expect } from '@playwright/test'
import {
  E2E_PUBLISHED_ID,
  E2E_REVIEW_TOKEN,
  PUBLISHED_ENTRY,
  VALLEY_NAMES_IN_ORDER,
} from './fixtures'

// The single gate: is a database configured? Read at collection time (Playwright
// has already loaded .env.local via the config). Everything below keys off this.
const hasDb = Boolean(process.env.DATABASE_URL)

// Seed the fixtures once before the suite. Guarded AND dynamically imported: when
// there's no DB we return before importing ../seed-e2e, so its `import ../src/lib/db`
// (which calls getEnv and would throw) never evaluates — that's what keeps
// `--list` and the no-DB skip clean.
test.beforeAll(async () => {
  if (!hasDb) return
  const { seedE2E } = await import('./seed-e2e')
  await seedE2E()
})

test.describe('Qalandarana spine', () => {
  // One conditional skip covers every test in the block. The message tells a
  // reader exactly why it skipped and what to set.
  test.skip(!hasDb, 'e2e requires DATABASE_URL (a real/branch Neon DB) — see file header')

  test('journey lists the seven valleys in order', async ({ page }) => {
    await page.goto('/journey')
    // Each valley section renders its English name in the header's <p class="text-lg">.
    // Collecting those in DOM order and comparing to the expected array checks
    // BOTH presence and ordering in one assertion.
    const names = await page.locator('section > header > p.text-lg').allTextContents()
    expect(names.map((s) => s.trim())).toEqual([...VALLEY_NAMES_IN_ORDER])
  })

  test('a malformed entry id returns 404', async ({ page }) => {
    // 'not-a-uuid' is rejected by the page's uuid guard before any query runs, so
    // it must surface as a real 404 — never a 500 from Postgres choking on the id.
    const res = await page.goto('/entry/not-a-uuid')
    expect(res?.status()).toBe(404)
  })

  test('published entry renders three kalam layers, Urdu marked rtl', async ({ page }) => {
    await page.goto(`/entry/${E2E_PUBLISHED_ID}`)

    // All three layers present: original (Urdu), roman transliteration, English.
    await expect(page.getByText(PUBLISHED_ENTRY.kalamOriginal)).toBeVisible()
    await expect(page.getByText(PUBLISHED_ENTRY.kalamRoman)).toBeVisible()
    await expect(page.getByText(PUBLISHED_ENTRY.kalamEnglish)).toBeVisible()

    // The Urdu block MUST carry dir="rtl" so the script reads right-to-left. We
    // find the rtl section that holds the kalam and assert the attribute on it.
    const urduBlock = page.locator('section[dir="rtl"]', { hasText: PUBLISHED_ENTRY.kalamOriginal })
    await expect(urduBlock).toHaveAttribute('dir', 'rtl')
  })

  test('dead audio URL still renders the page text', async ({ page }) => {
    await page.goto(`/entry/${E2E_PUBLISHED_ID}`)
    // The <audio> source is intentionally dead. A broken media element must NOT
    // blank the page — the title and verses still render around it.
    await expect(page.locator('audio')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: PUBLISHED_ENTRY.title })).toBeVisible()
    await expect(page.getByText(PUBLISHED_ENTRY.kalamEnglish)).toBeVisible()
  })

  test('review approve flips to Published and stays so on reload', async ({ page }) => {
    await page.goto(`/review/${E2E_REVIEW_TOKEN}`)

    // Before approval, the action buttons are shown, not the published marker.
    const approve = page.getByRole('button', { name: /approve & publish/i })
    await expect(approve).toBeVisible()

    await approve.click()

    // After approval the page swaps to the "✓ Published" state (revalidatePath
    // busts the cache so the fresh render shows it).
    await expect(page.getByText(/published/i)).toBeVisible()

    // Idempotency: reloading (father tapping the same link again) must stay
    // Published and NOT error — approveEntry no-ops once already published.
    await page.reload()
    await expect(page.getByText(/published/i)).toBeVisible()
    await expect(approve).toHaveCount(0)
  })
})
