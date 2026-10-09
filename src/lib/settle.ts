import { balancesByTrip } from './balances'
import { todayLocal, uuid } from './dates'
import type { Expense, Settlement } from './types'

type NewSettlement = Omit<Settlement, 'updated_at' | 'dirty' | 'server_updated_at'>

/** A settlement that brings `me`'s balance with `partner` to zero for the given net. */
export function settlementFor(
  me: string,
  partner: string,
  tripId: string,
  net: number,
  note = 'Marked as settled',
): NewSettlement | null {
  if (net === 0) return null
  // net > 0: partner owes me, so partner pays me.
  return {
    id: uuid(),
    trip_id: tripId,
    from_user: net > 0 ? partner : me,
    to_user: net > 0 ? me : partner,
    amount_aud_minor: Math.abs(net),
    date: todayLocal(),
    note,
    created_by: me,
    deleted_at: null,
  }
}

/** One settlement per trip with an outstanding balance, so every trip ends at zero. */
export function settleEverything(
  me: string,
  partner: string,
  expenses: Expense[],
  settlements: Settlement[],
): NewSettlement[] {
  const out: NewSettlement[] = []
  for (const [tripId, net] of balancesByTrip(me, expenses, settlements)) {
    const s = settlementFor(me, partner, tripId, net)
    if (s) out.push(s)
  }
  return out
}
