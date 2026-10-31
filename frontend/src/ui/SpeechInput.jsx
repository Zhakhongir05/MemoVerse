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
  const [transcript, setTranscript] = useState('')
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
    // Each session reports a cumulative list. Replace its preview rather than
    // appending repeated interim/final events into the actual journal story.
    const previous = transcript
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
      setTranscript(appendDictation(previous, result.final))
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
        setError('Dictation has stopped. You can review the words already captured or start again.')
      }, 5000)
      current.stop()
    }
    catch { recognition.current = null; setPhase('idle') }
  }
  function insert() {
    const combined = appendDictation(value, transcript)
    if (combined.length > 12000) { setError('Your story would exceed 12,000 characters. Shorten the transcript or story before adding it.'); return }
    onChange(combined); setTranscript(''); setError('')
  }
  return <section className="mj-speech" aria-label="Speak your memory">
    <div className="mj-speech-heading"><strong>Speak your memory</strong><span>Turn your words into a story.</span></div>
    {!Recognition ? <p>Voice typing is unavailable in this browser. You can still type your story above.</p> : <>
      <p>Your browser’s speech service transcribes your microphone and may process speech online. MemoVerse saves only the text you add to your story.</p>
      <div className="mj-speech-controls"><label>Spoken language<select value={language} disabled={busy || disabled} onChange={event => setLanguage(event.target.value)}><option value="en-US">English</option><option value="ko-KR">한국어</option><option value="ms-MY">Bahasa Melayu</option><option value="id-ID">Bahasa Indonesia</option><option value="zh-CN">中文</option></select></label>
        <button type="button" className="mj-secondary" disabled={disabled || phase === 'stopping'} aria-pressed={busy} onClick={busy ? stop : start}>{phase === 'starting' ? 'Cancel microphone' : phase === 'stopping' ? 'Finishing…' : busy ? 'Stop dictation' : 'Start dictation'}</button></div>
      <p role="status">{phase === 'listening' ? 'Listening… Speak naturally, then stop to review.' : phase === 'starting' ? 'Waiting for microphone permission…' : phase === 'stopping' ? 'Finishing your transcript…' : transcript ? 'Review your words before adding them.' : 'Microphone is off.'}</p>
      {interim && <p className="mj-speech-interim" aria-label="Live transcription">{interim}</p>}
      {transcript && <><label>Review transcript<textarea rows={4} maxLength={12000} value={transcript} disabled={busy || disabled} onChange={event => setTranscript(event.target.value)} /></label><div className="mj-speech-controls"><button type="button" className="mj-secondary" disabled={busy || disabled} onClick={insert}>Add to my story</button><button type="button" className="mj-back" disabled={busy || disabled} onClick={() => { setTranscript(''); setError('') }}>Discard transcript</button></div></>}
      {error && <p className="mj-field-error" role="alert">{error}</p>}
    </>}
  </section>
}
