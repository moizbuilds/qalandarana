// advance-call.ts — the ONE place that knows how to kick the pipeline forward.
//
// Both entry doors need to POST to /api/pipeline/advance with the internal
// secret: the webhook fires it once after storing a new note, and the advance
// route fires it AGAIN to chain into the next stage. Writing that request shape
// (URL, header name, body) in both files would be two copies that could drift —
// change the header name in one and the pipeline silently 401s itself. So it
// lives here once.
//
// CONCEPT: this returns the fetch PROMISE rather than awaiting it. Callers hand
// that promise to `waitUntil()` (from @vercel/functions), which tells Vercel
// "keep the function alive until this settles, but don't make the response wait
// on it." That is how one stage triggers the next in a SEPARATE invocation
// without blocking the HTTP reply — fire-and-forget, but not dropped.
import { getEnv } from './env'

// Build and send the advance request for an entry. Fire-and-forget: the caller
// wraps the returned promise in waitUntil so a slow/failed next stage never
// delays or fails the current response.
export function triggerAdvance(entryId: string): Promise<Response> {
  const { APP_URL, INTERNAL_API_SECRET } = getEnv()
  return fetch(`${APP_URL}/api/pipeline/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_API_SECRET },
    body: JSON.stringify({ entryId }),
  })
}
