// playwright.config.ts — the e2e harness config (separate from vitest, which
// runs the fast node-only unit tests). Playwright drives a REAL browser against a
// REAL dev server, so it lives in its own world: its files are e2e/*.spec.ts,
// never src/**/*.test.ts, so `npm test` (vitest) and `npm run e2e` never overlap.
//
// CONCEPT: e2e ("end to end") tests exercise the whole stack as a user would —
// browser → Next server → database — instead of one function in isolation. They
// catch wiring bugs unit tests can't see, at the cost of needing a running app
// and a database.
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Load .env.local so DATABASE_URL (and everything getEnv needs, since the dev
// server boots the full app) is present. dotenv's default file is .env; we want
// .env.local, the gitignored file that mirrors .env.example.
dotenv.config({ path: '.env.local' })

export default defineConfig({
  testDir: './e2e',
  // Fail fast in CI, allow reruns locally. No retries: these tests are
  // deterministic against seeded data, so a retry would only hide a real flake.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // 360px wide = a small Android phone, the way father actually reads. The
    // brief pins the RTL-render check to this width; using it everywhere keeps
    // the whole suite honest about the real reading surface.
    viewport: { width: 360, height: 800 },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } }],
  // CONCEPT: webServer lets Playwright start (and wait for) the app itself, so
  // `npm run e2e` is one command. reuseExistingServer avoids booting a second
  // dev server if you already have one running locally.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
