import { db, setMeta } from './db'
import { nowIso, uuid } from './dates'
import { requestSync } from './sync'
import { offerUndo } from './undo'
import type { Expense, Settlement, Trip } from './types'

type New<T> = Omit<T, 'updated_at' | 'dirty' | 'server_updated_at'>

function stamp<T>(row: T): T & { updated_at: string; dirty: 1 } {
  return { ...row, updated_at: nowIso(), dirty: 1 }
}

export async function saveExpense(e: New<Expense>) {
  const before = await db.expenses.get(e.id)
  await db.expenses.put(stamp(e))
  await setMeta('lastTripId', e.trip_id)
  requestSync()
  offerUndo(before ? 'Expense updated' : 'Expense added', async () => {
    if (before) await db.expenses.put(stamp(before))
    else await db.expenses.update(e.id, { deleted_at: nowIso(), updated_at: nowIso(), dirty: 1 })
    requestSync()
  })
}

export async function deleteExpense(id: string) {
  await db.expenses.update(id, { deleted_at: nowIso(), updated_at: nowIso(), dirty: 1 })
  requestSync()
  offerUndo('Expense deleted', async () => {
    await db.expenses.update(id, { deleted_at: null, updated_at: nowIso(), dirty: 1 })
    requestSync()
  })
}

export async function createTrip(name: string, default_currency: string): Promise<string> {
  const id = uuid()
  await db.trips.put(
    stamp({ id, name, default_currency, archived: false, created_at: nowIso(), deleted_at: null }),
  )
  requestSync()
  return id
}

export async function updateTrip(id: string, changes: Partial<Pick<Trip, 'name' | 'default_currency' | 'archived' | 'deleted_at'>>) {
  await db.trips.update(id, { ...changes, updated_at: nowIso(), dirty: 1 })
  requestSync()
}

export async function saveSettlement(s: New<Settlement>, label = 'Payment recorded') {
  await saveSettlements([s], label)
}

export async function saveSettlements(list: New<Settlement>[], label = 'Payment recorded') {
  if (!list.length) return
  await db.settlements.bulkPut(list.map(stamp))
  requestSync()
  offerUndo(label, async () => {
    await db.settlements
      .where('id')
      .anyOf(list.map((s) => s.id))
      .modify({ deleted_at: nowIso(), updated_at: nowIso(), dirty: 1 })
    requestSync()
  })
}

export async function deleteSettlement(id: string) {
  await db.settlements.update(id, { deleted_at: nowIso(), updated_at: nowIso(), dirty: 1 })
  requestSync()
  offerUndo('Payment removed', async () => {
    await db.settlements.update(id, { deleted_at: null, updated_at: nowIso(), dirty: 1 })
    requestSync()
  })
}

export async function renameMember(user_id: string, display_name: string) {
  await db.members.update(user_id, { display_name, updated_at: nowIso(), dirty: 1 })
  requestSync()
}
