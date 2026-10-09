export type SplitType = 'equal' | 'full_other' | 'custom_amount' | 'custom_percent'

/** Fields every synced record carries. */
export interface Synced {
  updated_at: string
  /** Set by the server; used as the pull cursor. Absent until first synced. */
  server_updated_at?: string
  /** 1 = has local changes not yet pushed. */
  dirty?: 0 | 1
}

export interface Member extends Synced {
  user_id: string
  display_name: string
}

export interface Trip extends Synced {
  id: string
  name: string
  default_currency: string
  archived: boolean
  created_at: string
  deleted_at: string | null
}

export interface Expense extends Synced {
  id: string
  trip_id: string
  description: string
  category: string
  /** YYYY-MM-DD */
  date: string
  /** Amount in the original currency's minor units (e.g. yen, or cents). */
  amount_minor: number
  currency: string
  /** AUD per 1 unit of `currency`. */
  fx_rate_to_aud: number
  /** True when the rate came from cache while offline and should be refreshed. */
  rate_pending: boolean
  amount_aud_minor: number
  paid_by: string
  split_type: SplitType
  /** Raw custom inputs: original-currency minor units, or basis points for percent. */
  split_input: Record<string, number> | null
  /** AUD minor units each member is responsible for. Sums to amount_aud_minor. */
  shares: Record<string, number>
  created_by: string
  deleted_at: string | null
}

export interface Settlement extends Synced {
  id: string
  trip_id: string
  from_user: string
  to_user: string
  amount_aud_minor: number
  /** YYYY-MM-DD */
  date: string
  note: string
  created_by: string
  deleted_at: string | null
}

export const CATEGORIES = [
  { id: 'food', label: 'Food', icon: '🍜' },
  { id: 'transport', label: 'Transport', icon: '🚆' },
  { id: 'accommodation', label: 'Accommodation', icon: '🏨' },
  { id: 'activities', label: 'Activities', icon: '🎟️' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'other', label: 'Other', icon: '📦' },
] as const

export function categoryOf(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}
