import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import { db } from '../lib/db'
import { balancesByTrip, netBalance } from '../lib/balances'
import { CURRENCIES, formatAud } from '../lib/money'
import { useSession } from '../lib/session'
import { settleEverything } from '../lib/settle'
import { createTrip, saveSettlements } from '../lib/mutations'
import { go } from '../lib/router'
import type { Trip } from '../lib/types'
import { BalanceCard } from '../components/BalanceCard'
import { Header } from '../components/Layout'
import { WaitingForPartner } from '../components/WaitingForPartner'
import { TripStamp } from '../components/Icons'

/** The overall balance, then every trip with its own balance. */
export function Home() {
  const { me, meMember, partner } = useSession()
  const expenses = useLiveQuery(() => db.expenses.toArray(), [])
  const settlements = useLiveQuery(() => db.settlements.toArray(), [])
  const trips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at).toArray(), [])
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  if (!expenses || !settlements || !trips) return <Header title="TripSplit" />

  const net = netBalance(me, expenses, settlements)
  const byTrip = balancesByTrip(me, expenses, settlements)
  const counts = new Map<string, number>()
  for (const e of expenses) if (!e.deleted_at) counts.set(e.trip_id, (counts.get(e.trip_id) ?? 0) + 1)

  const sorted = [...trips].sort((a, b) => b.created_at.localeCompare(a.created_at))
  // An archived trip with money still owing stays in the main list until it's settled.
  const isCurrent = (t: Trip) => !t.archived || (byTrip.get(t.id) ?? 0) !== 0
  const current = sorted.filter(isCurrent)
  const archived = sorted.filter((t) => !isCurrent(t))

  const row = (t: Trip) => {
    const b = byTrip.get(t.id) ?? 0
    const n = counts.get(t.id) ?? 0
    return (
      <li key={t.id}>
        <a className="row" href={`#/trip/${t.id}`}>
          <TripStamp currency={t.default_currency} />
          <span className="row-main">
            <span className="row-title">{t.name}</span>
            <span className="row-sub">
              {n} {n === 1 ? 'expense' : 'expenses'}
              {t.archived ? ' · Archived' : ''}
            </span>
          </span>
          <span className={`row-amount ${b > 0 ? 'pos' : b < 0 ? 'neg' : ''}`}>
            {b === 0 ? (
              <small>all square</small>
            ) : (
              <>
                <small>{b > 0 ? 'owed to you' : 'you owe'}</small>
                {formatAud(Math.abs(b))}
              </>
            )}
          </span>
          <ChevronRight className="row-chevron" size={18} strokeWidth={1.75} aria-hidden />
        </a>
      </li>
    )
  }

  return (
    <>
      <Header title="TripSplit" />
      <main>
        <div className="greeting">
          <span>{greeting()}</span>
          <h2>{meMember?.display_name && partner ? `${meMember.display_name} & ${partner.display_name}` : 'Welcome'}</h2>
        </div>
        {!partner ? (
          <WaitingForPartner />
        ) : (
          <BalanceCard
            net={net}
            label="Overall balance"
            partialHref="#/settle"
            onSettle={() => saveSettlements(settleEverything(me, partner.user_id, expenses, settlements))}
          />
        )}

        <h2 className="section-title">
          Trips
          {!creating && trips.length > 0 && (
            <button className="btn small tonal" onClick={() => setCreating(true)}>
              <Plus size={16} strokeWidth={2.25} aria-hidden /> New trip
            </button>
          )}
        </h2>

        {(creating || trips.length === 0) && <NewTrip onCancel={trips.length > 0 ? () => setCreating(false) : undefined} />}

        {current.length > 0 && <ul className="list card">{current.map(row)}</ul>}

        {archived.length > 0 && (
          <>
            <button className="link archived-toggle" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
            </button>
            {showArchived && <ul className="list card">{archived.map(row)}</ul>}
          </>
        )}
      </main>
    </>
  )
}

function NewTrip({ onCancel }: { onCancel?: () => void }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('JPY')

  const add = async () => {
    if (!name.trim()) return
    go(`#/trip/${await createTrip(name.trim(), currency)}`)
  }

  return (
    <div className="card form compact new-trip">
      <label className="field">
        <span>Trip name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan 2026" autoFocus={!!onCancel} />
      </label>
      <label className="field">
        <span>Currency you'll mostly spend in</span>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code} – {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        <span className="grow" />
        {onCancel && (
          <button className="btn small ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn small primary" onClick={add} disabled={!name.trim()}>
          Create trip
        </button>
      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
