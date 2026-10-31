import { useEffect, useRef, useState } from 'react'
import { MOCK_DECLINED_CARD, validateMockCard } from './mockPayment'
import './MockCheckout.css'

const empty = () => ({ name: '', number: '', expiry: '', cvc: '' })

export default function MockCheckout({ onClose, onComplete }) {
  const [fields, setFields] = useState(empty)
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('editing')
  const [message, setMessage] = useState('')
  const dialog = useRef(null)
  const title = useRef(null)
  const timer = useRef(null)
  useEffect(() => {
    const node = dialog.current
    const previousFocus = document.activeElement
    node.showModal(); title.current?.focus()
    return () => { clearTimeout(timer.current); node.close(); previousFocus?.focus?.() }
  }, [])

  function change(key, value) {
    setFields(previous => ({ ...previous, [key]: value }))
    setErrors(previous => ({ ...previous, [key]: '' })); setMessage('')
  }
  function submit(event) {
    event.preventDefault()
    if (state === 'processing') return
    const next = validateMockCard(fields)
    setErrors(next)
    if (Object.keys(next).length) { document.getElementById(`mc-${Object.keys(next)[0]}`)?.focus(); return }
    const declined = fields.number.replace(/\D/g, '') === MOCK_DECLINED_CARD
    // Local simulation only. No network, storage, logs, or quota RPCs.
    setFields(empty()); setState('processing'); setMessage('Simulating your payment…')
    timer.current = setTimeout(() => {
      if (declined) { setState('editing'); setMessage('Demo payment declined. Try the success demo card instead.') }
      else { setState('success'); setMessage('Mock payment complete. No money was charged.'); onComplete?.({ id: crypto.randomUUID(), mock: true, amountKRW: 10000, demoGenerations: 15 }) }
      title.current?.focus()
    }, 700)
  }
  return <dialog ref={dialog} className="mc-dialog" aria-labelledby="mc-title" aria-describedby="mc-disclaimer" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="mc-content"><button className="mc-close" aria-label="Close mock checkout" onClick={onClose}>×</button><p className="mc-eyebrow">MEMOVERSE · MOCK CHECKOUT</p><h2 id="mc-title" ref={title} tabIndex={-1}>{state === 'success' ? 'A little more possibility.' : 'Fifteen more memories.'}</h2>
      <p id="mc-disclaimer" className="mc-disclaimer">Demo only. Use the test numbers below, never real card details. No charge will be made and no real generation credits will be added.</p>
      <div className="mc-summary"><span>15-generation pack <small>One-time purchase preview</small></span><strong>₩10,000</strong></div>
      {state === 'success' ? <div className="mc-success"><span aria-hidden="true">✓</span><h3>Mock payment complete</h3><p>Your simulated pack contains 15 demo generations. Your real account balance is unchanged.</p><button className="mc-submit" onClick={onClose}>Back to plans</button></div> : <form onSubmit={submit} noValidate autoComplete="off"><fieldset disabled={state === 'processing'}><legend className="mj-sr-only">Demo card details</legend>
        <div className="mc-test-help">Success: <code>4242 4242 4242 4242</code><br />Decline test: <code>4000 0000 0000 0002</code><br />Use a future expiry and any 3-digit demo CVC.</div>
        <label htmlFor="mc-name">Demo cardholder name</label><input id="mc-name" value={fields.name} maxLength={80} placeholder="Demo User" autoComplete="off" onChange={event => change('name', event.target.value)} aria-invalid={!!errors.name} aria-describedby="mc-name-error" /><p id="mc-name-error" className="mc-error">{errors.name}</p>
        <label htmlFor="mc-number">Demo card number</label><input id="mc-number" value={fields.number} inputMode="numeric" maxLength={19} placeholder="4242 4242 4242 4242" autoComplete="off" onChange={event => change('number', event.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim())} aria-invalid={!!errors.number} aria-describedby="mc-number-error" /><p id="mc-number-error" className="mc-error">{errors.number}</p>
        <div className="mc-card-row"><div><label htmlFor="mc-expiry">Expiry</label><input id="mc-expiry" value={fields.expiry} inputMode="numeric" maxLength={5} placeholder="MM/YY" autoComplete="off" onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 4); change('expiry', digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits) }} aria-invalid={!!errors.expiry} aria-describedby="mc-expiry-error" /><p id="mc-expiry-error" className="mc-error">{errors.expiry}</p></div><div><label htmlFor="mc-cvc">Demo CVC</label><input id="mc-cvc" type="password" inputMode="numeric" maxLength={4} placeholder="123" autoComplete="off" value={fields.cvc} onChange={event => change('cvc', event.target.value.replace(/\D/g, ''))} aria-invalid={!!errors.cvc} aria-describedby="mc-cvc-error" /><p id="mc-cvc-error" className="mc-error">{errors.cvc}</p></div></div>
        <button className="mc-submit" type="submit">{state === 'processing' ? 'Simulating payment…' : 'Simulate payment · ₩10,000'}</button>
      </fieldset></form>}
      <p role={message.includes('declined') ? 'alert' : 'status'} className="mc-message">{message}</p>
    </div>
  </dialog>
}
