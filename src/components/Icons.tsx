import {
  BedDouble,
  Package,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { CURRENCIES } from '../lib/money'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  transport: TrainFront,
  accommodation: BedDouble,
  activities: Ticket,
  shopping: ShoppingBag,
  groceries: ShoppingBasket,
  other: Package,
}

export function CategoryIcon({ id, size = 18 }: { id: string; size?: number }) {
  const Icon = CATEGORY_ICONS[id] ?? Package
  return <Icon size={size} strokeWidth={1.75} aria-hidden />
}

/** Tinted rounded tile holding a category icon; the tint comes from `data-cat` in CSS. */
export function CategoryTile({ id }: { id: string }) {
  return (
    <span className="tile" data-cat={id}>
      <CategoryIcon id={id} />
    </span>
  )
}

/** A trip's "stamp": the flag of its default currency. */
export function TripStamp({ currency }: { currency: string }) {
  const flag = CURRENCIES.find((c) => c.code === currency)?.flag ?? '🧭'
  return (
    <span className="stamp" aria-hidden>
      {flag}
    </span>
  )
}
