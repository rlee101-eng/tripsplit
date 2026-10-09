import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from './db'
import { LOCAL_MODE, supabase } from './supabase'
import { nowIso } from './dates'
import { startBackgroundSync, syncNow } from './sync'
import type { Member } from './types'

export const LOCAL_IDS = ['local-you', 'local-partner'] as const

interface Session {
  me: string
  meMember?: Member
  partner?: Member
  members: Member[]
  name: (id: string) => string
}

const Ctx = createContext<Session | null>(null)

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession outside provider')
  return s
}

/**
 * Who is using this device. Cached in IndexedDB so the app opens offline
 * even if the Supabase login token has expired; sync resumes after
 * signing in again.
 */
export function useMe(): { me: string | null | undefined; setMe: (id: string | null) => Promise<void> } {
  const me = useLiveQuery(async () => (await getMeta<string>('me')) ?? null, [])
  return {
    me,
    setMe: async (id) => {
      if (id) await setMeta('me', id)
      else await db.meta.delete('me')
    },
  }
}

async function seedLocalMode() {
  if ((await db.members.count()) > 0) return
  await db.members.bulkPut([
    { user_id: LOCAL_IDS[0], display_name: 'Person 1', updated_at: nowIso() },
    { user_id: LOCAL_IDS[1], display_name: 'Person 2', updated_at: nowIso() },
  ])
  await setMeta('me', LOCAL_IDS[0])
}

export function SessionProvider({ me, children }: { me: string; children: ReactNode }) {
  const members = useLiveQuery(() => db.members.toArray(), []) ?? []
  const meMember = members.find((m) => m.user_id === me)
  const partner = members.find((m) => m.user_id !== me)

  useEffect(() => {
    startBackgroundSync()
  }, [])

  const name = (id: string) =>
    id === me ? 'You' : (members.find((m) => m.user_id === id)?.display_name ?? 'Partner')

  return <Ctx.Provider value={{ me, meMember, partner, members, name }}>{children}</Ctx.Provider>
}

/** One-time setup on app start (seed local mode, sync after a fresh sign-in). */
export function useBootstrap() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void (async () => {
      if (LOCAL_MODE) await seedLocalMode()
      else if (LOCAL_IDS.includes((await getMeta<string>('me')) as (typeof LOCAL_IDS)[number])) {
        // Opened before Supabase was configured: drop the local-mode demo data.
        await Promise.all(db.tables.map((t) => t.clear()))
      }
      setReady(true)
    })()
  }, [])
  return ready
}

/** After the email code is verified: register as a member if needed, then download everything. */
export async function completeSignIn(userId: string, displayName: string): Promise<void> {
  const sb = supabase!
  const previous = await getMeta<string>('me')
  if (previous && previous !== userId) {
    // A different person signed in on this device: start from a clean copy.
    await Promise.all(db.tables.filter((t) => t.name !== 'rates').map((t) => t.clear()))
  }
  const { data: existing, error: selErr } = await sb.from('members').select('user_id').eq('user_id', userId)
  if (selErr) throw selErr
  if (!existing?.length) {
    const { error } = await sb
      .from('members')
      .insert({ user_id: userId, display_name: displayName.trim() || 'Me', updated_at: nowIso() })
    if (error) {
      throw new Error(
        error.code === '42501'
          ? 'This app already has two people set up. Ask the owner to check the members table.'
          : error.message,
      )
    }
  }
  await setMeta('me', userId)
  await syncNow()
}

/** Sign out and wipe this device's copy of the data. */
export async function signOut() {
  await supabase?.auth.signOut()
  await db.delete()
  location.reload()
}
