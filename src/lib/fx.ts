import { db } from './db'
import { HOME, toAudMinor } from './money'
import { computeShares } from './splits'
import { nowIso, todayLocal } from './dates'
import type { Expense } from './types'

const API = 'https://api.frankfurter.dev/v2/rates'

export interface RateResult {
  /** AUD per 1 unit of currency. NaN when no rate is available at all. */
  rate: number
  /** True if this is a fallback (cached rate from another day) that should be refreshed. */
  pending: boolean
  /** Date the rate is actually for. */
  rateDate?: string
}

/**
 * Fetch the AUD rate for a currency on a date. Requests the EUR cross rates
 * and divides, because the API rounds direct quotes like JPY→AUD to 3
 * significant figures, which would be off by up to ~0.5%.
 */
async function fetchRate(date: string, currency: string): Promise<{ rate: number; rateDate: string }> {
  const quotes = [HOME, currency].filter((c) => c !== 'EUR').join(',')
  const query = async (withDate: boolean) => {
    const url = `${API}?base=EUR&quotes=${quotes}${withDate ? `&date=${date}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Rate lookup failed (${res.status})`)
    return (await res.json()) as { date: string; quote: string; rate: number }[]
  }
  let rows = date <= todayLocal() ? await query(true) : []
  // Future dates (or today before rates are published) return nothing: use latest.
  if (!rows.length) rows = await query(false)
  const perEur = (c: string) => (c === 'EUR' ? 1 : rows.find((r) => r.quote === c)?.rate)
  const aud = perEur(HOME)
  const cur = perEur(currency)
  if (!aud || !cur) throw new Error(`No rate available for ${currency}`)
  return { rate: aud / cur, rateDate: rows[0]?.date ?? date }
}

export async function getRate(date: string, currency: string): Promise<RateResult> {
  if (currency === HOME) return { rate: 1, pending: false, rateDate: date }
  const key = `${date}:${currency}`
  const cached = await db.rates.get(key)
  if (cached) return { rate: cached.rate, pending: false, rateDate: cached.date }
  try {
    const { rate, rateDate } = await fetchRate(date, currency)
    // Only cache past dates: today's/future rates can still change.
    if (date < todayLocal()) {
      await db.rates.put({ key, date, currency, rate, fetched_at: nowIso() })
    }
    // Keep a "latest known" entry per currency for offline fallback.
    await db.rates.put({ key: `latest:${currency}`, date: rateDate, currency, rate, fetched_at: nowIso() })
    return { rate, pending: false, rateDate }
  } catch {
    const fallback = await db.rates.get(`latest:${currency}`)
    if (fallback) return { rate: fallback.rate, pending: true, rateDate: fallback.date }
    return { rate: NaN, pending: true }
  }
}

/** Recalculate an expense's AUD amount and shares for a new rate. */
export function applyRate(e: Expense, rate: number, pending: boolean): Expense | null {
  const amount_aud_minor = toAudMinor(e.amount_minor, e.currency, rate)
  const split = computeShares({
    type: e.split_type,
    totalMinor: e.amount_minor,
    totalAudMinor: amount_aud_minor,
    payer: e.paid_by,
    members: Object.keys(e.shares),
    input: e.split_input,
  })
  if (!split.ok) return null
  return { ...e, fx_rate_to_aud: rate, rate_pending: pending, amount_aud_minor, shares: split.shares }
}

/** Replace offline fallback rates with the real rate for the expense date. */
export async function refreshPendingRates(): Promise<number> {
  const pending = await db.expenses.filter((e) => e.rate_pending && !e.deleted_at).toArray()
  let updated = 0
  for (const e of pending) {
    const r = await getRate(e.date, e.currency)
    if (r.pending || !Number.isFinite(r.rate)) continue
    const next = applyRate(e, r.rate, false)
    if (!next) continue
    await db.expenses.put({ ...next, updated_at: nowIso(), dirty: 1 })
    updated++
  }
  return updated
}
