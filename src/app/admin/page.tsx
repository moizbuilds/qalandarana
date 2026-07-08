// admin/page.tsx — the workbench dashboard: every entry, newest first, as one
// scannable table. This is Moiz's operational view of the whole pipeline — what
// came in, where each entry is, and which ones broke.
//
// CONCEPT: a server component fetches on the server. It awaits listEntries()
// straight from the repository and returns finished HTML — no client fetch, no
// loading state. The proxy (src/proxy.ts) has already gated this route, but the
// data-reading pages don't mutate anything, so the per-action requireAdmin()
// re-check lives on the write actions, not here.
//
// Phase 1 styling is deliberately plain — this is a utilitarian workbench, and it
// STAYS one by design. The public site gets the "Night Journey" beauty in Phase 2.
import Link from 'next/link'
import { listEntries } from '@/lib/entries'
import { getEnv } from '@/lib/env'
import { STATUSES, type EntryStatus } from '@/lib/status'

// A muted color per status so the eye can triage the table at a glance. failed is
// loud (red); published is calm (green); everything mid-pipeline is neutral.
const STATUS_STYLES: Record<EntryStatus, string> = {
  received: 'bg-gray-100 text-gray-700',
  transcribed: 'bg-gray-100 text-gray-700',
  structured: 'bg-gray-100 text-gray-700',
  in_review: 'bg-blue-100 text-blue-800',
  needs_fix: 'bg-amber-100 text-amber-800',
  published: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

// Render the createdAt timestamp as a short, unambiguous date-time. Kept inline
// (not in format.ts) because it's admin-only presentation nothing else shares.
function formatCreated(date: Date): string {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Next prerenders pages at build time by default; this one must read the DB per-request.
export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const entries = await listEntries()
  const appUrl = getEnv().APP_URL

  // Counts per status for the summary strip — only statuses that actually occur
  // are shown, in the canonical pipeline order.
  const counts = new Map<EntryStatus, number>()
  for (const e of entries) counts.set(e.status as EntryStatus, (counts.get(e.status as EntryStatus) ?? 0) + 1)

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Entries</h1>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/admin/poets" className="text-blue-700 underline">Poets</Link>
          <span className="text-gray-500">{entries.length} total</span>
        </nav>
      </header>

      {/* Status board — where everything stands at a glance. */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.filter((s) => counts.get(s)).map((s) => (
          <span key={s} className={`rounded px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[s]}`}>
            {s} · {counts.get(s)}
          </span>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-gray-500">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium">Title</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Review link</th>
                <th className="p-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                // An entry awaiting father's blessing has a shareable review URL;
                // surfacing it here lets Moiz re-send the link if father lost it.
                const awaitingReview = entry.status === 'in_review' || entry.status === 'needs_fix'
                const reviewUrl = awaitingReview && entry.reviewToken
                  ? `${appUrl}/review/${entry.reviewToken}`
                  : null
                return (
                  <tr key={entry.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="whitespace-nowrap p-3 text-gray-500">{formatCreated(entry.createdAt)}</td>
                    <td className="p-3">
                      <Link href={`/admin/entry/${entry.id}`} className="font-medium text-blue-700 underline">
                        {entry.title ?? 'Untitled'}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[entry.status as EntryStatus]}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {reviewUrl ? (
                        <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                          open
                        </a>
                      ) : null}
                    </td>
                    {/* errorMessage only shows for failed entries; red so it can't be missed. */}
                    <td className="p-3 text-red-700">{entry.errorMessage ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
