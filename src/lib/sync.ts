import { db, getMeta, setMeta, SYNCED_TABLES, type SyncedTable } from './db'
import { supabase } from './supabase'
import { refreshPendingRates } from './fx'
import { toMs } from './dates'
import type { Synced } from './types'

export type SyncState =
  | { kind: 'idle'; lastSynced?: string }
  | { kind: 'syncing'; lastSynced?: string }
  | { kind: 'offline'; lastSynced?: string }
  | { kind: 'error'; message: string; lastSynced?: string; authExpired?: boolean }

let state: SyncState = { kind: 'idle' }
const listeners = new Set<() => void>()

function setState(s: SyncState) {
  state = s
  listeners.forEach((l) => l())
}

export const syncStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  get: () => state,
}

const PK: Record<SyncedTable, string> = {
  members: 'user_id',
  trips: 'id',
  expenses: 'id',
  settlements: 'id',
}

/** Pull from slightly before the cursor so rows committed out of order aren't missed. */
const CURSOR_OVERLAP_MS = 60_000
const PAGE = 1000

let running = false
let again = false

/** Push local changes, pull remote changes. Safe to call often. */
export async function syncNow(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  const lastSynced = state.lastSynced
  try {
    if (!navigator.onLine) {
      setState({ kind: 'offline', lastSynced })
      return
    }
    setState({ kind: 'syncing', lastSynced })
    await refreshPendingRates()
    if (supabase) {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw Object.assign(new Error('Signed out — sign in again to sync'), { auth: true })
      await push()
      await pull()
    }
    setState({ kind: 'idle', lastSynced: new Date().toISOString() })
  } catch (e) {
    const err = e as Error & { auth?: boolean; code?: string }
    setState({
      kind: navigator.onLine ? 'error' : 'offline',
      message: err.message ?? String(e),
      lastSynced,
      authExpired: err.auth || err.code === 'PGRST301',
    })
  } finally {
    running = false
    if (again) {
      again = false
      void syncNow()
    }
  }
}

/** Debounced sync, for after local edits. */
let timer: ReturnType<typeof setTimeout> | undefined
export function requestSync() {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), 300)
}

function strip<T extends Synced>(row: T) {
  const { dirty: _d, server_updated_at: _s, ...rest } = row
  return rest
}

async function push() {
  for (const t of SYNCED_TABLES) {
    const table = db.table<Synced & Record<string, unknown>>(t)
    const rows = await table.where('dirty').equals(1).toArray()
    if (!rows.length) continue

    if (t === 'members') {
      // Members are created at sign-in; afterwards only your own name changes.
      for (const r of rows) {
        const { error } = await supabase!
          .from('members')
          .update({ display_name: r.display_name, updated_at: r.updated_at })
          .eq('user_id', r.user_id as string)
        if (error) throw error
      }
    } else {
      const { error } = await supabase!.from(t).upsert(rows.map(strip))
      if (error) throw error
    }

    // Clear the dirty flag, unless the row was edited again while we were pushing.
    await db.transaction('rw', table, async () => {
      for (const r of rows) {
        const pk = r[PK[t]] as string
        const current = await table.get(pk)
        if (current && current.updated_at === r.updated_at) await table.update(pk, { dirty: 0 })
      }
    })
  }
}

async function pull() {
  for (const t of SYNCED_TABLES) {
    const table = db.table<Synced & Record<string, unknown>>(t)
    const cursorKey = `cursor:${t}`
    const cursor = await getMeta<string>(cursorKey)
    const since = cursor ? new Date(toMs(cursor) - CURSOR_OVERLAP_MS).toISOString() : null

    let maxSeen = cursor
    for (let offset = 0; ; offset += PAGE) {
      let q = supabase!.from(t).select('*').order('server_updated_at').range(offset, offset + PAGE - 1)
      if (since) q = q.gt('server_updated_at', since)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as (Synced & Record<string, unknown>)[]

      await db.transaction('rw', table, async () => {
        for (const remote of rows) {
          const pk = remote[PK[t]] as string
          const local = await table.get(pk)
          // Last write wins: keep an unpushed local edit that is newer than the server's copy.
          if (local?.dirty === 1 && toMs(local.updated_at) > toMs(remote.updated_at)) continue
          await table.put({ ...remote, dirty: 0 })
        }
      })
      for (const r of rows) {
        if (!maxSeen || toMs(r.server_updated_at!) > toMs(maxSeen)) maxSeen = r.server_updated_at
      }
      if (rows.length < PAGE) break
    }
    if (maxSeen && maxSeen !== cursor) await setMeta(cursorKey, maxSeen)
  }
}

let started = false
/** Sync on startup, when coming back online or to the app, and every 30s. */
export function startBackgroundSync() {
  if (started) return
  started = true
  void syncNow()
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => setState({ kind: 'offline', lastSynced: state.lastSynced }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 30_000)
}
