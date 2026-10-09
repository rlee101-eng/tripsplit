import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { netBalance, spendingByMember } from '../lib/balances'
import { formatAud } from '../lib/money'
import { useSession } from '../lib/session'
import { settlementFor } from '../lib/settle'
import { deleteSettlement, saveSettlement } from '../lib/mutations'
import { CATEGORIES } from '../lib/types'
import { BalanceCard } from '../components/BalanceCard'
import { ActivityList, mergeActivity } from '../components/Activity'
import { BackButton, Empty, Header } from '../components/Layout'
import { CategoryIcon } from '../components/Icons'

export function TripPage({ id }: { id: string }) {
  const { me, partner, name } = useSession()
  const trip = useLiveQuery(() => db.trips.get(id), [id])
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(id).toArray(), [id])
  const settlements = useLiveQuery(() => db.settlements.where('trip_id').equals(id).toArray(), [id])
  const [filter, setFilter] = useState<string | null>(null)

  if (!trip || !expenses || !settlements) return <Header title="Trip" left={<BackButton href="#/trips" />} />

  const live = expenses.filter((e) => !e.deleted_at)
  const net = netBalance(me, expenses, settlements)
  const total = live.reduce((a, e) => a + e.amount_aud_minor, 0)
  const shares = spendingByMember(live)
  const catTotals = new Map<string, number>()
  for (const e of live) catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amount_aud_minor)

  const shown = filter ? live.filter((e) => e.category === filter) : live
  const items = mergeActivity(shown, filter ? [] : settlements)

  const onSettlementTap = (s: { id: string; amount_aud_minor: number }) => {
    if (confirm(`Undo this settlement of ${formatAud(s.amount_aud_minor)}?`)) void deleteSettlement(s.id)
  }

  return (
    <>
      <Header title={trip.name} left={<BackButton href="#/trips" />} />
      <main>
        {partner && (
          <BalanceCard
            net={net}
            label="This trip"
            partialHref={`#/settle?trip=${id}`}
            onSettle={async () => {
              const s = settlementFor(me, partner.user_id, id, net)
              if (s) await saveSettlement(s)
            }}
          />
        )}

        <div className="stats">
          <div>
            <span className="stat-label">Total spent</span>
            <span className="stat-value">{formatAud(total)}</span>
          </div>
          <div>
            <span className="stat-label">Your share</span>
            <span className="stat-value">{formatAud(shares[me] ?? 0)}</span>
          </div>
          {partner && (
            <div>
              <span className="stat-label">{name(partner.user_id)}'s share</span>
              <span className="stat-value">{formatAud(shares[partner.user_id] ?? 0)}</span>
            </div>
          )}
        </div>

        {catTotals.size > 0 && (
          <div className="chips scroll">
            <button className={`chip ${filter === null ? 'on' : ''}`} onClick={() => setFilter(null)}>
              All
            </button>
            {CATEGORIES.filter((c) => catTotals.has(c.id)).map((c) => (
              <button
                key={c.id}
                className={`chip ${filter === c.id ? 'on' : ''}`}
                onClick={() => setFilter(filter === c.id ? null : c.id)}
              >
                <CategoryIcon id={c.id} size={16} /> {c.label} <small>{formatAud(catTotals.get(c.id)!)}</small>
              </button>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <Empty>
            No expenses yet. Tap <b>+</b> to add one.
          </Empty>
        ) : (
          <ActivityList items={items} onSettlementTap={onSettlementTap} />
        )}
      </main>
    </>
  )
}
