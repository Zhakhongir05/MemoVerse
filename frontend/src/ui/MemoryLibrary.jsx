import { useEffect, useRef, useState } from 'react'
import { listMemories, openMemory } from './memoryStore'

export default function MemoryLibrary({ user, saved, saving, onOpen, onNew, onBusyChange }) {
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; onBusyChange(false) }
  }, [onBusyChange])

  useEffect(() => {
    let active = true
    setLoading(true)
    listMemories(user.id).then(rows => { if (active) setMemories(rows) })
      .catch(() => { if (active) setError('Could not load memories. Check the connection and Supabase setup.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user.id, refresh])

  useEffect(() => {
    if (saved) setMemories(rows => [saved, ...rows.filter(row => row.id !== saved.id)].slice(0, 50))
  }, [saved])

  async function run(action) {
    if (busy) return
    setBusy(true); onBusyChange(true); setError(''); setNotice('')
    try { await action() }
    catch { if (alive.current) setError('Could not complete this request. Check your connection and database/storage policies, then retry.') }
    finally { if (alive.current) { setBusy(false); onBusyChange(false) } }
  }

  return <section className="mv-library mv-glass" aria-labelledby="mv-library-title">
    <div className="mv-library-heading"><h2 id="mv-library-title">Your saved memories</h2><button type="button" disabled={loading || busy} onClick={() => { setError(''); setRefresh(value => value + 1) }}>Refresh</button></div>
    <p className="mv-fine">Private to your account · Showing your latest 50 memories</p>
    <button type="button" className="mv-primary" disabled={busy || saving} onClick={onNew}>Start a new memory <span aria-hidden="true">＋</span></button>
    <p className="mv-fine">Use Save changes in the studio to store your edits. Open a memory to continue editing it.</p>
    {loading && <p role="status">Loading your memories…</p>}
    {!loading && !memories.length && !error && <p className="mv-fine">Your collection starts with one moment.</p>}
    <ul>{memories.map(memory => <li key={memory.id}><button type="button" disabled={busy || saving} onClick={() => run(async () => {
      const loaded = await openMemory(memory)
      if (alive.current) { onOpen(loaded); setNotice('Saved memory opened.') }
    })}><span>{memory.title}</span><small>{new Date(memory.created_at).toLocaleDateString()} · {memory.mood}</small></button></li>)}</ul>
    <p className="mv-error" role="alert">{error}</p><p className="mv-fine" role="status">{notice}</p>
  </section>
}
