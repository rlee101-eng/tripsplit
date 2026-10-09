import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { CURRENCIES } from '../lib/money'
import { createTrip, updateTrip } from '../lib/mutations'
import { go } from '../lib/router'
import type { Trip } from '../lib/types'
import { Empty, Header } from '../components/Layout'

export function Trips() {
  const trips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at).toArray(), [])
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    await db.expenses.each((e) => {
      if (!e.deleted_at) m.set(e.trip_id, (m.get(e.trip_id) ?? 0) + 1)
    })
    return m
  }, [])
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('JPY')
  const [editing, setEditing] = useState<string | null>(null)

  const sorted = [...(trips ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const active = sorted.filter((t) => !t.archived)
  const archived = sorted.filter((t) => t.archived)

  const add = async () => {
    if (!name.trim()) return
    const id = await createTrip(name.trim(), currency)
    setName('')
    go(`#/trip/${id}`)
  }

  const row = (t: Trip) =>
    editing === t.id ? (
      <TripEditor key={t.id} trip={t} expenseCount={counts?.get(t.id) ?? 0} onDone={() => setEditing(null)} />
    ) : (
      <li key={t.id}>
        <div className="row">
          <a className="row-main" href={`#/trip/${t.id}`}>
            <span className="row-title">{t.name}</span>
            <span className="row-sub">
              {t.default_currency} · {counts?.get(t.id) ?? 0} expenses
            </span>
          </a>
          <button className="btn small ghost" onClick={() => setEditing(t.id)}>
            Edit
          </button>
        </div>
      </li>
    )

  return (
    <>
      <Header title="Trips" />
      <main>
        <div className="card form compact">
          <h2 className="section-title">New trip</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan 2026" aria-label="Trip name" />
          <div className="btn-row">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Default currency">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.code} – {c.name}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={add} disabled={!name.trim()}>
              Create
            </button>
          </div>
        </div>

        <h2 className="section-title">Active</h2>
        {active.length ? <ul className="list card">{active.map(row)}</ul> : <Empty>No active trips.</Empty>}

        {archived.length > 0 && (
          <>
            <h2 className="section-title">Archived</h2>
            <ul className="list card">{archived.map(row)}</ul>
          </>
        )}
      </main>
    </>
  )
}

function TripEditor({ trip, expenseCount, onDone }: { trip: Trip; expenseCount: number; onDone: () => void }) {
  const [name, setName] = useState(trip.name)
  const [currency, setCurrency] = useState(trip.default_currency)
  const save = async () => {
    await updateTrip(trip.id, { name: name.trim() || trip.name, default_currency: currency })
    onDone()
  }
  return (
    <li className="editor">
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Trip name" />
      <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Default currency">
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code}
          </option>
        ))}
      </select>
      <div className="btn-row">
        <button className="btn small ghost" onClick={() => void updateTrip(trip.id, { archived: !trip.archived }).then(onDone)}>
          {trip.archived ? 'Unarchive' : 'Archive'}
        </button>
        {expenseCount === 0 && (
          <button
            className="btn small danger ghost"
            onClick={() => {
              if (confirm(`Delete “${trip.name}”?`)) void updateTrip(trip.id, { deleted_at: new Date().toISOString() }).then(onDone)
            }}
          >
            Delete
          </button>
        )}
        <span className="grow" />
        <button className="btn small ghost" onClick={onDone}>
          Cancel
        </button>
        <button className="btn small primary" onClick={save}>
          Save
        </button>
      </div>
    </li>
  )
}
