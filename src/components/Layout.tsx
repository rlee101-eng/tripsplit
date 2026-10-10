import { useSyncExternalStore, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { syncStore, syncNow } from '../lib/sync'
import { LOCAL_MODE } from '../lib/supabase'

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
      <ChevronLeft size={26} strokeWidth={1.75} />
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

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
