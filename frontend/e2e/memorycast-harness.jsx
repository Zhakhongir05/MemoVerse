// Test-only harness; not imported by the production app.
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import MemoryCast from '../src/ui/MemoryCast.jsx'
const listeners = new Set()
let account = 'A'
const client = { auth: {
  getSession: async () => ({ data: { session: { user: { id: account }, access_token: `fixture-${account}` } } }),
  onAuthStateChange: callback => { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } } },
} }
const memory = { id: 'owned-memory', owner: 'A', syncState: 'synced', title: 'Home', story: 'By the window.' }
const wait = () => new Promise(resolve => setTimeout(resolve, 80))
export function Harness() {
  const [user, setUser] = useState({ id: 'A' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    window.memorycastFixture = {
      switchAccount: id => { account = id; listeners.forEach(callback => callback('SIGNED_IN', { user: { id } })); setUser({ id }) },
      reopen: () => setRevision(value => value + 1),
    }
    return () => { delete window.memorycastFixture }
  }, [])
  return <MemoryCast key={revision} user={user} memory={memory} client={client} wait={wait} />
}
createRoot(document.getElementById('root')).render(<Harness />)
