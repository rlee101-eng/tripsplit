import type { SplitType } from './types'

export interface SplitParams {
  type: SplitType
  /** Total in the original currency's minor units. */
  totalMinor: number
  /** Total converted to AUD minor units. */
  totalAudMinor: number
  payer: string
  members: string[]
  /** custom_amount: original-currency minor units per member. custom_percent: basis points (100% = 10000). */
  input?: Record<string, number> | null
}

export type SplitResult =
  | { ok: true; shares: Record<string, number> }
  | { ok: false; error: string }

/**
 * Work out how much of the AUD total each member is responsible for.
 * Custom splits are entered in the original currency (or percent) and
 * converted proportionally; any rounding cent goes to the payer so the
 * shares always add up exactly to the AUD total.
 */
export function computeShares(p: SplitParams): SplitResult {
  if (!(p.totalMinor > 0)) return { ok: false, error: 'Enter an amount greater than zero' }
  if (!p.members.includes(p.payer)) return { ok: false, error: 'Choose who paid' }

  let weights: Record<string, number>
  switch (p.type) {
    case 'equal':
      weights = Object.fromEntries(p.members.map((m) => [m, 1]))
      break
    case 'full_other':
      weights = Object.fromEntries(p.members.map((m) => [m, m === p.payer ? 0 : 1]))
      break
    case 'custom_amount': {
      weights = pickInput(p)
      const sum = sumValues(weights)
      if (sum !== p.totalMinor) return { ok: false, error: 'Amounts must add up to the total' }
      break
    }
    case 'custom_percent': {
      weights = pickInput(p)
      if (sumValues(weights) !== 10000) return { ok: false, error: 'Percentages must add up to 100%' }
      break
    }
  }
  if (Object.values(weights).some((w) => w < 0 || !Number.isFinite(w))) {
    return { ok: false, error: 'Split values cannot be negative' }
  }
  const totalWeight = sumValues(weights)
  if (totalWeight <= 0) return { ok: false, error: 'Split values cannot all be zero' }

  const shares: Record<string, number> = {}
  let allocated = 0
  for (const m of p.members) {
    if (m === p.payer) continue
    shares[m] = Math.floor((p.totalAudMinor * weights[m]) / totalWeight)
    allocated += shares[m]
  }
  shares[p.payer] = p.totalAudMinor - allocated
  return { ok: true, shares }
}

function pickInput(p: SplitParams): Record<string, number> {
  return Object.fromEntries(p.members.map((m) => [m, Math.round(p.input?.[m] ?? 0)]))
}

function sumValues(o: Record<string, number>) {
  return Object.values(o).reduce((a, b) => a + b, 0)
}
