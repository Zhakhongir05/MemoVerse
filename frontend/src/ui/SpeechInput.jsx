import { useEffect, useRef, useState } from 'react'
import { appendDictation, readSpeechResults } from './dictationText.js'
import './SpeechInput.css'

export default function SpeechInput({ value, onChange, disabled }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = useRef(null)
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
      if (current) { current.onresult = current.onerror = current.onend = current.onstart = null; current.abort() }
    }
  }, [])
  useEffect(() => { if (disabled) recognition.current?.stop() }, [disabled])

  function start() {
    if (recognition.current || !Recognition) return
    setError(''); setInterim('')
    const current = new Recognition()
    recognition.current = current
    current.lang = language; current.continuous = true; current.interimResults = true
    // Each session reports a cumulative list. Replace its preview rather than
    // appending repeated interim/final events into the actual journal story.
    const previous = transcript
    current.onstart = () => setPhase('listening')
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
    }
    current.onend = () => { recognition.current = null; setPhase('idle'); setInterim('') }
    setPhase('starting')
    try { current.start() }
    catch { recognition.current = null; setPhase('idle'); setError('Dictation could not start. Use HTTPS or localhost and allow microphone access.') }
  }
  function stop() {
    setPhase('stopping')
    try { recognition.current?.stop() }
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
