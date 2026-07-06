// review-message.ts — the ONE place that builds father's review-invitation text.
//
// Two call sites need this exact string: the pipeline's send_review stage (the
// first send) and the admin's resendReviewAction (a re-send of the same link).
// Before this file existed, both places built the string by hand — same URL
// shape, same wording, same 'Untitled' fallback, typed out twice. That's a
// one-source-of-truth violation: change the wording in one spot and the other
// silently drifts, and nothing would catch it until someone noticed father got
// a different-looking message depending on which button sent it.
//
// CONCEPT: extracting a tiny pure function isn't over-engineering here — it's
// the minimum fix for "this fact is written in two places." No config, no
// class, no options object: just the one function both sites call.

import { getEnv } from './env'

// Build the review-invitation message for a given entry's title and token.
// `title` is nullable because a fresh entry may not have one yet — we fall
// back to 'Untitled' rather than sending a message with a blank name.
export function buildReviewMessage(title: string | null, token: string): string {
  const link = `${getEnv().APP_URL}/review/${token}`
  return `'${title ?? 'Untitled'}' is ready to review — ${link}`
}
