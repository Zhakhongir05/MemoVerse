import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './Account.css'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(!!supabase)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true
      if (active) { setSession(next); setChecking(false) }
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return
      if (sessionError) setError('Could not restore your session. Please sign in again.')
      setSession(data.session)
      setChecking(false)
    }).catch(() => {
      if (active && !authEventReceived) { setError('Could not connect. Please try signing in.'); setChecking(false) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const credentials = { email: email.trim(), password }
      const { data, error: authError } = mode === 'signup'
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword(credentials)
      if (authError) throw authError
      setPassword('')
      if (mode === 'signup' && !data.session) setNotice('Check your email for a confirmation link, then return here to sign in.')
    } catch (authError) {
      setError(authError.message || 'Could not sign in. Please try again.')
    } finally { setBusy(false) }
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    if (signOutError) throw signOutError
  }

  async function continueWithGoogle() {
    if (!supabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
      })
      if (oauthError) throw oauthError
    } catch (oauthError) {
      setError(oauthError.message || 'Google sign-in could not start. Please try again.')
    } finally { setBusy(false) }
  }

  if (checking) return <main className="mv-auth-shell"><p role="status">Opening your memory space…</p></main>
  if (session) return children({ user: session.user, signOut, demo: false })
  if (demo && !supabase) return <><div className="mv-demo-banner">Guest session · Memories are not saved to an account. <button onClick={() => setDemo(false)}>Back to login</button></div>{children({ user: null, signOut: null, demo: true })}</>

  return <main className="mv-auth-shell">
    <div className="mv-auth-orbit" aria-hidden="true" />
    <section className="mv-auth-intro"><p className="mv-auth-brand">◈ MemoVerse.</p><p className="mv-auth-eyebrow">A PLACE FOR THE MOMENTS THAT STAY</p><h1>Your memories.<br /><em>Your way back.</em></h1><p>Keep your stories close. Return to the worlds that feel like you.</p><span>Don’t just remember it. Step inside it.</span></section>
    <section className="mv-auth-card" aria-labelledby="mv-auth-title">
      <p className="mv-auth-eyebrow">YOUR PRIVATE MEMORY SPACE</p><h2 id="mv-auth-title">{mode === 'signup' ? 'Begin your collection.' : 'Welcome back.'}</h2><p>{mode === 'signup' ? 'Create an account to save your memories.' : 'Sign in to pick up where your memories left off.'}</p>
      {!supabase && <div className="mv-auth-setup" role="status">Accounts are currently unavailable. You can continue without signing in.</div>}
      <button type="button" className="mv-google-button" disabled={!supabase || busy} onClick={continueWithGoogle}>
        <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.7Z"/><path fill="#34A853" d="M24 44c5.4 0 10-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4.2 1.9-7 1.9-5.2 0-9.6-3.5-11.2-8.2H6.1V33A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H6.1a20 20 0 0 0 0 18l6.7-5.2Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8C34 5.8 29.4 4 24 4A20.4 20.4 0 0 0 6.1 15l6.7 5.2C14.4 15.5 18.8 12 24 12Z"/></svg>
        Continue with Google
      </button>
      <div className="mv-auth-divider"><span>or continue with email</span></div>
      <form onSubmit={submit}>
        <label htmlFor="mv-email">Email address</label><input id="mv-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="you@example.com" />
        <label htmlFor="mv-password">Password</label><input id="mv-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} aria-describedby="mv-auth-message" />
        {mode === 'signup' && <p className="mv-auth-small">Use at least 8 characters.</p>}
        <p id="mv-auth-message" className="mv-auth-error" role="alert">{error}</p><p className="mv-auth-notice" role="status">{notice}</p>
        <button className="mv-auth-primary" disabled={!supabase || busy}>{busy ? 'Connecting…' : mode === 'signup' ? 'Create account ↗' : 'Sign in ↗'}</button>
      </form>
      <button className="mv-auth-switch" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice(''); setPassword('') }}>{mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      {!supabase && <button className="mv-auth-switch" onClick={() => setDemo(true)}>Continue without an account</button>}
      <p className="mv-auth-small">Your saved photographs, audio, and stories belong to your account.</p>
    </section>
  </main>
}
