import Dashboard from './ui/Dashboard'
import ScenePreview from './ui/ScenePreview'
import AuthGate from './ui/AuthGate'
import Journal from './ui/Journal'
import { useState } from 'react'

function MemoryExperience({ user, signOut, onSignIn, checking, initialScreen, guestAccess }) {
  const [journalOpen, setJournalOpen] = useState(initialScreen === 'journal')
  if ((user && journalOpen) || guestAccess) return <Journal user={user} onSignOut={signOut} onSignIn={onSignIn} checkingAuth={checking} SceneRenderer={ScenePreview} LegacyStudio={Dashboard} />
  return <Dashboard user={user} onSignOut={signOut} onSignIn={onSignIn} checkingAuth={checking} onExplore={() => user ? setJournalOpen(true) : onSignIn()} SceneRenderer={ScenePreview} />
}

export default function App() {
  return <AuthGate>{props => <MemoryExperience key={props.user?.id || 'guest'} {...props} />}</AuthGate>
}
