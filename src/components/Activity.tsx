import { categoryOf, type Expense, type Settlement } from '../lib/types'
import { formatAud, formatMoney, HOME } from '../lib/money'
import { formatDay } from '../lib/dates'
import { useSession } from '../lib/session'

export type ActivityItem = { kind: 'expense'; item: Expense } | { kind: 'settlement'; item: Settlement }

export function mergeActivity(expenses: Expense[], settlements: Settlement[]): ActivityItem[] {
  const all: ActivityItem[] = [
    ...expenses.filter((e) => !e.deleted_at).map((item) => ({ kind: 'expense' as const, item })),
    ...settlements.filter((s) => !s.deleted_at).map((item) => ({ kind: 'settlement' as const, item })),
  ]
  // Newest first; same-day items by last edit.
  return all.sort((a, b) =>
    a.item.date === b.item.date ? b.item.updated_at.localeCompare(a.item.updated_at) : b.item.date.localeCompare(a.item.date),
  )
}

export function ActivityList({
  items,
  onSettlementTap,
  showTrip,
}: {
  items: ActivityItem[]
  onSettlementTap?: (s: Settlement) => void
  showTrip?: (tripId: string) => string | undefined
}) {
  const groups = new Map<string, ActivityItem[]>()
  for (const a of items) {
    const g = groups.get(a.item.date) ?? []
    g.push(a)
    groups.set(a.item.date, g)
  }
  return (
    <div className="activity">
      {[...groups].map(([date, list]) => (
        <section key={date}>
          <h3 className="day">{formatDay(date)}</h3>
          <ul className="list">
            {list.map((a) =>
              a.kind === 'expense' ? (
                <ExpenseRow key={a.item.id} e={a.item} tripName={showTrip?.(a.item.trip_id)} />
              ) : (
                <SettlementRow key={a.item.id} s={a.item} onTap={onSettlementTap} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ExpenseRow({ e, tripName }: { e: Expense; tripName?: string }) {
  const { me, name } = useSession()
  const cat = categoryOf(e.category)
  const paidByMe = e.paid_by === me
  const myEffect = paidByMe ? e.amount_aud_minor - (e.shares[me] ?? 0) : -(e.shares[me] ?? 0)
  return (
    <li>
      <a className="row" href={`#/expense/${e.id}`}>
        <span className="row-icon">{cat.icon}</span>
        <span className="row-main">
          <span className="row-title">{e.description || cat.label}</span>
          <span className="row-sub">
            {paidByMe ? 'You' : name(e.paid_by)} paid {formatMoney(e.amount_minor, e.currency)}
            {e.currency !== HOME && <> · {formatAud(e.amount_aud_minor)}</>}
            {e.rate_pending && <span className="pill warn">rate pending</span>}
            {tripName && <> · {tripName}</>}
          </span>
        </span>
        <span className={`row-amount ${myEffect > 0 ? 'pos' : myEffect < 0 ? 'neg' : ''}`}>
          {myEffect === 0 ? <small>not involved</small> : (
            <>
              <small>{myEffect > 0 ? 'you lent' : 'you owe'}</small>
              {formatAud(Math.abs(myEffect))}
            </>
          )}
        </span>
      </a>
    </li>
  )
}

function SettlementRow({ s, onTap }: { s: Settlement; onTap?: (s: Settlement) => void }) {
  const { name } = useSession()
  return (
    <li>
      <button className="row settlement" onClick={() => onTap?.(s)}>
        <span className="row-icon">🤝</span>
        <span className="row-main">
          <span className="row-title">
            {name(s.from_user)} paid {name(s.to_user) === 'You' ? 'you' : name(s.to_user)}
          </span>
          <span className="row-sub">{s.note || 'Settlement'}</span>
        </span>
        <span className="row-amount">{formatAud(s.amount_aud_minor)}</span>
      </button>
    </li>
  )
}
