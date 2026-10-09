import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { db, getMeta } from '../lib/db'
import { CURRENCIES, decimals, formatAud, formatMoney, HOME, minorToInput, parseToMinor, symbol, toAudMinor } from '../lib/money'
import { amountsWithExtras, computeShares } from '../lib/splits'
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

/** How the split is entered. 'extras' (equal, except personal items) is saved as custom_amount. */
type SplitMode = SplitType | 'extras'

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
  /** Date and trip are usually right, so they sit behind a one-line summary. */
  const [showDetails, setShowDetails] = useState(false)
  const [date, setDate] = useState(todayLocal())
  const [paidBy, setPaidBy] = useState(me)
  const [mode, setMode] = useState<SplitMode>('equal')
  const [custom, setCustom] = useState<Record<string, string>>({})
  /** Each member's personal items, in the original currency, for the 'extras' mode. */
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [splitOpen, setSplitOpen] = useState(false)
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
      setMode(existing.split_type)
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

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 3000)
    return () => clearTimeout(t)
  }, [flash])

  const splitType: SplitType = mode === 'extras' ? 'custom_amount' : mode
  const extrasMinor = Object.fromEntries(members.map((m) => [m, parseToMinor(extras[m] ?? '', currency) ?? 0]))
  const withExtras = mode === 'extras' && amountMinor ? amountsWithExtras(amountMinor, extrasMinor, paidBy, members) : null

  const splitInput: Record<string, number> | null =
    mode === 'extras'
      ? withExtras?.ok
        ? withExtras.amounts
        : null
      : splitType === 'custom_amount'
      ? Object.fromEntries(members.map((m) => [m, parseToMinor(custom[m] ?? '', currency) ?? 0]))
      : splitType === 'custom_percent'
        ? Object.fromEntries(members.map((m) => [m, Math.round(Number(custom[m] || 0) * 100)]))
        : null

  const split = withExtras && !withExtras.ok ? withExtras : computeShares({
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

  const chooseMode = (t: SplitMode) => {
    setMode(t)
    // These need no further input, so the choice is done.
    if (t === 'equal' || t === 'full_other') setSplitOpen(false)
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
    if (e.split_type === 'custom_percent' && e.split_input) {
      setMode('custom_percent')
      setCustom(Object.fromEntries(Object.entries(e.split_input).map(([k, v]) => [k, String(v / 100)])))
    } else if (e.split_type !== 'custom_amount') {
      // Custom amounts belonged to the old total, so they don't carry over.
      setMode(e.split_type)
    }
  }

  const tripName = trips?.find((t) => t.id === tripId)?.name ?? (existing ? '(archived trip)' : 'Choose a trip')

  const save = async (another = false) => {
    setError('')
    if (!tripId) {
      setShowDetails(true)
      return setError('Choose a trip')
    }
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
    setMode('equal')
    setCustom({})
    setExtras({})
    setSplitOpen(false)
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
  const showSplitOptions = splitOpen || splitInvalid

  const modes: { id: SplitMode; label: string; hint?: string }[] = [
    { id: 'equal', label: 'Split equally' },
    { id: 'full_other', label: payerIsMe ? `${otherName} owes the full amount` : 'You owe the full amount' },
    { id: 'extras', label: 'Equally, except some items', hint: 'Take out anything that was just for one person' },
    { id: 'custom_amount', label: 'Exact amounts' },
    { id: 'custom_percent', label: 'Percentages' },
  ]
  const sharedMinor = amountMinor ? amountMinor - members.reduce((sum, m) => sum + extrasMinor[m], 0) : 0

  return (
    <>
      <Header title={existing ? 'Edit expense' : 'Add expense'} left={<BackButton />} right={<span />} />
      <main className="form">
        {flash && (
          <div className="flash" role="status">
            <Check size={16} aria-hidden /> {flash}
          </div>
        )}
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
            ref={amountRef}
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
          <input value={description} onChange={(e) => changeDescription(e.target.value)} placeholder="e.g. Ramen at Ichiran" />
        </label>

        {suggestions.length > 0 && (
          <div className="chips scroll suggestions" aria-label="Past expenses">
            {suggestions.map((e) => (
              <button key={e.id} className="chip" onClick={() => applySuggestion(e)}>
                <CategoryIcon id={e.category} size={16} /> {e.description}
              </button>
            ))}
          </div>
        )}

        <div className="chips wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`chip ${category === c.id ? 'on' : ''}`}
              onClick={() => {
                setCategory(c.id)
                setCategoryTouched(true)
              }}
            >
              <CategoryIcon id={c.id} size={16} /> {c.label}
            </button>
          ))}
        </div>

        {!showDetails ? (
          <button className="meta-line" onClick={() => setShowDetails(true)}>
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
            <span>
              {dayLabel(date)} · {tripName}
            </span>
            <span className="link">Change</span>
          </button>
        ) : (
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
        )}

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

        <div className={`split-box ${!amountMinor ? 'empty' : splitInvalid ? 'invalid' : ''}`}>
          <button className="split-head" onClick={() => setSplitOpen(!showSplitOptions)} aria-expanded={showSplitOptions}>
            <span className="split-text">
              <span className="split-mode">{modes.find((m) => m.id === mode)?.label}</span>
              <span className="split-result">
                {!amountMinor
                  ? 'Enter an amount to see who owes what'
                  : !split.ok
                    ? split.error
                    : owedByOther === 0
                      ? 'Nobody owes anything for this one'
                      : payerIsMe
                        ? `${otherName} owes you ${formatAud(owedByOther)}`
                        : `You owe ${otherName} ${formatAud(owedByOther)}`}
                {amountMinor && currency !== HOME && split.ok ? <small> (of {formatMoney(amountMinor, currency)})</small> : null}
              </span>
            </span>
            <ChevronDown size={18} className={showSplitOptions ? 'flip' : ''} aria-hidden />
          </button>

          {showSplitOptions && (
            <div className="split-options">
              {modes.map((m) => (
                <div key={m.id}>
                  <button className={`split-option ${mode === m.id ? 'on' : ''}`} onClick={() => chooseMode(m.id)}>
                    <span>
                      {m.label}
                      {m.hint && <small>{m.hint}</small>}
                    </span>
                    {mode === m.id && <Check size={18} aria-hidden />}
                  </button>

                  {mode === m.id && (m.id === 'custom_amount' || m.id === 'custom_percent') && (
                    <div className="grid-2 split-inputs">
                      {[me, other].map((p) => (
                        <label className="field" key={p}>
                          <span>
                            {p === me ? 'Your' : `${otherName}'s`} {m.id === 'custom_percent' ? '%' : `share (${currency})`}
                          </span>
                          <input inputMode="decimal" value={custom[p] ?? ''} onChange={(e) => setCustomFor(p, e.target.value)} />
                        </label>
                      ))}
                    </div>
                  )}

                  {mode === m.id && m.id === 'extras' && (
                    <div className="split-inputs">
                      <div className="grid-2">
                        {[me, other].map((p) => (
                          <label className="field" key={p}>
                            <span>
                              Just {p === me ? 'yours' : `${otherName}'s`} ({currency})
                            </span>
                            <input
                              inputMode={decimals(currency) ? 'decimal' : 'numeric'}
                              placeholder="0"
                              value={extras[p] ?? ''}
                              onChange={(e) => setExtras({ ...extras, [p]: e.target.value })}
                            />
                          </label>
                        ))}
                      </div>
                      {amountMinor && sharedMinor >= 0 ? (
                        <small className="muted">The other {formatMoney(sharedMinor, currency)} is split equally.</small>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="btn-row sticky">
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
      </main>
    </>
  )
}
