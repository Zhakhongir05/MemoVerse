import { useEffect, useRef, useState } from 'react'
import { PAID_PLAN_PRICE_KRW } from './generationCredits'
import './MockCheckout.css'

export default function MockCheckout({ onClose, onComplete }) {
  const [state, setState] = useState('editing')
  const dialog = useRef(null), title = useRef(null), timer = useRef(null)
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement
    node.showModal(); title.current?.focus()
    return () => { clearTimeout(timer.current); node.close(); previous?.focus?.() }
  }, [])
  function submit(event) {
    event.preventDefault()
    if (state !== 'editing') return
    setState('processing')
    timer.current = setTimeout(() => {
      setState('success'); onComplete?.({ id: crypto.randomUUID(), preview: true, amountKRW: PAID_PLAN_PRICE_KRW, unlimited: true })
      title.current?.focus()
    }, 700)
  }
  return <dialog ref={dialog} className="mc-dialog" aria-labelledby="mc-title" aria-describedby="mc-disclaimer" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="mc-content"><button className="mc-close" aria-label="Close checkout" onClick={onClose}>×</button><p className="mc-eyebrow">MEMOVERSE</p>
      <h2 id="mc-title" ref={title} tabIndex={-1}>{state === 'success' ? 'All set to explore.' : 'Unlimited memories.'}</h2>
      <p id="mc-disclaimer" className="mc-disclaimer">Payment preview · No charge is made. Your Free plan remains active.</p>
      <div className="mc-summary"><span>Unlimited plan<small>Image-to-3D memories</small></span><strong>₩{PAID_PLAN_PRICE_KRW.toLocaleString('ko-KR')}</strong></div>
      {state === 'success' ? <div className="mc-success"><span aria-hidden="true">✓</span><h3>Preview complete</h3><p>No payment details were collected.</p><button className="mc-submit" onClick={onClose}>Back to plans</button></div> : <form onSubmit={submit}><p>Test payment method</p><div className="mc-summary"><span aria-hidden="true">▣</span><span>Preview card ···· 4242</span></div><button className="mc-submit" disabled={state === 'processing'}>{state === 'processing' ? 'Processing preview…' : 'Complete preview · ₩15,000'}</button></form>}
      <p role="status" className="mc-message">{state === 'processing' ? 'Processing preview…' : ''}</p>
    </div>
  </dialog>
}
