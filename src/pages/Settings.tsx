import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, setMeta } from '../lib/db'
import { LOCAL_MODE } from '../lib/supabase'
import { signOut, useSession } from '../lib/session'
import { renameMember } from '../lib/mutations'
import { syncNow } from '../lib/sync'
import { exportCsv } from '../lib/csv'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import { Header, useSyncState } from '../components/Layout'

export function Settings({ onSignInAgain }: { onSignInAgain: () => void }) {
  const { me, meMember, partner, members, name } = useSession()
  const sync = useSyncState()
  const theme = useThemePref()
  const unsynced = useLiveQuery(async () => {
    let n = 0
    for (const t of [db.trips, db.expenses, db.settlements, db.members]) n += await t.where('dirty').equals(1).count()
    return n
  }, [])

  return (
    <>
      <Header title="Settings" />
      <main>
        <h2 className="section-title">Names</h2>
        <div className="card form compact">
          {(LOCAL_MODE ? members : meMember ? [meMember] : []).map((m) => (
            <NameField key={m.user_id} id={m.user_id} label={m.user_id === me ? 'Your name' : 'Partner’s name'} value={m.display_name} />
          ))}
          {!LOCAL_MODE && partner && <p className="muted">Partner: {partner.display_name} (they can change this on their phone)</p>}
        </div>

        <h2 className="section-title">Appearance</h2>
        <div className="card form compact">
          <div className="segmented">
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} className={theme === t ? 'on' : ''} onClick={() => setThemePref(t)}>
                {t === 'system' ? 'Automatic' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>

        {LOCAL_MODE && (
          <>
            <h2 className="section-title">Local mode</h2>
            <div className="card form compact">
              <p className="muted">
                No Supabase project is configured, so data stays on this device only. Switch who you're entering
                expenses as to try out both sides:
              </p>
              <div className="segmented">
                {members.map((m) => (
                  <button key={m.user_id} className={m.user_id === me ? 'on' : ''} onClick={() => void setMeta('me', m.user_id)}>
                    {m.display_name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {!LOCAL_MODE && (
          <>
            <h2 className="section-title">Sync</h2>
            <div className="card form compact">
              <p>
                Status: <strong>{sync.kind}</strong>
                {sync.kind === 'error' && <span className="error"> {sync.message}</span>}
              </p>
              <p className="muted">
                {unsynced ? `${unsynced} change(s) waiting to upload.` : 'All changes uploaded.'}
                {sync.lastSynced && ` Last synced ${new Date(sync.lastSynced).toLocaleTimeString()}.`}
              </p>
              <div className="btn-row">
                <button className="btn ghost" onClick={() => void syncNow()}>
                  Sync now
                </button>
                {sync.kind === 'error' && sync.authExpired && (
                  <button className="btn primary" onClick={onSignInAgain}>
                    Sign in again
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        <h2 className="section-title">Data</h2>
        <div className="card form compact">
          <button className="btn ghost" onClick={() => void exportCsv(name)}>
            Export CSV
          </button>
          {!LOCAL_MODE && (
            <button
              className="btn danger ghost"
              onClick={() => {
                const warn = unsynced ? `\n\n${unsynced} change(s) haven't uploaded yet and will be lost.` : ''
                if (confirm(`Sign out and remove the data from this device?${warn}`)) void signOut()
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </main>
    </>
  )
}

function NameField({ id, label, value }: { id: string; label: string; value: string }) {
  const [v, setV] = useState(value)
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v.trim() && v.trim() !== value) void renameMember(id, v.trim())
        }}
      />
    </label>
  )
}
