// seed.ts — populates the fixed reference data the app needs to exist.
//
// It seeds the seven maqamat (Attar's Seven Valleys — the journey's fixed
// stages), the six core Punjabi Sufi poets, and the single admin account. Run
// via `npm run db:seed` (which runs it through tsx — a TypeScript runner).
//
// Idempotent by design: every insert is an upsert keyed on a unique column, so
// running it twice never creates duplicates. That matters because seeds run on
// every fresh environment and re-run whenever the reference data changes.
//
// NOTE: this uses RELATIVE imports (../src/lib/...) rather than the '@/' alias.
// tsx does not read tsconfig `paths` at runtime, so '@/' would fail when this
// script actually runs; relative paths resolve under both tsc and tsx.
import 'dotenv/config'
import { db } from '../src/lib/db'
import { maqamat, poets, admins } from '../src/lib/schema'
import { getEnv } from '../src/lib/env'

const VALLEYS = [
  { slug: 'talab', nameEnglish: 'Talab — Seeking', nameOriginal: 'طلب', orderIndex: 1, description: 'The seeker abandons comfort and sets out, not knowing what they seek — only that they must.' },
  { slug: 'ishq', nameEnglish: 'Ishq — Love', nameOriginal: 'عشق', orderIndex: 2, description: 'Reason is left at the door. Love burns the map the seeker was carrying.' },
  { slug: 'marifat', nameEnglish: "Ma'rifat — Knowledge", nameOriginal: 'معرفت', orderIndex: 3, description: 'Each seeker now sees the truth by their own inner light, not by borrowed lamps.' },
  { slug: 'istighna', nameEnglish: 'Istighna — Detachment', nameOriginal: 'استغنا', orderIndex: 4, description: 'The world grows small; crowns and thrones weigh less than a sparrow’s feather.' },
  { slug: 'tawhid', nameEnglish: 'Tawhid — Unity', nameOriginal: 'توحید', orderIndex: 5, description: 'The many faces resolve into One. Every direction the seeker turns, one Beloved.' },
  { slug: 'hairat', nameEnglish: 'Hairat — Wonderment', nameOriginal: 'حیرت', orderIndex: 6, description: 'Certainty dissolves into awe. The seeker knows nothing, and it is enough.' },
  { slug: 'fana', nameEnglish: 'Fana — Annihilation', nameOriginal: 'فنا', orderIndex: 7, description: 'The drop returns to the ocean and finds it was the ocean all along.' },
]
const POETS = [
  { nameEnglish: 'Bulleh Shah', nameOriginal: 'بلھے شاہ', era: '1680–1757', bio: 'Punjabi mystic of Kasur; tore down every wall between lover and Beloved, cleric and dancer.' },
  { nameEnglish: 'Baba Farid', nameOriginal: 'بابا فرید', era: '1173–1266', bio: 'Chishti saint of Pakpattan; his shlokas are the oldest Punjabi verse we have, austere and tender.' },
  { nameEnglish: 'Shah Hussain', nameOriginal: 'شاہ حسین', era: '1538–1599', bio: 'Lahore’s red-robed faqir; wrote kafis in the voice of the spinning girl at her wheel.' },
  { nameEnglish: 'Waris Shah', nameOriginal: 'وارث شاہ', era: '1722–1798', bio: 'Told Heer Ranjha so completely that Punjab reads its own soul in it.' },
  { nameEnglish: 'Sultan Bahu', nameOriginal: 'سلطان باہو', era: '1630–1691', bio: 'Every verse ends in Hu — the breath of the Divine name; planted the alif of love in the heart’s soil.' },
  { nameEnglish: 'Khwaja Ghulam Farid', nameOriginal: 'خواجہ غلام فرید', era: '1845–1901', bio: 'Sang the Rohi desert of Bahawalpur as the landscape of longing itself.' },
]

async function main() {
  // Maqamat can change wording, so upsert-and-update by slug.
  for (const v of VALLEYS) await db.insert(maqamat).values(v).onConflictDoUpdate({ target: maqamat.slug, set: v })
  // Poets are stable; do-nothing on re-run avoids clobbering any manual edits.
  for (const p of POETS) await db.insert(poets).values(p).onConflictDoNothing()
  const env = getEnv()
  await db.insert(admins).values({ email: env.ADMIN_EMAIL, passwordHash: env.ADMIN_PASSWORD_HASH })
    .onConflictDoUpdate({ target: admins.email, set: { passwordHash: env.ADMIN_PASSWORD_HASH } })
  console.log('Seeded: 7 maqamat, 6 poets, 1 admin')
}
// .catch here is the review finding from Task 3: without it, if any insert
// rejects, tsx would print an "unhandled promise rejection" and exit 0 — a
// SILENT seed failure that looks like success. Catching it logs the real error
// and exits non-zero, so a broken seed fails loudly (fail closed, checklist #4).
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
