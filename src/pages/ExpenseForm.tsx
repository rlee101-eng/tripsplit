import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Check, ChevronDown, Luggage, Wallet } from 'lucide-react'
import { db, getMeta } from '../lib/db'
import { CURRENCIES, decimals, formatAud, formatMoney, HOME, minorToInput, parseToMinor, symbol, toAudMinor } from '../lib/money'
import { computeShares } from '../lib/splits'
import { getRate } from '../lib/fx'
import { dayLabel, todayLocal, uuid } from '../lib/dates'
import { descriptionSuggestions, guessCategory } from '../lib/suggest'
import { useSession } from '../lib/session'
import { deleteExpense, saveExpense } from '../lib/mutations'
import { back } from '../lib/router'
import { CATEGORIES, categoryOf, type Expense, type SplitType } from '../lib/types'
import { BackButton, Empty, Header } from '../components/Layout'
import { CategoryIcon } from '../components/Icons'

interface RateState {
  rate: number
  pending: boolean
  rateDate?: string
  loading: boolean
  manual: boolean
}

/**
 * A stored split as percentage inputs, keyed by member. Empty means the default 50/50.
 * Exact-amount splits are rounded to two decimal places, the last member taking the remainder.
 */
function percentInputs(e: Expense): Record<string, string> {
  const ids = Object.keys(e.shares)
  switch (e.split_type) {
    case 'equal':
      return {}
    case 'full_other':
      return Object.fromEntries(ids.map((m) => [m, m === e.paid_by ? '0' : '100']))
    case 'custom_percent':
      return Object.fromEntries(ids.map((m) => [m, String((e.split_input?.[m] ?? 0) / 100)]))
    case 'custom_amount': {
      let left = 10000
      return Object.fromEntries(
        ids.map((m, i) => {
          const bp = i === ids.length - 1 ? left : Math.round(((e.split_input?.[m] ?? 0) / e.amount_minor) * 10000)
          left -= bp
          return [m, String(bp / 100)]
        }),
      )
    }
  }
}

export function ExpenseForm({ id, tripId: routeTripId }: { id?: string; tripId?: string }) {
  const { me, partner, name } = useSession()
  const trips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at && !t.archived).toArray(), [])
  const existing = useLiveQuery(async () => (id ? ((await db.expenses.get(id)) ?? null) : null), [id])
  const lastTripId = useLiveQuery(async () => (await getMeta<string>('lastTripId')) ?? null, [])
  const past = useLiveQuery(() => db.expenses.filter((e) => !e.deleted_at).toArray(), [])

  const [loaded, setLoaded] = useState(false)
  const [tripId, setTripId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(HOME)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('food')
  /** Once the category is chosen by hand (or by picking a suggestion), stop guessing it. */
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [date, setDate] = useState(todayLocal())
  const [paidBy, setPaidBy] = useState(me)
  /** Each member's percentage of the bill, as typed. A missing entry means 50. */
  const [pct, setPct] = useState<Record<string, string>>({})
  /** False until the percentages are edited, so an older exact-amounts split survives an unrelated edit. */
  const [pctTouched, setPctTouched] = useState(false)
  /** Confirmation shown after "Save & new". */
  const [flash, setFlash] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)
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
      setCategoryTouched(true)
      setDate(existing.date)
      setPaidBy(existing.paid_by)
      setPct(percentInputs(existing))
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

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 3000)
    return () => clearTimeout(t)
  }, [flash])

  const pctBp = Object.fromEntries(members.map((m) => [m, Math.round(Number(pct[m] ?? '50') * 100)]))
  const even = members.every((m) => pctBp[m] * members.length === 10000)
  const keepAmounts =
    !!existing &&
    !pctTouched &&
    existing.split_type === 'custom_amount' &&
    amountMinor === existing.amount_minor &&
    currency === existing.currency
  // An even split is stored as 'equal'; anything else as percentages.
  const splitType: SplitType = keepAmounts ? 'custom_amount' : even ? 'equal' : 'custom_percent'
  const splitInput: Record<string, number> | null = keepAmounts ? existing.split_input : even ? null : pctBp

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
            Create a trip first. <a href="#/">Go to Trips</a>
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

  const setPctFor = (m: string, v: string) => {
    const next = { ...pct, [m]: v }
    // Fill the other side with the remainder.
    const n = Number(v)
    if (v !== '' && n >= 0 && n <= 100) next[m === me ? other : me] = String(Math.round((100 - n) * 100) / 100)
    setPct(next)
    setPctTouched(true)
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

  const suggestions = existing ? [] : descriptionSuggestions(description, past ?? [])

  const changeDescription = (v: string) => {
    setDescription(v)
    if (!categoryTouched) setCategory(guessCategory(v, past ?? []) ?? 'food')
  }

  /** Fill the form from a past expense with the same description (everything but the amount). */
  const applySuggestion = (e: Expense) => {
    setDescription(e.description)
    setCategory(e.category)
    setCategoryTouched(true)
    if (members.includes(e.paid_by)) setPaidBy(e.paid_by)
    // Exact amounts belonged to the old total, so they don't carry over.
    if (e.split_type !== 'custom_amount') {
      setPct(percentInputs(e))
      setPctTouched(true)
    }
  }

  const tripName = trips?.find((t) => t.id === tripId)?.name ?? (existing ? '(archived trip)' : 'Choose a trip')

  const save = async (another = false) => {
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
    if (!another) return back(`#/trip/${tripId}`)
    // Start a fresh expense, keeping the trip, date, currency, rate and payer.
    setFlash(`Added ${e.description || categoryOf(category).label} · ${formatMoney(amountMinor, currency)}`)
    setAmount('')
    setDescription('')
    setCategory('food')
    setCategoryTouched(false)
    setPct({})
    setPctTouched(false)
    setSaving(false)
    window.scrollTo(0, 0)
    amountRef.current?.focus()
  }

  const remove = async () => {
    if (!existing || !confirm('Delete this expense?')) return
    await deleteExpense(existing.id)
    back(`#/trip/${existing.trip_id}`)
  }

  const owedByOther = split.ok ? (payerIsMe ? split.shares[other] : split.shares[me]) : 0
  const splitInvalid = !!amountMinor && !split.ok
  const myPct = Math.min(100, Math.max(0, Number(pct[me] ?? '50') || 0))
  const presets = [
    { label: 'Even', mine: 50 },
    { label: 'All yours', mine: 100 },
    { label: `All ${otherName}'s`, mine: 0 },
  ]

  return (
    <>
      <Header title={existing ? 'Edit expense' : 'New expense'} left={<BackButton />} right={<span />} />
      <main className="expense">
        {flash && (
          <div className="flash" role="status">
            <Check size={16} aria-hidden /> {flash}
          </div>
        )}

        <section className="amount-hero">
          <label className="pill-select">
            <span aria-hidden>{CURRENCIES.find((c) => c.code === currency)?.flag}</span>
            {currency}
            <ChevronDown size={14} strokeWidth={2} aria-hidden />
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
                  {c.flag} {c.code} – {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="amount-line">
            <span className="amount-symbol">{symbol(currency).trim()}</span>
            <input
              ref={amountRef}
              className="amount"
              // Sized to its contents so the symbol sits right beside the digits.
              style={{ width: `${Math.max(1, amount.length) + 0.25}ch` }}
              inputMode={decimals(currency) ? 'decimal' : 'numeric'}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus={!existing}
              aria-label="Amount"
            />
          </label>

          {currency !== HOME && (
            <div className="rate-line">
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
                  <span>
                    {amountMinor ? <strong>≈ {formatAud(audMinor)} · </strong> : null}
                    {rate.loading ? 'Fetching rate…' : rateText}
                    {rate.loading ? '' : rate.manual ? ' (your rate)' : rate.rateDate && rate.rateDate !== date && rateOk ? ` (rate from ${rate.rateDate})` : ''}
                  </span>
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
              {rate.pending && !editingRate && (
                <div className="warn-text">Offline: using the last known rate. It'll update automatically once you're online.</div>
              )}
            </div>
          )}
        </section>

        <section className="card group">
          <label className="group-row">
            <span className="tile" data-cat={category}>
              <CategoryIcon id={category} />
            </span>
            <input
              className="bare"
              value={description}
              onChange={(e) => changeDescription(e.target.value)}
              placeholder="What was it for?"
              aria-label="Description"
            />
          </label>

          {suggestions.length > 0 && (
            <div className="suggestions" aria-label="Past expenses">
              {suggestions.map((e) => (
                <button key={e.id} className="chip" onClick={() => applySuggestion(e)}>
                  <CategoryIcon id={e.category} size={16} /> {e.description}
                </button>
              ))}
            </div>
          )}

          <div className="cat-strip" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={category === c.id}
                className={`cat ${category === c.id ? 'on' : ''}`}
                onClick={() => {
                  setCategory(c.id)
                  setCategoryTouched(true)
                }}
              >
                <span className="tile" data-cat={c.id}>
                  <CategoryIcon id={c.id} />
                </span>
                {c.label}
              </button>
            ))}
          </div>
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
          <div className="group-row picker">
            <span className="tile">
              <Luggage size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="group-label">Trip</span>
            <span className="group-value">
              {tripName} <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
            </span>
            <select className="overlay" aria-label="Trip" value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {existing && !trips?.some((t) => t.id === existing.trip_id) && <option value={existing.trip_id}>(archived trip)</option>}
              {trips?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="group-row">
            <span className="tile">
              <Wallet size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="group-label">Paid by</span>
            <div className="segmented compact">
              <button className={payerIsMe ? 'on' : ''} onClick={() => setPaidBy(me)}>
                You
              </button>
              <button className={!payerIsMe ? 'on' : ''} onClick={() => setPaidBy(other)}>
                {otherName}
              </button>
            </div>
          </div>
        </section>

        <section className={`card split-card ${!amountMinor ? 'is-empty' : splitInvalid ? 'is-invalid' : ''}`}>
          <div className="split-sides">
            {[me, other].map((m) => (
              <div className="split-side" key={m}>
                <span className="split-name">{m === me ? 'You' : otherName}</span>
                <label className="split-pct">
                  <input
                    inputMode="decimal"
                    value={pct[m] ?? '50'}
                    style={{ width: `${Math.max(1, (pct[m] ?? '50').length)}ch` }}
                    onChange={(e) => setPctFor(m, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    aria-label={m === me ? 'Your percentage' : `${otherName}'s percentage`}
                  />
                  %
                </label>
                <span className="split-share">{amountMinor && split.ok ? formatAud(split.shares[m]) : ' '}</span>
              </div>
            ))}
          </div>

          <input
            className="split-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={myPct}
            onChange={(e) => setPctFor(me, e.target.value)}
            style={{ '--p': `${myPct}%` } as CSSProperties}
            aria-label="Your share of the bill"
          />

          <div className="split-presets">
            {presets.map((p) => (
              <button key={p.label} className={`chip ${myPct === p.mine ? 'on' : ''}`} onClick={() => setPctFor(me, String(p.mine))}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="split-result" role="status">
            {!amountMinor
              ? 'Enter an amount to see who owes what'
              : !split.ok
                ? split.error
                : owedByOther === 0
                  ? 'Nobody owes anything for this one'
                  : payerIsMe
                    ? `${otherName} owes you ${formatAud(owedByOther)}`
                    : `You owe ${otherName} ${formatAud(owedByOther)}`}
          </div>
        </section>
      </main>

      <div className="action-bar">
        {error && <div className="error">{error}</div>}
        <div className="btn-row">
          {existing ? (
            <button className="btn danger ghost" onClick={remove}>
              Delete
            </button>
          ) : (
            <button className="btn ghost" onClick={() => save(true)} disabled={saving}>
              Save &amp; new
            </button>
          )}
          <button className="btn primary grow" onClick={() => save()} disabled={saving}>
            {existing ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </div>
    </>
  )
}
