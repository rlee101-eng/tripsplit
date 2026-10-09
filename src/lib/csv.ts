import { db } from './db'
import { categoryOf } from './types'
import { minorToInput, HOME } from './money'

const esc = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Download every expense and settlement as a CSV file. */
export async function exportCsv(name: (id: string) => string) {
  const [trips, expenses, settlements] = await Promise.all([
    db.trips.toArray(),
    db.expenses.filter((e) => !e.deleted_at).toArray(),
    db.settlements.filter((s) => !s.deleted_at).toArray(),
  ])
  const tripName = (id: string) => trips.find((t) => t.id === id)?.name ?? ''
  const header = ['Type', 'Date', 'Trip', 'Description', 'Category', 'Amount', 'Currency', 'Rate to AUD', 'Amount AUD', 'Paid by', 'Shares (AUD)']
  const rows: (string | number)[][] = [
    ...expenses.map((e) => [
      'Expense',
      e.date,
      tripName(e.trip_id),
      e.description,
      categoryOf(e.category).label,
      minorToInput(e.amount_minor, e.currency),
      e.currency,
      e.fx_rate_to_aud,
      minorToInput(e.amount_aud_minor, HOME),
      name(e.paid_by),
      Object.entries(e.shares)
        .map(([m, v]) => `${name(m)}: ${minorToInput(v, HOME)}`)
        .join('; '),
    ]),
    ...settlements.map((s) => [
      'Settlement',
      s.date,
      tripName(s.trip_id),
      s.note,
      '',
      minorToInput(s.amount_aud_minor, HOME),
      HOME,
      1,
      minorToInput(s.amount_aud_minor, HOME),
      name(s.from_user),
      `to ${name(s.to_user)}`,
    ]),
  ].sort((a, b) => String(a[1]).localeCompare(String(b[1])))

  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'tripsplit.csv' })
  a.click()
  URL.revokeObjectURL(url)
}
