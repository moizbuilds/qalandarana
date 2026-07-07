// admin/poets/page.tsx — manage the poets the pipeline attributes entries to.
// Utilitarian, like the rest of the workbench: a create form, then every poet
// with an inline edit form and their entry count. Plain by design.
import Link from 'next/link'
import { listPoetsWithCounts } from '@/lib/entries'
import { CreatePoetForm, EditPoetForm } from './PoetForms'

export const dynamic = 'force-dynamic'

export default async function AdminPoetsPage() {
  const poets = await listPoetsWithCounts()

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Poets</h1>
        <Link href="/admin" className="text-sm text-blue-700 underline">← Entries</Link>
      </header>

      <CreatePoetForm />

      <section className="space-y-4">
        {poets.map((poet) => (
          <EditPoetForm key={poet.id} poet={poet} />
        ))}
      </section>
    </main>
  )
}
