// actions.ts — poet management for the workbench. Every action re-checks admin
// auth first (the proxy is only a coarse filter; a Server Action is a POST that
// must guard itself). Poets are the one piece of reference data an admin edits
// by hand — the pipeline attributes entries to them, so their names must be
// right.
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { poets, entries } from '@/lib/schema'
import { requireAdmin } from '@/lib/require-admin'

export type PoetFormState = { error: string } | { ok: true } | null

// Pull the four poet fields off the form, trimmed. Returns null if any required
// field is blank — presence is validated server-side, never trusting the client.
function readPoetFields(formData: FormData) {
  const nameEnglish = String(formData.get('nameEnglish') ?? '').trim()
  const nameOriginal = String(formData.get('nameOriginal') ?? '').trim()
  const era = String(formData.get('era') ?? '').trim()
  const bio = String(formData.get('bio') ?? '').trim()
  if (!nameEnglish || !nameOriginal || !era || !bio) return null
  return { nameEnglish, nameOriginal, era, bio }
}

// CONCEPT: Postgres raises SQLSTATE 23505 on a unique-constraint violation. The
// poets.name_english column is unique, so two poets can't share an English name.
// We catch that specific case and return a friendly error instead of letting a
// raw 500 surface — any other error is a real fault and re-thrown.
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code
    ?? (err as { cause?: { code?: string } })?.cause?.code
  return code === '23505' || /unique|duplicate key/i.test(String(err))
}

export async function createPoet(
  _prevState: PoetFormState,
  formData: FormData,
): Promise<PoetFormState> {
  await requireAdmin()
  const fields = readPoetFields(formData)
  if (!fields) return { error: 'Every field is required.' }

  try {
    await db.insert(poets).values(fields)
  } catch (err) {
    if (isUniqueViolation(err)) return { error: `A poet named "${fields.nameEnglish}" already exists.` }
    throw err
  }
  revalidatePath('/admin/poets')
  return { ok: true }
}

export async function updatePoet(
  id: string,
  _prevState: PoetFormState,
  formData: FormData,
): Promise<PoetFormState> {
  await requireAdmin()
  const fields = readPoetFields(formData)
  if (!fields) return { error: 'Every field is required.' }

  try {
    await db.update(poets).set(fields).where(eq(poets.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) return { error: `A poet named "${fields.nameEnglish}" already exists.` }
    throw err
  }
  revalidatePath('/admin/poets')
  return { ok: true }
}

// Delete is allowed ONLY for a poet with no entries — an attributed poet is
// referenced by published kalam, so removing them would orphan the record.
export async function deletePoet(id: string): Promise<void> {
  await requireAdmin()
  const [attributed] = await db.select({ id: entries.id }).from(entries).where(eq(entries.poetId, id)).limit(1)
  if (attributed) {
    throw new Error('This poet has entries attributed to them and cannot be deleted.')
  }
  await db.delete(poets).where(eq(poets.id, id))
  revalidatePath('/admin/poets')
}
