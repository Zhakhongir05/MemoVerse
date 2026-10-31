import Dashboard from './ui/Dashboard'
import ScenePreview from './ui/ScenePreview'
import AuthGate from './ui/AuthGate'

export default function App() {
  return <AuthGate>{({ user, signOut }) => <Dashboard key={user?.id || 'demo'} user={user} onSignOut={signOut} SceneRenderer={ScenePreview} />}</AuthGate>
}
