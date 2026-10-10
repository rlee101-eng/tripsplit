import { useLayoutEffect, useState } from 'react'
import { LOCAL_MODE } from './lib/supabase'
import { SessionProvider, useBootstrap, useMe } from './lib/session'
import { useRoute, type Route } from './lib/router'
import { Home } from './pages/Home'
import { TripPage } from './pages/TripPage'
import { ExpenseForm } from './pages/ExpenseForm'
import { SettleForm } from './pages/SettleForm'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'

export default function App() {
  const ready = useBootstrap()
  const { me } = useMe()
  const route = useRoute()
  const [signingInAgain, setSigningInAgain] = useState(false)

  // Forms always open at the top, so the amount field is in view whatever page you came from.
  const formKey = route.page === 'expense' || route.page === 'settle' ? JSON.stringify(route) : null
  useLayoutEffect(() => {
    if (formKey) window.scrollTo(0, 0)
  }, [formKey])

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
      </div>
    </SessionProvider>
  )
}

function Page({ route, onSignInAgain }: { route: Route; onSignInAgain: () => void }) {
  switch (route.page) {
    case 'home':
      return <Home />
    case 'trip':
      return <TripPage key={route.id} id={route.id} />
    case 'expense':
      return <ExpenseForm key={route.id ?? 'new'} id={route.id} tripId={route.tripId} />
    case 'settle':
      return <SettleForm key={route.tripId} tripId={route.tripId} />
    case 'settings':
      return <Settings onSignInAgain={onSignInAgain} />
  }
}
