import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { balancesByTrip, netBalance } from '../lib/balances'
import { formatAud } from '../lib/money'
import { useSession } from '../lib/session'
import { settleEverything } from '../lib/settle'
import { saveSettlements } from '../lib/mutations'
import { BalanceCard } from '../components/BalanceCard'
import { ActivityList, mergeActivity } from '../components/Activity'
import { Empty, Header } from '../components/Layout'
import { WaitingForPartner } from '../components/WaitingForPartner'
import { TripStamp } from '../components/Icons'

export function Home() {
  const { me, meMember, partner } = useSession()
  const expenses = useLiveQuery(() => db.expenses.toArray(), [])
  const settlements = useLiveQuery(() => db.settlements.toArray(), [])
  const trips = useLiveQuery(() => db.trips.filter((t) => !t.deleted_at).toArray(), [])

  if (!expenses || !settlements || !trips) return <Header title="TripSplit" />

  const net = netBalance(me, expenses, settlements)
  const byTrip = balancesByTrip(me, expenses, settlements)
  const tripName = (id: string) => trips.find((t) => t.id === id)?.name
  const visibleTrips = trips
    .filter((t) => !t.archived || (byTrip.get(t.id) ?? 0) !== 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const recent = mergeActivity(expenses, settlements).slice(0, 15)

  return (
    <>
      <Header title="TripSplit" />
      <main>
        <div className="greeting">
          <span>{greeting()}</span>
          <h2>{meMember?.display_name && partner ? `${meMember.display_name} & ${partner.display_name}` : 'Welcome'}</h2>
        </div>
        {!partner ? (
          <WaitingForPartner />
        ) : (
          <BalanceCard
            net={net}
            label="Overall balance"
            partialHref="#/settle"
            onSettle={() => saveSettlements(settleEverything(me, partner.user_id, expenses, settlements))}
          />
        )}

        <h2 className="section-title">
          Trips <a href="#/trips" className="link">Manage</a>
        </h2>
        {visibleTrips.length === 0 ? (
          <Empty>
            No trips yet. <a href="#/trips">Create your first trip</a> — e.g. “Japan 2026”.
          </Empty>
        ) : (
          <ul className="list card">
            {visibleTrips.map((t) => {
              const b = byTrip.get(t.id) ?? 0
              return (
                <li key={t.id}>
                  <a className="row" href={`#/trip/${t.id}`}>
                    <TripStamp currency={t.default_currency} />
                    <span className="row-main">
                      <span className="row-title">{t.name}</span>
                      <span className="row-sub">{t.archived ? 'Archived' : t.default_currency}</span>
                    </span>
                    <span className={`row-amount ${b > 0 ? 'pos' : b < 0 ? 'neg' : ''}`}>
                      {b === 0 ? <small>all square</small> : (
                        <>
                          <small>{b > 0 ? 'owed to you' : 'you owe'}</small>
                          {formatAud(Math.abs(b))}
                        </>
                      )}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}

        {recent.length > 0 && (
          <>
            <h2 className="section-title">Recent activity</h2>
            <ActivityList items={recent} showTrip={tripName} />
          </>
        )}
      </main>
    </>
  )
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
