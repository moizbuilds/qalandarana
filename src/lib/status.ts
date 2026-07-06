// The pipeline's rulebook. Every status change in the app goes through
// assertTransition, so an entry can never silently skip a stage.
// The `entry_status` pg enum in src/lib/schema.ts (Task 3) is this module's
// DB-side twin: it lists the same 7 values to guard the database, while this
// file guards the runtime transition logic. Two enforcers, one shared vocabulary.
// CONCEPT: this is a "state machine" — a fixed map of which states may
// follow which. The naive alternative (set status anywhere, to anything)
// is how half-processed entries end up published.

export const STATUSES = ['received', 'transcribed', 'structured', 'in_review', 'needs_fix', 'published', 'failed'] as const
export type EntryStatus = (typeof STATUSES)[number]
export type Stage = 'transcribe' | 'structure' | 'send_review'

const LEGAL: Record<EntryStatus, readonly EntryStatus[]> = {
  received: ['transcribed', 'failed'],
  transcribed: ['structured', 'failed'],
  structured: ['in_review', 'failed'],
  in_review: ['published', 'needs_fix'],
  needs_fix: ['in_review', 'published'],   // admin fixes then republishes or resends review
  published: [],
  failed: ['received', 'transcribed', 'structured'], // retry rewinds to the failed stage's input
}

export function assertTransition(from: EntryStatus, to: EntryStatus): void {
  if (!LEGAL[from].includes(to)) throw new Error(`Illegal status transition: ${from} → ${to}`)
}

const NEXT_STAGE: Partial<Record<EntryStatus, Stage>> = {
  received: 'transcribe', transcribed: 'structure', structured: 'send_review',
}
export function stageForStatus(status: EntryStatus): Stage | null {
  return NEXT_STAGE[status] ?? null
}

const STAGE_INPUT: Record<Stage, EntryStatus> = {
  transcribe: 'received', structure: 'transcribed', send_review: 'structured',
}
export function retryStatusFor(stage: Stage): EntryStatus {
  return STAGE_INPUT[stage]
}
