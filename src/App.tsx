import { useState } from 'react'
import { LOCAL_MODE } from './lib/supabase'
import { SessionProvider, useBootstrap, useMe } from './lib/session'
import { useRoute, type Route } from './lib/router'
import { BottomNav } from './components/Layout'
import { Home } from './pages/Home'
import { TripPage } from './pages/TripPage'
import { Trips } from './pages/Trips'
import { ExpenseForm } from './pages/ExpenseForm'
import { SettleForm } from './pages/SettleForm'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'

export default function App() {
  const ready = useBootstrap()
  const { me } = useMe()
  const route = useRoute()
  const [signingInAgain, setSigningInAgain] = useState(false)

  if (!ready || me === undefined) return null

  if (!LOCAL_MODE && (!me || signingInAgain)) {
    return (
      <Login
        onCancel={signingInAgain ? () => setSigningInAgain(false) : undefined}
        onDone={() => setSigningInAgain(false)}
      />
    )
  }
  if (!me) return null

  return (
    <SessionProvider me={me}>
      <div className="app">
        <Page route={route} onSignInAgain={() => setSigningInAgain(true)} />
        <BottomNav route={route} />
      </div>
    </SessionProvider>
  )
}

function Page({ route, onSignInAgain }: { route: Route; onSignInAgain: () => void }) {
  switch (route.page) {
    case 'home':
      return <Home />
    case 'trips':
      return <Trips />
    case 'trip':
      return <TripPage key={route.id} id={route.id} />
    case 'expense':
      return <ExpenseForm key={route.id ?? 'new'} id={route.id} tripId={route.tripId} />
    case 'settle':
      return <SettleForm key={route.tripId ?? 'any'} tripId={route.tripId} />
    case 'settings':
      return <Settings onSignInAgain={onSignInAgain} />
  }
}
