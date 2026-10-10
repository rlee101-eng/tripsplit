import { db, setMeta } from './db'
import { nowIso } from './dates'
import { toAudMinor } from './money'
import { LOCAL_IDS } from './session'
import { computeShares } from './splits'
import type { Expense, Settlement, SplitType, Trip } from './types'

/** Sample rows use fixed ids, so loading them again replaces them instead of duplicating. */
const PREFIX = 'sample-'
const [YOU, PARTNER] = LOCAL_IDS
const MEMBERS = [YOU, PARTNER]

/** Approximate AUD per unit, so the sample works offline. */
const RATES: Record<string, number> = { AUD: 1, JPY: 0.0091 }

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Row = [
  trip: string,
  daysAgo: number,
  description: string,
  category: string,
  amountMinor: number,
  payer: string,
  split?: SplitType,
  input?: Record<string, number>,
]

// Repeated descriptions (Suica, 7-Eleven, coffee) are there to exercise the suggestions.
const ROWS: Row[] = [
  ['japan', 9, 'Ryokan in Arashiyama', 'accommodation', 48000, YOU],
  ['japan', 9, 'Suica top-up', 'transport', 5000, YOU],
  ['japan', 8, 'Ramen at Ichiran', 'food', 2960, PARTNER],
  ['japan', 8, 'Fushimi Inari guided tour', 'activities', 7000, PARTNER],
  ['japan', 7, '7-Eleven', 'groceries', 1480, YOU],
  ['japan', 7, 'Shinkansen to Osaka', 'transport', 28400, YOU],
  ['japan', 6, 'Suica top-up', 'transport', 3000, PARTNER],
  ['japan', 6, 'Izakaya dinner', 'food', 8401, YOU, 'custom_amount', { [YOU]: 3601, [PARTNER]: 4800 }],
  ['japan', 5, 'teamLab tickets', 'activities', 7600, PARTNER],
  ['japan', 5, 'Souvenirs for Mum', 'shopping', 4200, YOU, 'full_other'],
  ['japan', 4, '7-Eleven', 'groceries', 920, PARTNER],
  ['japan', 4, 'Sushi train', 'food', 5300, YOU, 'custom_percent', { [YOU]: 4000, [PARTNER]: 6000 }],
  ['tassie', 40, 'Cabin at Cradle Mountain', 'accommodation', 42000, PARTNER],
  ['tassie', 40, 'Car hire', 'transport', 18650, YOU],
  ['tassie', 39, 'Coffee', 'food', 1150, YOU],
  ['tassie', 39, 'MONA tickets', 'activities', 7000, PARTNER],
  ['tassie', 38, 'Coffee', 'food', 1100, PARTNER],
  ['tassie', 38, 'Petrol', 'transport', 6420, YOU],
]

/** Testing aid, reachable only from the dev server. Fills local mode with two trips' worth of expenses to try things out with. */
export async function loadSampleData() {
  const now = nowIso()
  const trips: Trip[] = [
    { id: `${PREFIX}japan`, name: 'Japan 2026', default_currency: 'JPY', archived: false, created_at: now, deleted_at: null, updated_at: now },
    { id: `${PREFIX}tassie`, name: 'Tassie long weekend', default_currency: 'AUD', archived: false, created_at: now, deleted_at: null, updated_at: now },
  ]

  const expenses: Expense[] = ROWS.map(([trip, ago, description, category, amount_minor, paid_by, split_type = 'equal', input], i) => {
    const currency = trip === 'japan' ? 'JPY' : 'AUD'
    const rate = RATES[currency]
    const amount_aud_minor = toAudMinor(amount_minor, currency, rate)
    const split = computeShares({ type: split_type, totalMinor: amount_minor, totalAudMinor: amount_aud_minor, payer: paid_by, members: MEMBERS, input })
    if (!split.ok) throw new Error(`Sample expense "${description}": ${split.error}`)
    return {
      id: `${PREFIX}expense-${i}`,
      trip_id: `${PREFIX}${trip}`,
      description,
      category,
      date: daysAgo(ago),
      amount_minor,
      currency,
      fx_rate_to_aud: rate,
      rate_pending: false,
      amount_aud_minor,
      paid_by,
      split_type,
      split_input: input ?? null,
      shares: split.shares,
      created_by: paid_by,
      deleted_at: null,
      updated_at: now,
    }
  })

  const settlements: Settlement[] = [
    {
      id: `${PREFIX}settlement-0`,
      trip_id: `${PREFIX}tassie`,
      from_user: YOU,
      to_user: PARTNER,
      amount_aud_minor: 5000,
      date: daysAgo(30),
      note: 'Bank transfer',
      created_by: YOU,
      deleted_at: null,
      updated_at: now,
    },
  ]

  await db.transaction('rw', db.trips, db.expenses, db.settlements, async () => {
    await db.trips.bulkPut(trips)
    await db.expenses.bulkPut(expenses)
    await db.settlements.bulkPut(settlements)
  })
  await setMeta('lastTripId', `${PREFIX}japan`)
}

/** Remove every trip, expense and payment from this device. Local mode only. */
export async function clearLocalData() {
  await db.transaction('rw', db.trips, db.expenses, db.settlements, async () => {
    await Promise.all([db.trips.clear(), db.expenses.clear(), db.settlements.clear()])
  })
}
