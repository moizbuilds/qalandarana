// Tests for the poet-management server actions. The contract pinned here: auth
// is re-checked first; blank fields are rejected server-side; a unique-name
// collision returns a friendly error (not a 500); and a poet with entries can
// never be deleted.
//
// We mock every collaborator (db, require-admin, next/cache) so the tests
// exercise the actions' decisions with no database in the loop.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { requireAdmin, revalidatePath, dbInsert, dbUpdate, dbDelete, dbSelect } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  dbDelete: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock('@/lib/require-admin', () => ({ requireAdmin }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: dbInsert }),
    update: () => ({ set: () => ({ where: dbUpdate }) }),
    delete: () => ({ where: dbDelete }),
    // select().from().where().limit() — chainable, terminal is limit()
    select: () => ({ from: () => ({ where: () => ({ limit: dbSelect }) }) }),
  },
}))
vi.mock('@/lib/schema', () => ({ poets: {}, entries: { poetId: 'poetId', id: 'id' } }))

import { createPoet, updatePoet, deletePoet } from './actions'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const VALID = { nameEnglish: 'Bulleh Shah', nameOriginal: 'بلھے شاہ', era: '1680–1757', bio: 'Punjabi mystic of Kasur.' }

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockResolvedValue('admin@example.com')
  dbInsert.mockResolvedValue(undefined)
  dbUpdate.mockResolvedValue(undefined)
  dbDelete.mockResolvedValue(undefined)
  dbSelect.mockResolvedValue([]) // no attributed entries by default
})

describe('createPoet', () => {
  it('inserts a valid poet and revalidates', async () => {
    const state = await createPoet(null, form(VALID))
    expect(dbInsert).toHaveBeenCalledWith(VALID)
    expect(revalidatePath).toHaveBeenCalledWith('/admin/poets')
    expect(state).toEqual({ ok: true })
  })

  it('rejects blank fields without touching the db', async () => {
    const state = await createPoet(null, form({ ...VALID, era: '  ' }))
    expect(dbInsert).not.toHaveBeenCalled()
    expect(state).toEqual({ error: 'Every field is required.' })
  })

  it('returns a friendly error on a duplicate name (23505) instead of throwing', async () => {
    dbInsert.mockRejectedValue({ code: '23505' })
    const state = await createPoet(null, form(VALID))
    expect(state).toEqual({ error: 'A poet named "Bulleh Shah" already exists.' })
  })

  it('re-throws a non-unique db error', async () => {
    dbInsert.mockRejectedValue(new Error('connection reset'))
    await expect(createPoet(null, form(VALID))).rejects.toThrow('connection reset')
  })

  it('blocks the db write when requireAdmin throws', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))
    await expect(createPoet(null, form(VALID))).rejects.toThrow('Unauthorized')
    expect(dbInsert).not.toHaveBeenCalled()
  })
})

describe('updatePoet', () => {
  it('updates an existing poet', async () => {
    const state = await updatePoet('poet-1', null, form(VALID))
    expect(dbUpdate).toHaveBeenCalled()
    expect(state).toEqual({ ok: true })
  })

  it('blocks the write when requireAdmin throws', async () => {
    requireAdmin.mockRejectedValue(new Error('Unauthorized'))
    await expect(updatePoet('poet-1', null, form(VALID))).rejects.toThrow('Unauthorized')
    expect(dbUpdate).not.toHaveBeenCalled()
  })
})

describe('deletePoet', () => {
  it('deletes a poet with no entries', async () => {
    dbSelect.mockResolvedValue([]) // none attributed
    await deletePoet('poet-1')
    expect(dbDelete).toHaveBeenCalled()
  })

  it('throws and does NOT delete a poet that has entries', async () => {
    dbSelect.mockResolvedValue([{ id: 'entry-1' }])
    await expect(deletePoet('poet-1')).rejects.toThrow(/cannot be deleted/)
    expect(dbDelete).not.toHaveBeenCalled()
  })
})
