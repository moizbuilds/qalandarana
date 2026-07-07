// journey.spec.ts — the end-to-end walkthrough of the public site (Phase 2).
//
// What a visitor (or father) actually does:
//   1. The family gate blocks the journey, then a correct passphrase opens it.
//   2. /journey lists the seven valleys in order.
//   3. A garbage entry id 404s (untrusted URL input can't reach the DB).
//   4. A published entry's folio renders its three kalam layers, Urdu dir="rtl".
//   5. A dead audio URL doesn't blank the folio — the text still renders.
//   6. The review link's Approve flips the entry to Published, idempotent on reload.
//   7. The share card image renders (PNG) and 404s for a non-existent entry.
//
// REQUIRES a database. These seed and read a real Neon DB, so they only run when
// DATABASE_URL is set AND migrate+seed has run once. Without DATABASE_URL the
// suite SKIPS cleanly (it must never fail merely because this env has no DB), and
// `npx playwright test --list` still enumerates every test because the seeder is
// imported dynamically inside the hook.
import { test, expect, type Page } from '@playwright/test'
import {
  E2E_PUBLISHED_ID,
  E2E_REVIEW_TOKEN,
  PUBLISHED_ENTRY,
  VALLEY_NAMES_IN_ORDER,
} from './fixtures'

const hasDb = Boolean(process.env.DATABASE_URL)
const PASSPHRASE = process.env.FAMILY_PASSPHRASE ?? ''

test.beforeAll(async () => {
  if (!hasDb) return
  const { seedE2E } = await import('./seed-e2e')
  // Neon's free tier suspends an idle database; the first query after a cold
  // start can fail with "fetch failed" while it wakes. seedE2E is idempotent, so
  // we retry a few times to ride out the wake-up before giving up.
  let lastErr: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await seedE2E()
      return
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr
})

// Pass the family gate and land on the journey, so the gated-route tests below
// start from an authenticated context.
async function enterGate(page: Page) {
  await page.goto('/gate')
  await page.fill('#passphrase', PASSPHRASE)
  await page.getByRole('button', { name: /enter/i }).click()
  await page.waitForURL('**/journey')
}

test.describe('Qalandarana — the Night Journey', () => {
  test.skip(!hasDb, 'e2e requires DATABASE_URL (a real/branch Neon DB) — see file header')

  test('the gate blocks the journey, the passphrase opens it', async ({ page }) => {
    await page.goto('/journey')
    // Ungated, the proxy redirects to /gate. Wait for the gate's own field to be
    // visible — this auto-retries through Next's first-hit route compilation in
    // dev, which the bare URL check can otherwise race.
    await expect(page.locator('#passphrase')).toBeVisible()
    await expect(page).toHaveURL(/\/gate$/)
    await page.fill('#passphrase', PASSPHRASE)
    await page.getByRole('button', { name: /enter/i }).click()
    await expect(page).toHaveURL(/\/journey$/)
  })

  test('journey lists the seven valleys in order', async ({ page }) => {
    await enterGate(page)
    // Each station's English name is its one <p class="font-display"> (entry
    // titles are <span>, the description is font-body) — collect in DOM order.
    const names = await page.locator('section[data-valley-section] p.font-display').allTextContents()
    expect(names.map((s) => s.trim())).toEqual([...VALLEY_NAMES_IN_ORDER])
  })

  test('a malformed entry id returns 404', async ({ page }) => {
    await enterGate(page)
    const res = await page.goto('/entry/not-a-uuid')
    expect(res?.status()).toBe(404)
  })

  test('published folio renders three kalam layers, Urdu marked rtl', async ({ page }) => {
    await enterGate(page)
    await page.goto(`/entry/${E2E_PUBLISHED_ID}`)
    await expect(page.getByText(PUBLISHED_ENTRY.kalamOriginal)).toBeVisible()
    await expect(page.getByText(PUBLISHED_ENTRY.kalamRoman)).toBeVisible()
    await expect(page.getByText(PUBLISHED_ENTRY.kalamEnglish)).toBeVisible()
    // The verse block carries dir="rtl" so bidi + screen readers read it correctly.
    const urdu = page.locator('p[dir="rtl"]', { hasText: PUBLISHED_ENTRY.kalamOriginal })
    await expect(urdu).toHaveAttribute('dir', 'rtl')
  })

  test('dead audio URL still renders the folio text', async ({ page }) => {
    await enterGate(page)
    await page.goto(`/entry/${E2E_PUBLISHED_ID}`)
    await expect(page.locator('audio')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: PUBLISHED_ENTRY.title })).toBeVisible()
    await expect(page.getByText(PUBLISHED_ENTRY.kalamEnglish)).toBeVisible()
  })

  test('review approve flips to Published and stays so on reload', async ({ page }) => {
    // /review is NOT gated (father's tokenized link), so no gate step here.
    await page.goto(`/review/${E2E_REVIEW_TOKEN}`)
    const approve = page.getByRole('button', { name: /approve & publish/i })
    await expect(approve).toBeVisible()
    await approve.click()
    await expect(page.getByText(/published/i)).toBeVisible()
    await page.reload()
    await expect(page.getByText(/published/i)).toBeVisible()
    await expect(approve).toHaveCount(0)
  })

  test('the share card renders a PNG, and 404s for a missing entry', async ({ request }) => {
    // /api/card is NOT gated (shareable), so we hit it directly.
    const ok = await request.get(`/api/card/${E2E_PUBLISHED_ID}?format=wide`)
    expect(ok.status()).toBe(200)
    expect(ok.headers()['content-type']).toContain('image/png')

    const missing = await request.get('/api/card/00000000-0000-0000-0000-000000000000')
    expect(missing.status()).toBe(404)
  })
})
