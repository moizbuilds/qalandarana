# Qalandarana

Fawad Rana records sufi *kalam* and explanations as voice notes; Qalandarana turns
them into transcribed, translated, poet-attributed entries on a "Seven Valleys"
journey site — after he taps **Approve**. The name folds *Qalandar* (the wandering
dervish) into *Rana* (the family name).

## Pipeline

```
Father ─voice note─▶ Moiz's WhatsApp ─2-tap forward─▶ Telegram bot
                                                        │ webhook (secret token in URL, sender allowlist)
                                                        ▼
                                          /api/telegram/webhook
                                          1. .ogg → Vercel Blob (immutable original)
                                          2. entries row → Neon (status: received)
                                          3. bot replies "Got it 🌙 processing…"
                                                        │
                                     staged pipeline (each stage = one short route)
                                     received → transcribed → structured → in_review → published
                                     (side states: needs_fix, failed)
                                                        │
                                     transcribe: Whisper adapter (transcribe(audioUrl) → rawText)
                                     structure:  LLM adapter (structureEntry(transcript) → entry JSON)
                                                        │
                                                        ▼
                                     bot sends review link → father taps Approve & publish
                                                        │
                                                        ▼
                                     Journey site reads only status = published
```

## Stack

Next.js (App Router, TypeScript strict) on Vercel · Drizzle ORM → Neon Postgres ·
Vercel Blob (audio) · OpenAI Whisper · Claude/GPT structuring behind swappable
adapters · Vitest.

## Develop

```bash
npm install                  # install dependencies
cp .env.example .env.local   # then fill in real values (see .env.example)
npm run dev                  # http://localhost:3000
npm test                     # Vitest (unit + pipeline tests)
```

## Docs

- Design spec: [`docs/superpowers/specs/2026-07-05-qalandarana-design.md`](docs/superpowers/specs/2026-07-05-qalandarana-design.md)
- Phase 1 plan (the spine): [`docs/superpowers/plans/2026-07-05-qalandarana-phase-1-spine.md`](docs/superpowers/plans/2026-07-05-qalandarana-phase-1-spine.md)
