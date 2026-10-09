import { useSyncExternalStore, type ReactNode } from 'react'
import { syncStore, syncNow } from '../lib/sync'
import { LOCAL_MODE } from '../lib/supabase'
import type { Route } from '../lib/router'

export function Header({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      <h1>{title}</h1>
      <div className="topbar-side right">{right ?? <SyncBadge />}</div>
    </header>
  )
}

export function BackButton({ href }: { href?: string }) {
  return (
    <button className="icon-btn" aria-label="Back" onClick={() => (href ? (location.hash = href) : history.back())}>
      ‹
    </button>
  )
}

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get)
}

export function SyncBadge() {
  const s = useSyncState()
  if (LOCAL_MODE) return <span className="badge muted">Local</span>
  const label =
    s.kind === 'syncing' ? 'Syncing' : s.kind === 'offline' ? 'Offline' : s.kind === 'error' ? 'Sync error' : 'Synced'
  return (
    <button className={`badge sync-${s.kind}`} onClick={() => void syncNow()} title={s.kind === 'error' ? s.message : undefined}>
      <span className="dot" />
      {label}
    </button>
  )
}

export function BottomNav({ route }: { route: Route }) {
  const tripId = route.page === 'trip' ? route.id : undefined
  const item = (href: string, icon: string, label: string, active: boolean) => (
    <a href={href} className={active ? 'active' : ''}>
      <span className="nav-icon">{icon}</span>
      {label}
    </a>
  )
  return (
    <nav className="bottomnav">
      {item('#/', '⚖️', 'Balance', route.page === 'home')}
      {item('#/trips', '🧳', 'Trips', route.page === 'trips' || route.page === 'trip')}
      <a href={tripId ? `#/expense?trip=${tripId}` : '#/expense'} className="add" aria-label="Add expense">
        +
      </a>
      {item('#/settle', '🤝', 'Settle', route.page === 'settle')}
      {item('#/settings', '⚙️', 'Settings', route.page === 'settings')}
    </nav>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
