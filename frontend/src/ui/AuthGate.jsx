import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './Account.css'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(!!supabase)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [guestAccess, setGuestAccess] = useState(false)
  const [startInJournal, setStartInJournal] = useState(() => {
    try { return ['journal', 'studio'].includes(sessionStorage.getItem('memoverse:after-login')) }
    catch { return false }
  })

  useEffect(() => {
    if (session && startInJournal) {
      try { sessionStorage.removeItem('memoverse:after-login') } catch { /* Storage may be unavailable. */ }
    }
  }, [session, startInJournal])

  useEffect(() => {
    if (!supabase) return
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true
      if (active) { setSession(next); setChecking(false); if (next) setAuthOpen(false) }
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

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    if (signOutError) throw signOutError
    setStartInJournal(false)
    setGuestAccess(false)
  }

  async function continueWithGoogle() {
    if (!supabase || busy) return
    setBusy(true); setError('')
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

  return <>
    <div hidden={authOpen && !session}>
      {children({ user: session?.user || null, signOut, onSignIn: () => {
        setStartInJournal(true)
        try { sessionStorage.setItem('memoverse:after-login', 'journal') } catch { /* Google sign-in can still continue if storage is unavailable. */ }
        setError(''); setAuthOpen(true)
      }, checking, guestAccess, initialScreen: (session && startInJournal) || guestAccess ? 'journal' : 'landing' })}
    </div>
    {authOpen && !session && <main className="mv-auth-shell">
    <button className="mv-auth-back" type="button" disabled={busy} onClick={() => { setAuthOpen(false) }}>← Back to exploring</button>
    <div className="mv-auth-orbit" aria-hidden="true" />
    <section className="mv-auth-intro"><p className="mv-auth-brand">◈ MemoVerse.</p><p className="mv-auth-eyebrow">A PLACE FOR THE MOMENTS THAT STAY</p><h1>Your memories.<br /><em>Your way back.</em></h1><p>Keep your stories close. Return to the worlds that feel like you.</p><span>Don’t just remember it. Step inside it.</span></section>
    <section className="mv-auth-card" aria-labelledby="mv-auth-title">
      <p className="mv-auth-eyebrow">YOUR PRIVATE MEMORY SPACE</p><h2 id="mv-auth-title">Welcome back.</h2><p>Continue with Google to keep your memories in one private space.</p>
      {!supabase && <div className="mv-auth-setup" role="status">Sign-in is temporarily unavailable. You can still explore memories without an account.</div>}
      <button type="button" className="mv-google-button" aria-describedby="mv-auth-message" disabled={!supabase || busy} onClick={continueWithGoogle}>
        <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.7Z"/><path fill="#34A853" d="M24 44c5.4 0 10-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4.2 1.9-7 1.9-5.2 0-9.6-3.5-11.2-8.2H6.1V33A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H6.1a20 20 0 0 0 0 18l6.7-5.2Z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8C34 5.8 29.4 4 24 4A20.4 20.4 0 0 0 6.1 15l6.7 5.2C14.4 15.5 18.8 12 24 12Z"/></svg>
        Continue with Google
      </button>
      <p id="mv-auth-message" className="mv-auth-error" role="alert">{error}</p>
      <button className="mv-auth-switch" disabled={busy} onClick={() => {
        setGuestAccess(true); setAuthOpen(false); setError(''); setStartInJournal(false)
        try { sessionStorage.removeItem('memoverse:after-login') } catch { /* Guest exploration works without storage. */ }
      }}>Continue exploring without signing in</button>
      <p className="mv-auth-small">Your saved photographs and stories belong to your account.</p>
    </section>
  </main>}
  </>
}
