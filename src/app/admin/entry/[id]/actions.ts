// actions.ts — the four server actions behind the admin detail page: save edits,
// retry a failed entry, resend the review link, and force-publish.
//
// This is the WRITE side of /admin/entry/[id] (page.tsx is the read side). Every
// action mutates real data, so every action starts with the same two lines of
// defense:
//   1. await requireAdmin() — re-check auth here, not just at the proxy. The
//      proxy is a coarse first filter; a server action must never trust that an
//      upstream check ran. (CONCEPT: defense in depth — layered checks so one
//      regression doesn't open the door.)
//   2. status guards — a status-gated action refuses to run from the wrong
//      status, so the pipeline's rulebook can't be jumped by a stray button.
'use server'

import { revalidatePath } from 'next/cache'
import { getEntryById, updateEntryFields, transition } from '@/lib/entries'
import { retryEntry } from '@/lib/pipeline'
import { sendTelegramMessage } from '@/lib/telegram'
import { requireAdmin } from '@/lib/require-admin'
import { getEnv } from '@/lib/env'

// The ONLY entry fields the admin form may write. Everything else — status,
// audioUrl, rawTranscript, the identity/provenance columns — is either owned by
// the pipeline or immutable.
//
// CONCEPT: allowlist vs blocklist. A blocklist ("strip these forbidden keys")
// fails OPEN: add a new sensitive column tomorrow and it's writable until someone
// remembers to add it to the list. An allowlist ("only these keys may pass")
// fails CLOSED: a new column is un-writable by default until deliberately added
// here. For a security boundary, always prefer the list that's safe when someone
// forgets to update it. updateEntryFields still strips forbidden keys downstream
// — two independent guards, which is the point of defense in depth.
const EDITABLE_FIELDS = [
  'title', 'kalamOriginal', 'kalamRoman', 'kalamEnglish',
  'explanationOriginal', 'explanationEnglish', 'poetId', 'maqamId',
] as const

// Save admin edits. Reads ONLY the allowlisted fields from the form — a smuggled
// `status` or `audioUrl` in the FormData is never even looked at, so it can't
// reach the repository.
export async function saveEntry(id: string, formData: FormData): Promise<void> {
  await requireAdmin()

  // Build the patch from the allowlist. Uniform rule: an empty string (a cleared
  // textarea or the "—" null option on a select) becomes null, so clearing a
  // field actually clears the column rather than storing "".
  const patch: Record<string, string | null> = {}
  for (const field of EDITABLE_FIELDS) {
    const value = formData.get(field)
    patch[field] = typeof value === 'string' && value.length > 0 ? value : null
  }

  await updateEntryFields(id, patch)
  revalidatePath('/admin/entry/' + id)
}

// Retry a failed entry: only legal from status 'failed' (retryEntry itself also
// re-checks, but we guard here so a wrong-status click fails fast and loud rather
// than reaching the pipeline). retryEntry rewinds to the failed stage's input and
// re-runs from there.
export async function retryAction(id: string): Promise<void> {
  await requireAdmin()

  const entry = await getEntryById(id)
  if (!entry || entry.status !== 'failed') {
    throw new Error(`Cannot retry entry ${id}: it is not in a failed state`)
  }

  await retryEntry(id)
  revalidatePath('/admin/entry/' + id)
}

// Resend the review link to father. Only legal from 'needs_fix' AND only when a
// reviewToken already exists (we reuse the existing token so the link father gets
// points at the same review). Moves needs_fix → in_review, then re-sends.
export async function resendReviewAction(id: string): Promise<void> {
  await requireAdmin()

  const entry = await getEntryById(id)
  if (!entry || entry.status !== 'needs_fix' || !entry.reviewToken) {
    throw new Error(`Cannot resend review for entry ${id}: not in needs_fix with a token`)
  }

  await transition(entry, 'in_review')
  const title = entry.title ?? 'Untitled'
  const link = `${getEnv().APP_URL}/review/${entry.reviewToken}`
  await sendTelegramMessage(entry.telegramChatId, `'${title}' is ready to review — ${link}`)
  revalidatePath('/admin/entry/' + id)
}

// Publish now — the admin override that skips father's approval. Legal from
// 'in_review' or 'needs_fix'. Because there's no reviewer tap here, the admin
// action stamps BOTH approvedAt and publishedAt itself (same write).
export async function publishNowAction(id: string): Promise<void> {
  await requireAdmin()

  const entry = await getEntryById(id)
  if (!entry || (entry.status !== 'in_review' && entry.status !== 'needs_fix')) {
    throw new Error(`Cannot publish entry ${id}: it is not awaiting review`)
  }

  const now = new Date()
  await transition(entry, 'published', { approvedAt: now, publishedAt: now })
  revalidatePath('/admin/entry/' + id)
}
