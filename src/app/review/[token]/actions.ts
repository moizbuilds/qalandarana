// actions.ts — the two server actions behind father's review buttons.
//
// This is the write-side of the review page (page.tsx is the read-side). Each
// function takes the secret review token, finds the entry, and moves its status
// through the pipeline's rulebook (transition() in the entries repo).
//
// CONCEPT: a Server Action is a function marked 'use server' that a <form> can
// post to directly — no API route, no fetch, no JSON plumbing. Next compiles it
// into a POST endpoint and swaps the client reference for a call to it. The page
// binds the token with `.bind(null, token)` so the form submit calls it with the
// right entry's token.
'use server'

import { revalidatePath } from 'next/cache'
import { getEntryByReviewToken, transition } from '@/lib/entries'
import { notifyAdmin } from '@/lib/telegram'

// The review link lives in a Telegram chat, so we must assume father can tap a
// button twice, reload the page, and tap again. Each action is therefore
// IDEMPOTENT: once the entry has reached the target state, a repeat tap is a
// silent no-op. Without this guard, a double-tap on Approve would call
// transition(published → published) — illegal in the state machine — and, worse,
// re-stamp approvedAt/publishedAt with a later time, corrupting the record of
// when it was actually approved.

// Approve & publish. Legal from in_review OR needs_fix; both moves are allowed
// by the status machine. Stamps approvedAt and publishedAt in the same write.
export async function approveEntry(token: string): Promise<void> {
  const entry = await getEntryByReviewToken(token)
  if (!entry) throw new Error('Not found')
  if (entry.status === 'published') return // idempotent: already done, don't re-stamp

  const now = new Date()
  await transition(entry, 'published', { approvedAt: now, publishedAt: now })
  // CONCEPT: Next caches the server-rendered page; revalidatePath busts that
  // cache entry so a reload shows the new "✓ Published" state, not the stale form.
  revalidatePath('/review/[token]', 'page')
}

// Flag as "something's wrong". Moves in_review → needs_fix and pings the admin
// (Moiz) so he can fix and re-review. No-op if already published (can't unpublish
// here) or already needs_fix (a repeat flag would send a duplicate admin ping).
export async function flagEntry(token: string): Promise<void> {
  const entry = await getEntryByReviewToken(token)
  if (!entry) throw new Error('Not found')
  if (entry.status === 'published' || entry.status === 'needs_fix') return // idempotent

  await transition(entry, 'needs_fix')
  await notifyAdmin(`"${entry.title ?? 'Untitled'}" flagged by reviewer`)
  revalidatePath('/review/[token]', 'page')
}
