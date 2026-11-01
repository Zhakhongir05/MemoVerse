import Dashboard from './ui/Dashboard'
import ScenePreview from './ui/ScenePreview'
import AuthGate from './ui/AuthGate'
import { lazy, Suspense, useEffect, useState } from 'react'
import { go, onRouteChange, parseRoute } from './ui/routes.js'
import JournalWorld from './integration/JournalWorldViewer.jsx'

const Journal = lazy(() => import('./ui/Journal'))

// The address is the source of truth for which product the visitor is in.
// Opening the journal is a navigation, not a state change, so a reload, a
// shared link, or the browser's Back button all land on the same screen.
function useScreen() {
  const [screen, setScreen] = useState(() => parseRoute().screen)
  useEffect(() => onRouteChange(() => setScreen(parseRoute().screen)), [])
  return screen
}

function MemoryExperience({ user, signOut, onSignIn, checking }) {
  const inJournal = useScreen() === 'journal'
  if (inJournal) return <Suspense fallback={<p role="status">Opening your journal…</p>}><Journal user={user} onSignOut={signOut} onSignIn={onSignIn} checkingAuth={checking} SceneRenderer={ScenePreview} LegacyStudio={Dashboard} WorldViewer={JournalWorld} /></Suspense>
  // A guest who asks to explore goes straight to the journal address, so signing
  // in continues into the journal and cancelling leaves them on a real page.
  const explore = () => { go('/journal'); if (!user) onSignIn() }
  return <Dashboard user={user} onSignOut={signOut} onSignIn={onSignIn} checkingAuth={checking} onExplore={explore} SceneRenderer={ScenePreview} />
}

export default function App() {
  return <AuthGate>{props => <MemoryExperience key={props.user?.id || 'guest'} {...props} />}</AuthGate>
}
