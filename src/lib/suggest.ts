import type { Expense } from './types'

/** Words that point to a category. Matched as whole words, case-insensitively. */
const KEYWORDS: Record<string, string[]> = {
  food: [
    'restaurant', 'cafe', 'café', 'coffee', 'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'snacks',
    'ramen', 'sushi', 'udon', 'soba', 'izakaya', 'yakitori', 'bar', 'pub', 'beer', 'beers', 'drinks', 'wine',
    'bakery', 'pizza', 'burger', 'kebab', 'gelato', 'ice cream', 'dessert', 'takeaway', 'mcdonalds',
  ],
  transport: [
    'taxi', 'uber', 'didi', 'grab', 'lyft', 'train', 'trains', 'bus', 'metro', 'subway', 'tram', 'ferry',
    'flight', 'flights', 'airport', 'shinkansen', 'jr', 'suica', 'pasmo', 'icoca', 'opal', 'myki',
    'petrol', 'fuel', 'parking', 'toll', 'tolls', 'car hire', 'rental car',
  ],
  accommodation: ['hotel', 'hostel', 'airbnb', 'ryokan', 'motel', 'resort', 'apartment', 'booking.com', 'accommodation'],
  activities: [
    'tour', 'museum', 'gallery', 'ticket', 'tickets', 'entry', 'admission', 'temple', 'shrine', 'castle',
    'onsen', 'zoo', 'aquarium', 'show', 'concert', 'theme park', 'disneyland', 'universal', 'cruise', 'massage',
  ],
  shopping: ['souvenir', 'souvenirs', 'gift', 'gifts', 'clothes', 'shoes', 'duty free', 'uniqlo', 'pharmacy'],
  groceries: [
    'supermarket', 'grocery', 'groceries', 'konbini', '7-eleven', '7eleven', 'lawson', 'familymart',
    'woolworths', 'woolies', 'coles', 'aldi', 'iga', 'market',
  ],
}

const PATTERNS = Object.entries(KEYWORDS).map(
  ([category, words]) =>
    [category, new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escape).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu')] as const,
)

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalise(description: string) {
  return description.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Guess a category from a description: reuse the category of a past expense with the
 * same description, otherwise look for a keyword. Null when there's no good guess.
 */
export function guessCategory(description: string, past: Expense[] = []): string | null {
  const key = normalise(description)
  if (!key) return null
  const same = latestFirst(past).find((e) => normalise(e.description) === key)
  if (same) return same.category
  for (const [category, re] of PATTERNS) if (re.test(key)) return category
  return null
}

/**
 * Past expenses whose description matches what's been typed, one per distinct
 * description (the most recent), most-used first. Empty until two characters are typed
 * or once the text exactly matches a past description.
 */
export function descriptionSuggestions(query: string, past: Expense[], limit = 4): Expense[] {
  const q = normalise(query)
  if (q.length < 2) return []
  const groups = new Map<string, { latest: Expense; count: number }>()
  for (const e of latestFirst(past)) {
    const key = normalise(e.description)
    if (!key) continue
    const g = groups.get(key)
    if (g) g.count++
    else groups.set(key, { latest: e, count: 1 })
  }
  if (groups.has(q)) return []
  const rank = (key: string) => (key.startsWith(q) ? 0 : key.split(/[\s\-/]+/).some((w) => w.startsWith(q)) ? 1 : 2)
  return [...groups.entries()]
    .filter(([key]) => rank(key) < 2)
    .sort(([a, ga], [b, gb]) => rank(a) - rank(b) || gb.count - ga.count)
    .slice(0, limit)
    .map(([, g]) => g.latest)
}

function latestFirst(past: Expense[]) {
  return past
    .filter((e) => !e.deleted_at)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at))
}
