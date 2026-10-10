import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Plus } from 'lucide-react'
import { db } from '../lib/db'
import { netBalance, spendingByMember } from '../lib/balances'
import { formatAud } from '../lib/money'
import { useSession } from '../lib/session'
import { settlementFor } from '../lib/settle'
import { deleteSettlement, saveSettlement } from '../lib/mutations'
import { CATEGORIES } from '../lib/types'
import { BalanceCard } from '../components/BalanceCard'
import { CatPlane } from '../components/Cats'
import { ActivityList, mergeActivity } from '../components/Activity'
import { BackButton, Empty, Header } from '../components/Layout'
import { CategoryIcon } from '../components/Icons'
import { TripEditor } from '../components/TripEditor'

export function TripPage({ id }: { id: string }) {
  const { me, partner, name } = useSession()
  const trip = useLiveQuery(() => db.trips.get(id), [id])
  const allTrips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at).toArray(), [])
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(id).toArray(), [id])
  const settlements = useLiveQuery(() => db.settlements.where('trip_id').equals(id).toArray(), [id])
  const [filter, setFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  if (!trip || !expenses || !settlements) return <Header title="Trip" left={<BackButton href="#/" />} />

  const live = expenses.filter((e) => !e.deleted_at)
  // Other trips for the switcher in the title: current ones first, newest first.
  const others = (allTrips ?? [])
    .filter((t) => t.id !== id)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || b.created_at.localeCompare(a.created_at))
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
      <Header
        left={<BackButton href="#/" />}
        title={
          others.length === 0 ? (
            trip.name
          ) : (
            <label className="title-select">
              <span>{trip.name}</span>
              <ChevronDown size={16} strokeWidth={2} aria-hidden />
              {/* Replace, so Back still leads home however many trips you hop between. */}
              <select className="overlay" aria-label="Switch trip" value={id} onChange={(e) => location.replace(`#/trip/${e.target.value}`)}>
                <option value={id}>{trip.name}</option>
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      <main>
        {partner && (
          <BalanceCard
            net={net}
            label="This trip"
            decoration={<CatPlane happy={net === 0} />}
            partialHref={`#/settle?trip=${id}`}
            onSettle={async () => {
              const s = settlementFor(me, partner.user_id, id, net)
              if (s) await saveSettlement(s, 'Marked as settled')
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
          <Empty cat="calico">No expenses yet. Add the first one below.</Empty>
        ) : (
          <ActivityList items={items} onSettlementTap={onSettlementTap} />
        )}

        <div className="trip-settings">
          {editing ? (
            <TripEditor trip={trip} expenseCount={live.length} onDone={() => setEditing(false)} />
          ) : (
            <button className="link" onClick={() => setEditing(true)}>
              Rename or archive this trip
            </button>
          )}
        </div>
      </main>

      {!trip.archived && !editing && (
        <a className="fab" href={`#/expense?trip=${id}`}>
          <Plus size={20} strokeWidth={2.25} aria-hidden /> Add expense
        </a>
      )}
    </>
  )
}
