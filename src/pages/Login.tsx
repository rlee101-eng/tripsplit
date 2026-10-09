import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { completeSignIn } from '../lib/session'

/**
 * Email + password sign-in. No emails are sent: "Confirm email" is turned
 * off in Supabase, and the database only lets the first two accounts in.
 */
export function Login({ onCancel, onDone }: { onCancel?: () => void; onDone?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const signingUp = mode === 'signup'

  const submit = async () => {
    setError('')
    if (signingUp && password.length < 8) return setError('Use a password of at least 8 characters')
    setBusy(true)
    try {
      const creds = { email: email.trim(), password }
      const { data, error } = signingUp
        ? await supabase!.auth.signUp(creds)
        : await supabase!.auth.signInWithPassword(creds)
      if (error) throw error
      if (!data.session) {
        throw new Error(
          'Account created, but Supabase is waiting for email confirmation. In Supabase, turn off Authentication → Sign In / Providers → Email → "Confirm email", then sign in.',
        )
      }
      await completeSignIn(data.user!.id, displayName)
      onDone?.()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg === 'Invalid login credentials' ? 'Wrong email or password' : msg)
      await supabase!.auth.signOut().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="logo">✈️⚖️</div>
      <h1>TripSplit</h1>
      <p className="muted">Track who owes who while you travel.</p>

      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="segmented">
          <button type="button" className={!signingUp ? 'on' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" className={signingUp ? 'on' : ''} onClick={() => setMode('signup')}>
            Create account
          </button>
        </div>
        {signingUp && (
          <label className="field">
            <span>Your name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Ryan" autoComplete="given-name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signingUp ? 'new-password' : 'current-password'}
          />
        </label>
        <button className="btn primary" disabled={busy || !email || !password}>
          {signingUp ? 'Create account' : 'Sign in'}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
      {error && <div className="error">{error}</div>}
    </main>
  )
}
