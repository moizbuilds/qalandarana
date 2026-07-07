// Throwaway: insert a few PUBLISHED preview entries so the Phase-2 UI can be
// screenshotted, then delete them by their marker audioUrl. Never left in prod.
import './load-env'
import { db } from '../src/lib/db'
import { entries, poets, maqamat } from '../src/lib/schema'
import { eq } from 'drizzle-orm'

const MARKER = 'https://preview.invalid/preview.ogg'

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'clean') {
    await db.delete(entries).where(eq(entries.audioUrl, MARKER))
    console.log('cleaned preview entries')
    return
  }

  const allPoets = await db.select().from(poets)
  const allMaqam = await db.select().from(maqamat)
  const poetId = (name: string) => allPoets.find((p) => p.nameEnglish === name)?.id ?? null
  const maqamId = (slug: string) => allMaqam.find((m) => m.slug === slug)?.id ?? null

  const rows = [
    {
      title: 'Ki Jaana Main Kaun', maqam: 'hairat', poet: 'Bulleh Shah',
      ko: 'بلھا کیہ جاناں میں کون\nنہ میں مومن وچ مسیتاں\nنہ میں وچ کفر دیاں ریتاں',
      kr: 'Bulleya, ki jaana main kaun\nNa main momin vich maseetan\nNa main vich kufr diyan reetan',
      ke: 'Bulleh, who knows who I am?\nNeither a believer in the mosque\nNor given to the ways of unbelief',
      eo: 'ایہہ کافی بلھے شاہ دی پہچان بارے اے۔',
      ee: 'This kafi asks the oldest question of the path: who is the "I" that seeks? Bulleh Shah answers by refusing every label the world offers him.',
      dur: 214,
    },
    {
      title: 'Heer', maqam: 'ishq', poet: 'Waris Shah',
      ko: 'ہیر آکھدی جوگیا جھوٹھ بولیں\nتینوں ماں دی سہونہ جے ناں دسیں',
      kr: 'Heer aakhdi jogiya jhooth bolein\ntainu maa di sahun je naa dasse',
      ke: 'Heer says: O yogi, you speak untruth —\nby your mother, tell me your true name',
      eo: 'وارث شاہ دی ہیر وچوں اک ٹکڑا۔',
      ee: "From Waris Shah's Heer — the moment love disguises itself as a wandering ascetic, and the beloved demands the truth beneath the disguise.",
      dur: 331,
    },
    {
      title: 'Alif', maqam: 'talab', poet: 'Sultan Bahu',
      ko: 'الف اللہ چنبے دی بوٹی\nمرشد من وچ لائی ہو',
      kr: 'Alif Allah chambe di booti\nmurshid man wich laai Hu',
      ke: 'The alif of Allah is a jasmine sprig\nthe master planted in my heart, Hu',
      eo: 'سلطان باہو دا اک بیت۔',
      ee: 'Sultan Bahu\'s abyat — every verse ends in "Hu," the breath of the divine name. Here the seeking begins as a single letter planted like a seed.',
      dur: 176,
    },
  ]

  let mid = -900000
  for (const r of rows) {
    await db.insert(entries).values({
      audioUrl: MARKER,
      durationSec: r.dur,
      telegramMessageId: mid--,
      telegramChatId: 1,
      status: 'published',
      title: r.title,
      kalamOriginal: r.ko,
      kalamRoman: r.kr,
      kalamEnglish: r.ke,
      explanationOriginal: r.eo,
      explanationEnglish: r.ee,
      corrections: [],
      poetId: poetId(r.poet),
      maqamId: maqamId(r.maqam),
      publishedAt: new Date('2026-07-07T00:00:00Z'),
      approvedAt: new Date('2026-07-07T00:00:00Z'),
    })
  }
  console.log('seeded', rows.length, 'preview entries')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
