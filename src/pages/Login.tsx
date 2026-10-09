import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { completeSignIn } from '../lib/session'

/**
 * Email + 6-digit code sign-in. A code (rather than a magic link) is used
 * because on iPhone a home-screen app doesn't share its login with Safari,
 * so tapping a link in Mail would sign in the wrong place.
 */
export function Login({ onCancel, onDone }: { onCancel?: () => void; onDone?: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sendCode = async () => {
    setError('')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  const verify = async () => {
    setError('')
    setBusy(true)
    try {
      const { data, error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
      if (error) throw error
      await completeSignIn(data.user!.id, displayName)
      onDone?.()
    } catch (e) {
      setError((e as Error).message)
      await supabase!.auth.signOut().catch(() => {})
      setStep('email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="logo">✈️⚖️</div>
      <h1>TripSplit</h1>
      <p className="muted">Track who owes who while you travel.</p>

      {step === 'email' ? (
        <form
          className="card form"
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode()
          }}
        >
          <label className="field">
            <span>Your name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Ryan" autoComplete="given-name" />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <button className="btn primary" disabled={busy || !email}>
            Email me a code
          </button>
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <form
          className="card form"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <p>We sent a code to {email}. Enter it below.</p>
          <label className="field">
            <span>Code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          <button className="btn primary" disabled={busy || code.length < 6}>
            Sign in
          </button>
          <button type="button" className="btn ghost" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
    </main>
  )
}
