import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from '../lib/db'
import { CURRENCIES, decimals, formatAud, formatMoney, HOME, minorToInput, parseToMinor, symbol, toAudMinor } from '../lib/money'
import { computeShares } from '../lib/splits'
import { getRate } from '../lib/fx'
import { todayLocal, uuid } from '../lib/dates'
import { useSession } from '../lib/session'
import { deleteExpense, saveExpense } from '../lib/mutations'
import { back } from '../lib/router'
import { CATEGORIES, type Expense, type SplitType } from '../lib/types'
import { BackButton, Empty, Header } from '../components/Layout'

interface RateState {
  rate: number
  pending: boolean
  rateDate?: string
  loading: boolean
  manual: boolean
}

export function ExpenseForm({ id, tripId: routeTripId }: { id?: string; tripId?: string }) {
  const { me, partner, name } = useSession()
  const trips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at && !t.archived).toArray(), [])
  const existing = useLiveQuery(async () => (id ? ((await db.expenses.get(id)) ?? null) : null), [id])
  const lastTripId = useLiveQuery(async () => (await getMeta<string>('lastTripId')) ?? null, [])

  const [loaded, setLoaded] = useState(false)
  const [tripId, setTripId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(HOME)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('food')
  const [date, setDate] = useState(todayLocal())
  const [paidBy, setPaidBy] = useState(me)
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [rate, setRate] = useState<RateState>({ rate: 1, pending: false, loading: false, manual: false })
  const [editingRate, setEditingRate] = useState(false)
  const [rateInput, setRateInput] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  /** date:currency the stored rate belongs to, so editing doesn't refetch needlessly. */
  const storedRateKey = useRef<string | null>(null)

  // Initialise the form once data is available.
  useEffect(() => {
    if (loaded || trips === undefined || existing === undefined || lastTripId === undefined) return
    if (existing) {
      setTripId(existing.trip_id)
      setAmount(minorToInput(existing.amount_minor, existing.currency))
      setCurrency(existing.currency)
      setDescription(existing.description)
      setCategory(existing.category)
      setDate(existing.date)
      setPaidBy(existing.paid_by)
      setSplitType(existing.split_type)
      if (existing.split_input) {
        setCustom(
          Object.fromEntries(
            Object.entries(existing.split_input).map(([k, v]) => [
              k,
              existing.split_type === 'custom_percent' ? String(v / 100) : minorToInput(v, existing.currency),
            ]),
          ),
        )
      }
      setRate({ rate: existing.fx_rate_to_aud, pending: existing.rate_pending, loading: false, manual: false })
      storedRateKey.current = `${existing.date}:${existing.currency}`
    } else {
      setPaidBy(me)
      const preferred = [routeTripId, lastTripId].find((t) => t && trips.some((x) => x.id === t))
      const trip = trips.find((t) => t.id === preferred) ?? trips[0]
      if (trip) {
        setTripId(trip.id)
        setCurrency(trip.default_currency)
      }
    }
    setLoaded(true)
  }, [loaded, trips, existing, lastTripId, routeTripId, me])

  // Look up the exchange rate whenever the date or currency changes.
  useEffect(() => {
    if (!loaded || rate.manual) return
    if (storedRateKey.current === `${date}:${currency}`) return
    storedRateKey.current = null
    let cancelled = false
    setRate((r) => ({ ...r, loading: true }))
    void getRate(date, currency).then((r) => {
      if (!cancelled) setRate({ ...r, loading: false, manual: false })
    })
    return () => {
      cancelled = true
    }
  }, [loaded, date, currency, rate.manual])

  const members = partner ? [me, partner.user_id] : [me]
  const amountMinor = parseToMinor(amount, currency)
  const rateOk = Number.isFinite(rate.rate) && rate.rate > 0
  const audMinor = amountMinor && rateOk ? toAudMinor(amountMinor, currency, rate.rate) : 0

  const splitInput: Record<string, number> | null =
    splitType === 'custom_amount'
      ? Object.fromEntries(members.map((m) => [m, parseToMinor(custom[m] ?? '', currency) ?? 0]))
      : splitType === 'custom_percent'
        ? Object.fromEntries(members.map((m) => [m, Math.round(Number(custom[m] || 0) * 100)]))
        : null

  const split = computeShares({
    type: splitType,
    totalMinor: amountMinor ?? 0,
    totalAudMinor: audMinor,
    payer: paidBy,
    members,
    input: splitInput,
  })

  if (!partner) {
    return (
      <>
        <Header title="Add expense" left={<BackButton />} />
        <main>
          <Empty>Your partner needs to sign in before you can add shared expenses.</Empty>
        </main>
      </>
    )
  }
  if (trips && trips.length === 0 && !existing) {
    return (
      <>
        <Header title="Add expense" left={<BackButton />} />
        <main>
          <Empty>
            Create a trip first. <a href="#/trips">Go to Trips</a>
          </Empty>
        </main>
      </>
    )
  }
  if (id && existing === null) {
    return (
      <>
        <Header title="Expense" left={<BackButton />} />
        <main>
          <Empty>This expense no longer exists.</Empty>
        </main>
      </>
    )
  }

  const other = partner.user_id
  const otherName = name(other)
  const payerIsMe = paidBy === me

  // Show the rate in whichever direction gives a number ≥ 1 (e.g. "A$1 = ¥110" but "€1 = A$1.61").
  const inverse = rateOk && rate.rate < 1
  const rateText = !rateOk
    ? 'No rate available'
    : inverse
      ? `A$1 = ${symbol(currency)}${(1 / rate.rate).toFixed(2)}`
      : `${symbol(currency).trim()}1 = A$${rate.rate.toFixed(4)}`

  const setCustomFor = (m: string, v: string) => {
    const otherId = m === me ? other : me
    const next = { ...custom, [m]: v }
    // Fill the other side with the remainder.
    if (splitType === 'custom_amount' && amountMinor) {
      const mine = parseToMinor(v, currency)
      if (mine !== null && mine <= amountMinor) next[otherId] = minorToInput(amountMinor - mine, currency)
    } else if (splitType === 'custom_percent') {
      const pct = Number(v)
      if (v !== '' && pct >= 0 && pct <= 100) next[otherId] = String(Math.round((100 - pct) * 100) / 100)
    }
    setCustom(next)
  }

  const chooseSplit = (t: SplitType) => {
    setSplitType(t)
    if (t === 'custom_percent') setCustom({ [me]: '50', [other]: '50' })
    if (t === 'custom_amount' && amountMinor) {
      const half = Math.floor(amountMinor / 2)
      setCustom({ [me]: minorToInput(amountMinor - half, currency), [other]: minorToInput(half, currency) })
    }
  }

  const applyRateInput = () => {
    const v = Number(rateInput.replace(/,/g, ''))
    if (!(v > 0)) {
      setError('Enter a valid exchange rate')
      return
    }
    setRate({ rate: inverse ? 1 / v : v, pending: false, loading: false, manual: true, rateDate: date })
    setEditingRate(false)
    setError('')
  }

  const save = async () => {
    setError('')
    if (!tripId) return setError('Choose a trip')
    if (!amountMinor) return setError('Enter an amount')
    if (!rateOk) return setError('Enter an exchange rate (you appear to be offline)')
    if (!split.ok) return setError(split.error)
    setSaving(true)
    const e: Omit<Expense, 'updated_at' | 'dirty' | 'server_updated_at'> = {
      id: existing?.id ?? uuid(),
      trip_id: tripId,
      description: description.trim(),
      category,
      date,
      amount_minor: amountMinor,
      currency,
      fx_rate_to_aud: rate.rate,
      rate_pending: rate.pending,
      amount_aud_minor: audMinor,
      paid_by: paidBy,
      split_type: splitType,
      split_input: splitInput,
      shares: split.shares,
      created_by: existing?.created_by ?? me,
      deleted_at: null,
    }
    await saveExpense(e)
    back(`#/trip/${tripId}`)
  }

  const remove = async () => {
    if (!existing || !confirm('Delete this expense?')) return
    await deleteExpense(existing.id)
    back(`#/trip/${existing.trip_id}`)
  }

  const owedByOther = split.ok ? (payerIsMe ? split.shares[other] : split.shares[me]) : 0

  return (
    <>
      <Header title={existing ? 'Edit expense' : 'Add expense'} left={<BackButton />} right={<span />} />
      <main className="form">
        <div className="amount-row">
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              setRate((r) => ({ ...r, manual: false }))
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
          <input
            className="amount"
            inputMode={decimals(currency) ? 'decimal' : 'numeric'}
            placeholder={decimals(currency) ? '0.00' : '0'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus={!existing}
            aria-label="Amount"
          />
        </div>

        {currency !== HOME && (
          <div className="rate-box">
            {editingRate ? (
              <div className="rate-edit">
                <span>{inverse ? `A$1 = ${symbol(currency)}` : `${symbol(currency).trim()}1 = A$`}</span>
                <input inputMode="decimal" value={rateInput} onChange={(e) => setRateInput(e.target.value)} autoFocus />
                <button className="btn small primary" onClick={applyRateInput}>
                  Set
                </button>
              </div>
            ) : (
              <>
                <div>
                  <strong>{amountMinor ? `≈ ${formatAud(audMinor)}` : 'AUD'}</strong>
                  <span className="muted">
                    {' '}
                    · {rate.loading ? 'Fetching rate…' : rateText}
                    {rate.manual ? ' (your rate)' : rate.rateDate && rate.rateDate !== date && rateOk ? ` (rate from ${rate.rateDate})` : ''}
                  </span>
                </div>
                {rate.pending && (
                  <div className="warn-text">Offline: using the last known rate. It'll update automatically once you're online.</div>
                )}
                <button
                  className="link"
                  onClick={() => {
                    setRateInput(rateOk ? (inverse ? (1 / rate.rate).toFixed(2) : rate.rate.toFixed(4)) : '')
                    setEditingRate(true)
                  }}
                >
                  Edit rate
                </button>
              </>
            )}
          </div>
        )}

        <label className="field">
          <span>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Ramen at Ichiran" />
        </label>

        <div className="chips wrap">
          {CATEGORIES.map((c) => (
            <button key={c.id} className={`chip ${category === c.id ? 'on' : ''}`} onClick={() => setCategory(c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Trip</span>
            <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {existing && !trips?.some((t) => t.id === existing.trip_id) && <option value={existing.trip_id}>(archived trip)</option>}
              {trips?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span>Paid by</span>
          <div className="segmented">
            <button className={payerIsMe ? 'on' : ''} onClick={() => setPaidBy(me)}>
              You
            </button>
            <button className={!payerIsMe ? 'on' : ''} onClick={() => setPaidBy(other)}>
              {otherName}
            </button>
          </div>
        </div>

        <div className="field">
          <span>Split</span>
          <div className="segmented four">
            <button className={splitType === 'equal' ? 'on' : ''} onClick={() => chooseSplit('equal')}>
              50 / 50
            </button>
            <button className={splitType === 'full_other' ? 'on' : ''} onClick={() => chooseSplit('full_other')}>
              {payerIsMe ? `${otherName} owes all` : 'You owe all'}
            </button>
            <button className={splitType === 'custom_amount' ? 'on' : ''} onClick={() => chooseSplit('custom_amount')}>
              Amounts
            </button>
            <button className={splitType === 'custom_percent' ? 'on' : ''} onClick={() => chooseSplit('custom_percent')}>
              %
            </button>
          </div>
        </div>

        {(splitType === 'custom_amount' || splitType === 'custom_percent') && (
          <div className="grid-2">
            {[me, other].map((m) => (
              <label className="field" key={m}>
                <span>
                  {m === me ? 'Your' : `${otherName}'s`} {splitType === 'custom_percent' ? '%' : `share (${currency})`}
                </span>
                <input inputMode="decimal" value={custom[m] ?? ''} onChange={(e) => setCustomFor(m, e.target.value)} />
              </label>
            ))}
          </div>
        )}

        <div className={`summary ${split.ok ? '' : 'invalid'}`}>
          {!amountMinor
            ? 'Enter an amount to see the split'
            : !split.ok
              ? split.error
              : owedByOther === 0
                ? 'Nobody owes anything for this one'
                : payerIsMe
                  ? `${otherName} owes you ${formatAud(owedByOther)}`
                  : `You owe ${otherName} ${formatAud(owedByOther)}`}
          {amountMinor && currency !== HOME && split.ok ? (
            <small className="muted"> (of {formatMoney(amountMinor, currency)})</small>
          ) : null}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="btn-row sticky">
          {existing && (
            <button className="btn danger ghost" onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn primary grow" onClick={save} disabled={saving}>
            {existing ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </main>
    </>
  )
}
