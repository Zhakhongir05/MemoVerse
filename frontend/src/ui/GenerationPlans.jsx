import { useEffect, useState } from 'react'
import MockCheckout from './MockCheckout'
import { getGenerationPlan, remainingCredits } from './generationCredits'

export default function GenerationPlans({ user, onSignIn, onPurchase }) {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [mockReceipt, setMockReceipt] = useState(null)
  useEffect(() => {
    if (!user) return
    let active = true
    getGenerationPlan(user).then(value => { if (active) setAccount(value) }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [user?.id])
  return <section className="mj-collection"><div className="mj-page-heading"><div><p className="mj-eyebrow">MAKE ROOM FOR MORE MEMORIES</p><h1>Choose your <em>plan.</em></h1><p>One photograph. One world. A moment worth keeping.</p></div></div>
    {account && <p className="mj-plan-balance" role="status">{remainingCredits(account)} generations remaining · {account.plan === 'paid' ? 'Paid' : 'Free'} plan</p>}
    {error && <p className="mj-field-error" role="alert">{error}</p>}
    <div className="mj-plan-grid"><article className="mj-glass mj-plan-card"><p className="mj-eyebrow">FREE</p><h2>Your first three worlds.</h2><strong>₩0</strong><p>3 image-to-3D requests per account during the 30-day judging period.</p><ul><li>One source image per generation</li><li>Keep and revisit your generated worlds</li><li>The symbolic demo does not use credits</li></ul><span>{user ? 'Included with your account' : 'Sign in with Google to begin'}</span>{!user && <button className="mj-primary" onClick={onSignIn}>Continue with Google</button>}</article>
      <article className="mj-glass mj-plan-card mj-plan-paid"><p className="mj-eyebrow">PAID PACK · MOCK PREVIEW</p><h2>Fifteen more ways back.</h2><strong>₩10,000 <small>one-time</small></strong><p>Preview a 15-generation pack. Real paid upgrades are not enabled.</p><ul><li>15 additional generations per pack</li><li>No monthly subscription</li><li>Credits are added after payment is verified</li></ul><button className="mj-primary" disabled={busy} onClick={async () => { if (!onPurchase) { setCheckoutOpen(true); return } if (!user) { onSignIn(); return } setBusy(true); setError(''); try { await onPurchase() } catch { setError('Checkout could not open. Please try again.') } finally { setBusy(false) } }}>{busy ? 'Opening checkout…' : 'Preview 15 generations · ₩10,000'}</button>{!onPurchase && <p className="mj-small">Mock checkout only · No real charge or generation credits.</p>}</article></div>
    {mockReceipt && <p className="mj-plan-balance" role="status">Mock purchase complete · 15 demo generations · Real balance unchanged</p>}
    {checkoutOpen && <MockCheckout onClose={() => setCheckoutOpen(false)} onComplete={setMockReceipt} />}
    <p className="mj-small">A generation attempt uses one credit once submitted. Reopening a saved world is free. Failed attempts can be reviewed by support.</p>
  </section>
}
