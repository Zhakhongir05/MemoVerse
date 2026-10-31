import { useEffect, useRef, useState } from 'react'
import { appendDictation, readSpeechResults } from './dictationText.js'
import './SpeechInput.css'

export default function SpeechInput(props) {
  const [open, setOpen] = useState(false)
  return <section className="mj-speech-entry"><button type="button" className="mj-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Close voice input' : 'Speak your memory'}</button>{open && <Dictation {...props} />}</section>
}

function Dictation({ value, onChange, disabled }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = useRef(null)
  const permissionTimer = useRef(null)
  const stopTimer = useRef(null)
  const [phase, setPhase] = useState('idle')
  const [language, setLanguage] = useState('en-US')
  const story = useRef(value)
  const change = useRef(onChange)
  useEffect(() => { story.current = value; change.current = onChange }, [value, onChange])
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const busy = phase !== 'idle'

  useEffect(() => {
    const stop = () => recognition.current?.stop()
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', stop)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', stop)
      const current = recognition.current
      recognition.current = null
      clearTimeout(permissionTimer.current)
      clearTimeout(stopTimer.current)
      if (current) { current.onresult = current.onerror = current.onend = current.onstart = null; current.abort() }
    }
  }, [])
  useEffect(() => {
    if (disabled && recognition.current) {
      const current = recognition.current
      current.onend?.(); current.abort()
    }
  }, [disabled])

  function start() {
    if (recognition.current || !Recognition) return
    if (!window.isSecureContext) { setError('Microphone input requires HTTPS or localhost. Open the secure website and try again.'); return }
    if (document.permissionsPolicy?.allowsFeature('microphone') === false) { setError('Microphone access is blocked in this embedded page. Open MemoVerse directly in its own browser tab to use voice input.'); return }
    setError(''); setInterim('')
    let current
    try { current = new Recognition() }
    catch { setError('Your browser could not open speech recognition. You can still type your story.'); return }
    recognition.current = current
    current.lang = language; current.continuous = true; current.interimResults = true
    // Recognition repeats cumulative results. Insert each finalized segment once;
    // keep unfinished speech in the live preview until it becomes final.
    const inserted = new Set()
    function finish() {
      if (recognition.current !== current) return
      recognition.current = null
      clearTimeout(permissionTimer.current); clearTimeout(stopTimer.current)
      current.onresult = current.onerror = current.onend = current.onstart = null
      setPhase('idle'); setInterim('')
    }
    current.onstart = () => { clearTimeout(permissionTimer.current); setPhase('listening') }
    current.onresult = event => {
      const result = readSpeechResults(event.results)
      for (const [index, item] of Array.from(event.results).entries()) {
        if (!item.isFinal || inserted.has(index)) continue
        const combined = appendDictation(story.current, item[0]?.transcript || '')
        if (combined.length > 12000) { setError('Your story has reached 12,000 characters. Shorten it before continuing.'); current.stop(); break }
        inserted.add(index)
        story.current = combined
        change.current(combined)
      }
      setInterim(result.interim)
    }
    current.onerror = event => {
      const messages = {
        'not-allowed': 'Microphone access was denied. Allow it in your browser settings, then try again.',
        'service-not-allowed': 'Speech recognition is unavailable in this browser. You can still type your story.',
        'audio-capture': 'No microphone was found. Check your microphone connection.',
        'network': 'Speech recognition could not connect. Check your connection and try again.',
        'no-speech': 'No speech was detected. Try again when you are ready.',
        'language-not-supported': 'This recognition service does not support that language.',
      }
      if (event.error !== 'aborted') setError(messages[event.error] || 'Dictation stopped. You can keep the words already captured and try again.')
      finish(); current.abort()
    }
    current.onend = finish
    setPhase('starting')
    try {
      permissionTimer.current = setTimeout(() => {
        if (recognition.current !== current) return
        current.onresult = current.onerror = current.onend = current.onstart = null
        current.abort(); recognition.current = null; setPhase('idle')
        setError('Microphone access did not start. Check this site’s microphone permission and try again.')
      }, 15000)
      current.start()
    }
    catch { finish(); current.abort(); setError('Dictation could not start. Use HTTPS or localhost and allow microphone access.') }
  }
  function stop() {
    if (phase === 'starting') {
      const current = recognition.current
      recognition.current = null; clearTimeout(permissionTimer.current)
      if (current) { current.onresult = current.onerror = current.onend = current.onstart = null; current.abort() }
      setPhase('idle'); return
    }
    setPhase('stopping')
    try {
      const current = recognition.current
      if (!current) { setPhase('idle'); return }
      stopTimer.current = setTimeout(() => {
        if (recognition.current !== current) return
        current.onend?.(); current.abort()
        setError('Dictation has stopped. Your captured words are already in your story.')
      }, 5000)
      current.stop()
    }
    catch { recognition.current = null; setPhase('idle') }
  }
  return <section className="mj-speech" aria-label="Speak your memory">
    <div className="mj-speech-heading"><strong>Speak your memory</strong><span>Turn your words into a story.</span></div>
    {!Recognition ? <p>Voice typing is unavailable in this browser. You can still type your story above.</p> : <>
      <p>Your browser’s speech service transcribes your microphone and may process speech online. Recognized words appear directly in your story. No audio recording is saved.</p>
      <div className="mj-speech-controls"><label>Spoken language<select value={language} disabled={busy || disabled} onChange={event => setLanguage(event.target.value)}><option value="en-US">English</option><option value="ko-KR">한국어</option><option value="ms-MY">Bahasa Melayu</option><option value="id-ID">Bahasa Indonesia</option><option value="zh-CN">中文</option></select></label>
        <button type="button" className="mj-secondary" disabled={disabled || phase === 'stopping'} aria-pressed={busy} onClick={busy ? stop : start}>{phase === 'starting' ? 'Cancel microphone' : phase === 'stopping' ? 'Finishing…' : busy ? 'Stop dictation' : 'Start dictation'}</button></div>
      <p role="status">{phase === 'listening' ? 'Listening… Your words appear in your story automatically.' : phase === 'starting' ? 'Waiting for microphone permission…' : phase === 'stopping' ? 'Finishing your transcript…' : 'Microphone is off.'}</p>
      {interim && <p className="mj-speech-interim" aria-label="Live transcription">{interim}</p>}
      {error && <p className="mj-field-error" role="alert">{error}</p>}
    </>}
  </section>
}
