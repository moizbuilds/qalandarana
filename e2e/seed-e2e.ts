// seed-e2e.ts — inserts the two fixture entries the Playwright suite drives.
//
// The unit tests (vitest) never touch a real database; the e2e suite does, so it
// needs known rows to exist: one PUBLISHED entry (for the public /entry and
// /journey pages) and one IN_REVIEW entry with a known review token (for the
// approve-flow test). This writes them straight through the app's own db client
// — same path the pipeline uses — so what the tests see is what production would.
//
// REQUIRES a real database: importing ../src/lib/db runs getEnv(), which fails
// closed if the environment is incomplete. Run only with a filled .env.local
// pointing at a real or branch Neon DB, AFTER `npm run db:migrate && db:seed`
// (this seeder looks up the 'ishq' maqam that db:seed creates).
//
// RELATIVE imports (../src/lib/...), not '@/': neither tsx nor Playwright's
// loader reads tsconfig `paths` at runtime. Same convention as scripts/seed.ts.
import dotenv from 'dotenv'
// Load .env.local explicitly (dotenv's default is .env). Harmless when Playwright
// has already populated process.env — dotenv won't overwrite existing vars.
dotenv.config({ path: '.env.local' })

import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { entries, maqamat } from '../src/lib/schema'
import {
  E2E_PUBLISHED_ID,
  E2E_REVIEW_ID,
  E2E_REVIEW_TOKEN,
  DEAD_AUDIO_URL,
  PUBLISHED_ENTRY,
  REVIEW_ENTRY,
} from './fixtures'

// telegram_message_id is a NOT NULL unique column, so the fixtures need stable,
// collision-proof values. High numbers in a reserved band no real Telegram
// message will ever use.
const PUBLISHED_MSG_ID = 990_000_001
const REVIEW_MSG_ID = 990_000_002
const CHAT_ID = 990_000_000

// Insert (or refresh) the two fixture rows. Idempotent: it deletes any prior
// fixture rows by id first, then inserts fresh — so re-running the suite always
// starts from the same clean, known state rather than erroring on a duplicate id.
export async function seedE2E(): Promise<void> {
  // The published fixture is grouped under a maqam so it appears on /journey.
  // db:seed creates the maqamat; if it hasn't run, fail with a pointed message
  // instead of a confusing null-foreign-key insert later.
  const [ishq] = await db.select().from(maqamat).where(eq(maqamat.slug, 'ishq')).limit(1)
  if (!ishq) {
    throw new Error(
      "e2e seed: 'ishq' maqam not found. Run `npm run db:migrate && npm run db:seed` first.",
    )
  }

  // Clear prior fixture rows (by our fixed ids) so the insert below is a clean
  // reset every run — no leftover status from a previous approve-flow test.
  await db.delete(entries).where(inArray(entries.id, [E2E_PUBLISHED_ID, E2E_REVIEW_ID]))

  const now = new Date()
  await db.insert(entries).values([
    {
      id: E2E_PUBLISHED_ID,
      audioUrl: DEAD_AUDIO_URL, // intentionally dead — tests graceful audio failure
      durationSec: PUBLISHED_ENTRY.durationSec,
      telegramMessageId: PUBLISHED_MSG_ID,
      telegramChatId: CHAT_ID,
      status: 'published',
      title: PUBLISHED_ENTRY.title,
      kalamOriginal: PUBLISHED_ENTRY.kalamOriginal,
      kalamRoman: PUBLISHED_ENTRY.kalamRoman,
      kalamEnglish: PUBLISHED_ENTRY.kalamEnglish,
      explanationOriginal: PUBLISHED_ENTRY.explanationOriginal,
      explanationEnglish: PUBLISHED_ENTRY.explanationEnglish,
      maqamId: ishq.id,
      approvedAt: now,
      publishedAt: now,
    },
    {
      id: E2E_REVIEW_ID,
      audioUrl: DEAD_AUDIO_URL,
      durationSec: REVIEW_ENTRY.durationSec,
      telegramMessageId: REVIEW_MSG_ID,
      telegramChatId: CHAT_ID,
      status: 'in_review',
      title: REVIEW_ENTRY.title,
      kalamOriginal: REVIEW_ENTRY.kalamOriginal,
      kalamRoman: REVIEW_ENTRY.kalamRoman,
      kalamEnglish: REVIEW_ENTRY.kalamEnglish,
      explanationOriginal: REVIEW_ENTRY.explanationOriginal,
      explanationEnglish: REVIEW_ENTRY.explanationEnglish,
      reviewToken: E2E_REVIEW_TOKEN,
    },
  ])
}
