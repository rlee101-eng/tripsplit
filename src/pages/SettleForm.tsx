import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from '../lib/db'
import { balancesByTrip } from '../lib/balances'
import { formatAud, HOME, minorToInput, parseToMinor } from '../lib/money'
import { todayLocal, uuid } from '../lib/dates'
import { useSession } from '../lib/session'
import { saveSettlement } from '../lib/mutations'
import { back } from '../lib/router'
import { BackButton, Empty, Header } from '../components/Layout'

/** Record a payment made outside the app (full or partial). */
export function SettleForm({ tripId: routeTripId }: { tripId?: string }) {
  const { me, partner, name } = useSession()
  const trips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at).toArray(), [])
  const expenses = useLiveQuery(() => db.expenses.toArray(), [])
  const settlements = useLiveQuery(() => db.settlements.toArray(), [])
  const lastTripId = useLiveQuery(async () => (await getMeta<string>('lastTripId')) ?? null, [])

  const [tripId, setTripId] = useState('')
  const [iPaid, setIPaid] = useState(true)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const balances = expenses && settlements ? balancesByTrip(me, expenses, settlements) : new Map<string, number>()

  function selectTrip(id: string, b = balances) {
    setTripId(id)
    const net = b.get(id) ?? 0
    if (net !== 0) {
      setIPaid(net < 0)
      setAmount(minorToInput(Math.abs(net), HOME))
    }
  }

  // Default to the requested trip, else the one with the largest outstanding balance.
  useEffect(() => {
    if (tripId || !trips || !expenses || !settlements || lastTripId === undefined || !trips.length) return
    const b = balancesByTrip(me, expenses, settlements)
    const biggest = [...b].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]
    const pick =
      [routeTripId, biggest?.[1] ? biggest[0] : undefined, lastTripId].find((t) => t && trips.some((x) => x.id === t)) ??
      trips[0].id
    selectTrip(pick, b)
  }, [tripId, trips, expenses, settlements, lastTripId, me, routeTripId])

  if (!partner) {
    return (
      <>
        <Header title="Settle up" />
        <main>
          <Empty>Your partner hasn't joined yet.</Empty>
        </main>
      </>
    )
  }
  if (trips && !trips.length) {
    return (
      <>
        <Header title="Settle up" />
        <main>
          <Empty>Nothing to settle yet.</Empty>
        </main>
      </>
    )
  }

  const other = partner.user_id
  const net = balances.get(tripId) ?? 0

  const save = async () => {
    const minor = parseToMinor(amount, HOME)
    if (!minor) return setError('Enter an amount')
    await saveSettlement({
      id: uuid(),
      trip_id: tripId,
      from_user: iPaid ? me : other,
      to_user: iPaid ? other : me,
      amount_aud_minor: minor,
      date,
      note: note.trim() || (minor === Math.abs(net) ? 'Settled up' : 'Partial payment'),
      created_by: me,
      deleted_at: null,
    })
    back('#/')
  }

  return (
    <>
      <Header title="Record a payment" left={<BackButton />} right={<span />} />
      <main className="form">
        <p className="muted">
          Pay each other however you like (bank transfer, cash…), then record it here so the balance updates.
        </p>
        <label className="field">
          <span>Trip</span>
          <select value={tripId} onChange={(e) => selectTrip(e.target.value)}>
            {trips?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {balances.get(t.id) ? ` (${formatAud(Math.abs(balances.get(t.id)!))} outstanding)` : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Who paid?</span>
          <div className="segmented">
            <button className={iPaid ? 'on' : ''} onClick={() => setIPaid(true)}>
              You paid {name(other)}
            </button>
            <button className={!iPaid ? 'on' : ''} onClick={() => setIPaid(false)}>
              {name(other)} paid you
            </button>
          </div>
        </div>

        <div className="amount-row">
          <span className="currency-tag">A$</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount in AUD"
          />
        </div>
        {net !== 0 && (
          <p className="muted">
            Outstanding on this trip: {net > 0 ? `${name(other)} owes you` : `you owe ${name(other)}`} {formatAud(Math.abs(net))}
          </p>
        )}

        <div className="grid-2">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        <div className="btn-row sticky">
          <button className="btn primary grow" onClick={save}>
            Record payment
          </button>
        </div>
      </main>
    </>
  )
}
