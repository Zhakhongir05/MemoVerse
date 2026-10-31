import Dashboard from './ui/Dashboard'
import Scene from './3d_world/Scene'

export default function App() {
  return <Dashboard SceneRenderer={Scene} />
}