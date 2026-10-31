import { useEffect, useState } from 'react'
import { estimatedWorldProgress } from './worldProgress.js'

export default function WorldProgress({ active, completed = false }) {
  return active || completed ? <WorldProgressIndicator completed={completed} /> : null
}

function WorldProgressIndicator({ completed }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (completed) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000)
    return () => clearInterval(timer)
  }, [completed])
  const percent = completed ? 100 : estimatedWorldProgress(elapsed)
  return <div className="mj-world-progress">
    <span>{percent}%{!completed && <small> · estimated</small>}</span>
    <progress max="100" value={percent} aria-label="3D world creation" aria-valuetext={completed ? 'Your world is ready' : `Estimated ${percent} percent. Waiting for your saved world.`} />
  </div>
}
