import { useEffect, useRef, useState } from 'react'
import { appendDictation, createDictation } from './dictation.js'
export default function DictationButton({ value, onChange, maxLength = 12000, disabled = false }) {
  const [listening, setListening] = useState(false), [error, setError] = useState('')
  const current = useRef({ value, onChange })
  useEffect(() => { current.current = { value, onChange } }, [value, onChange])
  const recognition = useRef(null)
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
  useEffect(() => () => { if (recognition.current) { recognition.current.onresult = null; recognition.current.onend = null; recognition.current.onerror = null; recognition.current.abort() } }, [])
  useEffect(() => { if (disabled) recognition.current?.stop() }, [disabled])
  function toggle() {
    setError('')
    if (listening) { recognition.current?.stop(); return }
    const next = createDictation({ Recognition, language: navigator.language || 'en-US', onState: setListening, onError: setError,
      onTranscript: text => { const updated = appendDictation(current.current.value, text, maxLength); current.current.value = updated; current.current.onChange(updated) } })
    if (!next) return
    recognition.current = next
    try { next.start() } catch { setError('Dictation could not start. You can still type your entry.') }
  }
  return <div className="mj-dictation"><button type="button" disabled={disabled || !Recognition} aria-pressed={listening} onClick={toggle}>{listening ? 'Stop dictation' : 'Dictate journal entry'}</button><p role="status">{error || (listening ? 'Listening… Your words are becoming editable text.' : Recognition ? 'Optional speech-to-text. Review before saving. No audio file is saved by MemoVerse; your browser may use its speech service.' : 'Dictation is unavailable here. Type your entry or use your keyboard’s dictation.')}</p></div>
}
