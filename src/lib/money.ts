export const HOME = 'AUD'

export const CURRENCIES = [
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar', flag: '🇦🇺' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen', flag: '🇯🇵' },
  { code: 'USD', symbol: 'US$', name: 'US dollar', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British pound', flag: '🇬🇧' },
  { code: 'NZD', symbol: 'NZ$', name: 'NZ dollar', flag: '🇳🇿' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', flag: '🇸🇬' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong dollar', flag: '🇭🇰' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese yuan', flag: '🇨🇳' },
  { code: 'KRW', symbol: '₩', name: 'South Korean won', flag: '🇰🇷' },
  { code: 'THB', symbol: '฿', name: 'Thai baht', flag: '🇹🇭' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian rupiah', flag: '🇮🇩' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit', flag: '🇲🇾' },
  { code: 'PHP', symbol: '₱', name: 'Philippine peso', flag: '🇵🇭' },
  { code: 'INR', symbol: '₹', name: 'Indian rupee', flag: '🇮🇳' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', flag: '🇨🇦' },
  { code: 'CHF', symbol: 'CHF ', name: 'Swiss franc', flag: '🇨🇭' },
] as const

const decimalsCache = new Map<string, number>()

/** Number of minor-unit digits for a currency (JPY = 0, AUD = 2). */
export function decimals(currency: string): number {
  let d = decimalsCache.get(currency)
  if (d === undefined) {
    d = new Intl.NumberFormat('en-AU', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
    decimalsCache.set(currency, d)
  }
  return d
}

export function symbol(currency: string): string {
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? `${currency} `
}

/** Parse user input like "1,234.5" into minor units. Returns null if invalid. */
export function parseToMinor(input: string, currency: string): number | null {
  const s = input.replace(/[,\s]/g, '')
  if (!s || !/^\d*\.?\d*$/.test(s) || s === '.') return null
  const d = decimals(currency)
  const [whole, frac = ''] = s.split('.')
  if (frac.length > d) return null
  // Build from strings to avoid float error (e.g. 0.29 * 100).
  return Number(whole || '0') * 10 ** d + Number(frac.padEnd(d, '0') || '0')
}

/** Minor units → plain input string ("1234.50", "3000"). */
export function minorToInput(minor: number, currency: string): string {
  const d = decimals(currency)
  return (minor / 10 ** d).toFixed(d)
}

export function formatMoney(minor: number, currency: string): string {
  const d = decimals(currency)
  const n = new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(Math.abs(minor) / 10 ** d)
  return `${minor < 0 ? '−' : ''}${symbol(currency)}${n}`
}

export const formatAud = (minor: number) => formatMoney(minor, HOME)

/** Convert an amount in `currency` minor units to AUD cents using `rate` (AUD per 1 unit). */
export function toAudMinor(amountMinor: number, currency: string, rate: number): number {
  if (currency === HOME) return amountMinor
  const major = amountMinor / 10 ** decimals(currency)
  return Math.round(major * rate * 10 ** decimals(HOME))
}
