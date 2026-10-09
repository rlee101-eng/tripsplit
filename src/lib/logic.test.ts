import { describe, expect, it } from 'vitest'
import { decimals, formatMoney, parseToMinor, toAudMinor } from './money'
import { computeShares } from './splits'
import { netBalance, balancesByTrip } from './balances'
import { settleEverything } from './settle'
import type { Expense, Settlement } from './types'

const A = 'a'
const B = 'b'

function expense(over: Partial<Expense>): Expense {
  return {
    id: Math.random().toString(),
    trip_id: 't1',
    description: '',
    category: 'food',
    date: '2026-10-10',
    amount_minor: 0,
    currency: 'AUD',
    fx_rate_to_aud: 1,
    rate_pending: false,
    amount_aud_minor: 0,
    paid_by: A,
    split_type: 'equal',
    split_input: null,
    shares: {},
    created_by: A,
    updated_at: '',
    deleted_at: null,
    ...over,
  }
}

function makeExpense(amountMinor: number, currency: string, rate: number, payer: string, type: Expense['split_type'] = 'equal', input?: Record<string, number>, trip = 't1') {
  const aud = toAudMinor(amountMinor, currency, rate)
  const r = computeShares({ type, totalMinor: amountMinor, totalAudMinor: aud, payer, members: [A, B], input })
  if (!r.ok) throw new Error(r.error)
  return expense({ amount_minor: amountMinor, currency, fx_rate_to_aud: rate, amount_aud_minor: aud, paid_by: payer, split_type: type, split_input: input ?? null, shares: r.shares, trip_id: trip })
}

describe('money', () => {
  it('knows currency decimals', () => {
    expect(decimals('JPY')).toBe(0)
    expect(decimals('KRW')).toBe(0)
    expect(decimals('AUD')).toBe(2)
  })

  it('parses input without float error', () => {
    expect(parseToMinor('0.29', 'AUD')).toBe(29)
    expect(parseToMinor('1,234.5', 'AUD')).toBe(123450)
    expect(parseToMinor('3000', 'JPY')).toBe(3000)
    expect(parseToMinor('30.5', 'JPY')).toBeNull()
    expect(parseToMinor('abc', 'AUD')).toBeNull()
    expect(parseToMinor('', 'AUD')).toBeNull()
  })

  it('converts JPY to AUD cents', () => {
    // ¥3,000 at A$0.0091 per yen = A$27.30
    expect(toAudMinor(3000, 'JPY', 0.0091)).toBe(2730)
    expect(toAudMinor(1999, 'AUD', 123)).toBe(1999)
    // US$10.00 at 1.52 = A$15.20
    expect(toAudMinor(1000, 'USD', 1.52)).toBe(1520)
  })

  it('formats', () => {
    expect(formatMoney(3000, 'JPY')).toBe('¥3,000')
    expect(formatMoney(123456, 'AUD')).toBe('A$1,234.56')
    expect(formatMoney(-500, 'AUD')).toBe('−A$5.00')
  })
})

describe('splits', () => {
  const base = { totalMinor: 1001, totalAudMinor: 911, payer: A, members: [A, B] }

  it('equal split gives the odd cent to the payer', () => {
    const r = computeShares({ ...base, type: 'equal' })
    expect(r).toEqual({ ok: true, shares: { a: 456, b: 455 } })
  })

  it('full_other puts everything on the non-payer', () => {
    const r = computeShares({ ...base, type: 'full_other' })
    expect(r).toEqual({ ok: true, shares: { a: 0, b: 911 } })
  })

  it('custom amounts are converted proportionally and sum exactly', () => {
    const r = computeShares({ ...base, type: 'custom_amount', input: { a: 701, b: 300 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.shares.a + r.shares.b).toBe(911)
      expect(r.shares.b).toBe(Math.floor((911 * 300) / 1001))
    }
  })

  it('custom amounts must match the total', () => {
    const r = computeShares({ ...base, type: 'custom_amount', input: { a: 500, b: 300 } })
    expect(r.ok).toBe(false)
  })

  it('custom percent', () => {
    const r = computeShares({ ...base, totalAudMinor: 10000, type: 'custom_percent', input: { a: 7000, b: 3000 } })
    expect(r).toEqual({ ok: true, shares: { a: 7000, b: 3000 } })
    expect(computeShares({ ...base, type: 'custom_percent', input: { a: 7000, b: 2000 } }).ok).toBe(false)
  })

  it('rejects zero amount', () => {
    expect(computeShares({ ...base, totalMinor: 0, type: 'equal' }).ok).toBe(false)
  })
})

describe('balances', () => {
  it('nets expenses from each side', () => {
    const ex = [
      makeExpense(10000, 'AUD', 1, A), // A paid $100 split → B owes 50
      makeExpense(3000, 'JPY', 0.01, B), // B paid ¥3000 = $30 → A owes 15
      makeExpense(2000, 'AUD', 1, A, 'full_other'), // B owes 20
    ]
    expect(netBalance(A, ex, [])).toBe(5000 - 1500 + 2000)
    expect(netBalance(B, ex, [])).toBe(-(5000 - 1500 + 2000))
  })

  it('ignores deleted expenses', () => {
    const e = makeExpense(10000, 'AUD', 1, A)
    expect(netBalance(A, [{ ...e, deleted_at: 'x' }], [])).toBe(0)
  })

  it('settling everything brings every trip to zero', () => {
    const ex = [
      makeExpense(10000, 'AUD', 1, A, 'equal', undefined, 't1'),
      makeExpense(5001, 'JPY', 0.0091, B, 'equal', undefined, 't2'),
    ]
    const made = settleEverything(A, B, ex, []) as Settlement[]
    expect(made).toHaveLength(2)
    expect(netBalance(A, ex, made)).toBe(0)
    expect(netBalance(B, ex, made)).toBe(0)
    for (const v of balancesByTrip(A, ex, made).values()) expect(v).toBe(0)
  })

  it('partial settlement reduces balance', () => {
    const ex = [makeExpense(10000, 'AUD', 1, A)]
    const s = { id: 's', trip_id: 't1', from_user: B, to_user: A, amount_aud_minor: 2000, date: '', note: '', created_by: B, updated_at: '', deleted_at: null }
    expect(netBalance(A, ex, [s])).toBe(3000)
    expect(netBalance(B, ex, [s])).toBe(-3000)
  })
})
