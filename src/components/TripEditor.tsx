import { useState } from 'react'
import { CURRENCIES } from '../lib/money'
import { updateTrip } from '../lib/mutations'
import { go } from '../lib/router'
import type { Trip } from '../lib/types'

/** Rename a trip, change its default currency, archive it, or delete it while it's empty. */
export function TripEditor({ trip, expenseCount, onDone }: { trip: Trip; expenseCount: number; onDone: () => void }) {
  const [name, setName] = useState(trip.name)
  const [currency, setCurrency] = useState(trip.default_currency)
  const save = async () => {
    await updateTrip(trip.id, { name: name.trim() || trip.name, default_currency: currency })
    onDone()
  }
  return (
    <div className="card form compact">
      <label className="field">
        <span>Trip name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Default currency</span>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code} – {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        <button className="btn small ghost" onClick={() => void updateTrip(trip.id, { archived: !trip.archived }).then(onDone)}>
          {trip.archived ? 'Unarchive' : 'Archive'}
        </button>
        {expenseCount === 0 && (
          <button
            className="btn small danger ghost"
            onClick={() => {
              if (confirm(`Delete “${trip.name}”?`)) void updateTrip(trip.id, { deleted_at: new Date().toISOString() }).then(() => go('#/'))
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
    </div>
  )
}
