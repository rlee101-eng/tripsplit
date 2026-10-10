import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRightLeft, CalendarDays, ChevronDown, PencilLine } from 'lucide-react'
import { db } from '../lib/db'
import { netBalance } from '../lib/balances'
import { formatAud, HOME, minorToInput, parseToMinor } from '../lib/money'
import { dayLabel, todayLocal, uuid } from '../lib/dates'
import { useSession } from '../lib/session'
import { saveSettlement } from '../lib/mutations'
import { back } from '../lib/router'
import { BackButton, Empty, Header } from '../components/Layout'

/** Record a payment made outside the app (full or partial) against one trip. */
export function SettleForm({ tripId }: { tripId: string }) {
  const { me, meMember, partner, name } = useSession()
  const trip = useLiveQuery(async () => (await db.trips.get(tripId)) ?? null, [tripId])
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(tripId).toArray(), [tripId])
  const settlements = useLiveQuery(() => db.settlements.where('trip_id').equals(tripId).toArray(), [tripId])

  const [loaded, setLoaded] = useState(false)
  const [iPaid, setIPaid] = useState(true)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const net = expenses && settlements ? netBalance(me, expenses, settlements) : 0

  // Start with the full outstanding amount, paid in the direction that clears it.
  useEffect(() => {
    if (loaded || !expenses || !settlements) return
    if (net !== 0) {
      setIPaid(net < 0)
      setAmount(minorToInput(Math.abs(net), HOME))
    }
    setLoaded(true)
  }, [loaded, expenses, settlements, net])

  if (!partner || trip === null || trip?.deleted_at) {
    return (
      <>
        <Header title="Record a payment" left={<BackButton href="#/" />} />
        <main>
          <Empty>{partner ? 'This trip no longer exists.' : "Your partner hasn't joined yet."}</Empty>
        </main>
      </>
    )
  }

  const other = partner.user_id
  const otherName = name(other)
  const minor = parseToMinor(amount, HOME)
  // Positive: they still owe you. A payment from you adds to what they owe; one from them takes away.
  const after = minor ? net + (iPaid ? minor : -minor) : net
  const owing = Math.abs(net)

  /** Fill in a share of what's outstanding, paid in the direction that reduces it. */
  const payShare = (share: number) => {
    setIPaid(net < 0)
    setAmount(minorToInput(share, HOME))
  }
  const quick = owing > 1 ? [{ label: 'Full amount', value: owing }, { label: 'Half', value: Math.round(owing / 2) }] : []

  const save = async () => {
    if (!minor) return setError('Enter an amount')
    await saveSettlement({
      id: uuid(),
      trip_id: tripId,
      from_user: iPaid ? me : other,
      to_user: iPaid ? other : me,
      amount_aud_minor: minor,
      date,
      note: note.trim() || (after === 0 ? 'Settled up' : 'Partial payment'),
      created_by: me,
      deleted_at: null,
    })
    back(`#/trip/${tripId}`)
  }

  const person = (id: string, role: string) => (
    <div className={`flow-person ${id === me ? 'you' : 'them'}`}>
      <span className="avatar" aria-hidden>
        {(id === me ? (meMember?.display_name ?? 'You') : otherName).trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="flow-role">{role}</span>
      <span className="flow-name">{id === me ? 'You' : otherName}</span>
    </div>
  )

  return (
    <>
      <Header title="Record a payment" left={<BackButton />} right={<span />} />
      <main className="expense">
        <section className="amount-hero">
          <div className="flow">
            {person(iPaid ? me : other, 'Paid')}
            <button className="flow-swap" onClick={() => setIPaid(!iPaid)} aria-label="Swap who paid">
              <ArrowRightLeft size={18} strokeWidth={2} aria-hidden />
            </button>
            {person(iPaid ? other : me, 'Received')}
          </div>

          <label className="amount-line">
            <span className="amount-symbol">A$</span>
            <input
              className="amount"
              style={{ width: `${Math.max(1, amount.length) + 0.25}ch` }}
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError('')
              }}
              aria-label="Amount in AUD"
            />
          </label>

          <div className="rate-line">
            {net === 0
              ? `Nothing is outstanding on ${trip?.name ?? 'this trip'}`
              : `${net > 0 ? `${otherName} owes you` : `You owe ${otherName}`} ${formatAud(owing)} on ${trip?.name ?? 'this trip'}`}
          </div>

          {quick.length > 0 && (
            <div className="quick-amounts">
              {quick.map((q) => (
                <button key={q.label} className={`chip ${minor === q.value && iPaid === net < 0 ? 'on' : ''}`} onClick={() => payShare(q.value)}>
                  {q.label} <small>{formatAud(q.value)}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card group">
          <div className="group-row picker">
            <span className="tile">
              <CalendarDays size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="group-label">Date</span>
            <span className="group-value">
              {dayLabel(date)} <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
            </span>
            <input
              className="overlay"
              type="date"
              aria-label="Date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => {
                // Desktop browsers only open the calendar from its own icon unless asked.
                try {
                  e.currentTarget.showPicker()
                } catch {
                  // Not supported: the native control still works.
                }
              }}
            />
          </div>
          <label className="group-row">
            <span className="tile">
              <PencilLine size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <input className="bare" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" />
          </label>

          <div className={`outcome ${!minor ? 'is-empty' : ''}`} role="status">
            {!minor
              ? 'Enter an amount to see what’s left'
              : after === 0
                ? 'This settles the trip'
                : after > 0
                  ? `${otherName} will still owe you ${formatAud(after)}`
                  : `You’ll still owe ${otherName} ${formatAud(-after)}`}
          </div>
        </section>

        <p className="muted footnote">Pay each other however you like, then record it here so the balance updates.</p>
      </main>

      <div className="action-bar">
        {error && <div className="error">{error}</div>}
        <div className="btn-row">
          <button className="btn primary grow" onClick={save}>
            Record payment
          </button>
        </div>
      </div>
    </>
  )
}
