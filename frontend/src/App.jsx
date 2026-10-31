import Dashboard from './ui/Dashboard'
import Scene from './3d_world/Scene'
import AuthGate from './ui/AuthGate'

export default function App() {
  return (
    <AuthGate>
      {({ user, signOut }) => (
        <Dashboard
          key={user?.id || 'demo'}
          user={user}
          onSignOut={signOut}
          SceneRenderer={Scene}
        />
      )}
    </AuthGate>
  )
}