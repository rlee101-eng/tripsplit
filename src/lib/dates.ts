/** Today's date in the device's local time zone, as YYYY-MM-DD. */
export function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Today", "Yesterday", or the formatted day. */
export function dayLabel(date: string): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return date === todayLocal() ? 'Today' : date === yesterday ? 'Yesterday' : formatDay(date)
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Parse ISO timestamps from Postgres (microseconds, +00:00) or JS (Z) into ms. */
export function toMs(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'))
}

export function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: y === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export function uuid(): string {
  return crypto.randomUUID()
}
