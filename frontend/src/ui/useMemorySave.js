import { useCallback, useEffect, useRef, useState } from 'react'
import { createDraftRecord, persistDraft } from './memoryStore'

export function equalDraft(a, b) {
  return !!a && !!b && ['file', 'audioFile', 'description', 'mood', 'scene'].every(key => a[key] === b[key])
}

export default function useMemorySave(user, draft) {
  const record = useRef(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const [baseline, setBaseline] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const hasContent = !!(draft.file || draft.audioFile || draft.description || draft.scene)
  const dirty = !!user && (hasContent || !!record.current) && !equalDraft(draft, baseline)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const openDraft = useCallback(memory => {
    record.current = createDraftRecord(memory)
    setBaseline({ file: memory.file, audioFile: memory.audioFile, description: memory.description, mood: memory.mood, scene: memory.scene })
    setError(''); setSaved(memory)
  }, [])

  const newDraft = useCallback(() => {
    record.current = null; setBaseline(null); setSaved(null); setError('')
  }, [])

  async function save() {
    if (!user || !dirty || inFlight.current) return
    if (!record.current) record.current = createDraftRecord()
    const snapshot = draft
    inFlight.current = true
    setSaving(true); setError('')
    try {
      const memory = await persistDraft({ userId: user.id, draft: snapshot, record: record.current })
      if (mounted.current) { setBaseline(snapshot); setSaved(memory) }
    } catch (saveError) {
      if (mounted.current) setError(saveError.message || 'Could not save. Check your connection and try again.')
    } finally {
      inFlight.current = false
      if (mounted.current) setSaving(false)
    }
  }

  useEffect(() => {
    if (!dirty && !saving) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saving])

  return { dirty, status: saving ? 'saving' : error ? 'error' : dirty ? 'dirty' : saved ? 'saved' : 'idle', error, saved, openDraft, newDraft, save }
}
