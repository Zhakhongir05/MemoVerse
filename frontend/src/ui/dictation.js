export function appendDictation(text, transcript, limit = 12000) {
  const words = String(transcript || '').trim()
  return words ? `${text}${text && !/\s$/.test(text) ? ' ' : ''}${words}`.slice(0, limit) : text
}
export function createDictation({ Recognition, onTranscript, onState, onError, language = 'en-US' }) {
  if (!Recognition) return null
  const recognition = new Recognition()
  recognition.lang = language; recognition.continuous = true; recognition.interimResults = false
  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) onTranscript(event.results[i][0].transcript)
  }
  recognition.onstart = () => onState(true)
  recognition.onend = () => onState(false)
  recognition.onerror = event => { onState(false); onError(event.error === 'not-allowed' ? 'Microphone permission was declined. You can still type your entry.' : 'Dictation stopped. Your text is kept; type or try again.') }
  return recognition
}
