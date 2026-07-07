// Temporary design proof — verifies the type scale, Nastaliq descender safety,
// the whisper, and all seven valley tones render as intended. Deleted in Task 11.
const VALLEYS = [
  ['talab', 'طلب', 'Talab — Seeking'],
  ['ishq', 'عشق', 'Ishq — Love'],
  ['marifat', 'معرفت', "Ma'rifat — Knowledge"],
  ['istighna', 'استغنا', 'Istighna — Detachment'],
  ['tawhid', 'توحید', 'Tawhid — Unity'],
  ['hairat', 'حیرت', 'Hairat — Wonderment'],
  ['fana', 'فنا', 'Fana — Annihilation'],
] as const

export default function TypeProof() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-16">
      <header className="space-y-3">
        <p className="eyebrow text-gold">Design proof</p>
        <h1 className="font-display text-5xl" style={{ fontWeight: 500 }}>
          Qalandarana
        </h1>
      </header>

      <section className="space-y-4">
        <p className="eyebrow" style={{ opacity: 0.6 }}>Kalam — Nastaliq at display size</p>
        <div
          className="urdu text-3xl"
          style={{ fontSize: 'clamp(2rem, 4.5vw, 3.25rem)' }}
        >
          بلھا کیہ جاناں میں کون
        </div>
        <p className="whisper text-lg">Bulleya, ki jaana main kaun</p>
        <p className="font-body text-lg">Bulleh, who knows who I am?</p>
      </section>

      <section className="space-y-6">
        <p className="eyebrow" style={{ opacity: 0.6 }}>The seven valley tones</p>
        {VALLEYS.map(([slug, ur, en]) => (
          <div
            key={slug}
            className="rounded-sm px-6 py-8 flex items-baseline justify-between gap-6"
            style={{
              backgroundColor: `var(--valley-${slug})`,
              color: slug === 'fana' ? 'var(--ink)' : 'var(--ivory)',
            }}
          >
            <span className="urdu text-4xl">{ur}</span>
            <span className="font-display text-3xl" style={{ fontWeight: 500 }}>{en}</span>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <p className="eyebrow" style={{ opacity: 0.6 }}>Body — EB Garamond</p>
        <p className="font-body text-lg" style={{ lineHeight: 1.75, maxWidth: '62ch' }}>
          When a learned man recites a kafi of Bulleh Shah and then explains it, two
          things happen at once: the verse, and the door it opens. This archive keeps
          both — his voice first, and the meaning it carries after.
        </p>
      </section>
    </main>
  )
}
