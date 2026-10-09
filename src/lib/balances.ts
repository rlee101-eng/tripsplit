import type { Expense, Settlement } from './types'

/**
 * Net AUD balance from `me`'s point of view.
 * Positive: the other person owes `me`. Negative: `me` owes them.
 */
export function netBalance(me: string, expenses: Expense[], settlements: Settlement[]): number {
  let net = 0
  for (const e of expenses) {
    if (e.deleted_at) continue
    const myShare = e.shares[me] ?? 0
    if (e.paid_by === me) net += e.amount_aud_minor - myShare
    else net -= myShare
  }
  for (const s of settlements) {
    if (s.deleted_at) continue
    if (s.from_user === me) net += s.amount_aud_minor
    if (s.to_user === me) net -= s.amount_aud_minor
  }
  return net
}

/** Net balance per trip id (only trips with any activity are included). */
export function balancesByTrip(
  me: string,
  expenses: Expense[],
  settlements: Settlement[],
): Map<string, number> {
  const byTrip = new Map<string, { e: Expense[]; s: Settlement[] }>()
  const bucket = (id: string) => {
    let b = byTrip.get(id)
    if (!b) byTrip.set(id, (b = { e: [], s: [] }))
    return b
  }
  for (const e of expenses) bucket(e.trip_id).e.push(e)
  for (const s of settlements) bucket(s.trip_id).s.push(s)
  const out = new Map<string, number>()
  for (const [id, b] of byTrip) out.set(id, netBalance(me, b.e, b.s))
  return out
}

/** Total each member is responsible for (their share of spending), in AUD minor units. */
export function spendingByMember(expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of expenses) {
    if (e.deleted_at) continue
    for (const [m, v] of Object.entries(e.shares)) out[m] = (out[m] ?? 0) + v
  }
  return out
}
