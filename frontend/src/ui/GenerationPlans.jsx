import { useEffect, useState } from 'react'
import MockCheckout from './MockCheckout'
import { getGenerationPlan, remainingCredits, PAID_PLAN_PRICE_KRW } from './generationCredits'

export default function GenerationPlans({ user, onSignIn }) {
  const userId = user?.id
  const [account, setAccount] = useState(null), [error, setError] = useState(''), [checkout, setCheckout] = useState(false), [receipt, setReceipt] = useState(null)
  useEffect(() => {
    let active = true
    setAccount(null); setError('')
    if (userId) getGenerationPlan({ id: userId }).then(value => { if (active) setAccount(value) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [userId])
  return <section className="mj-collection" aria-label="Plans"><div className="mj-page-heading"><h1>Your <em>plan.</em></h1></div>
    <p role="status">{user ? account ? `Free · ${remainingCredits(account)} of 3 generations left` : error || 'Loading your plan…' : 'Sign in for 3 free generations.'}</p>
    <div className="mj-plan-grid">
      <article className="mj-glass mj-plan-card"><p className="mj-eyebrow">FREE · CURRENT PLAN</p><h2>Three worlds.</h2><strong>₩0</strong><p>3 image-to-3D generations.</p><p>Saved worlds and recordings are always free to revisit.</p>{!user && <button className="mj-primary" onClick={onSignIn}>Sign in</button>}</article>
      <article className="mj-glass mj-plan-card mj-plan-paid"><p className="mj-eyebrow">UNLIMITED · PREVIEW</p><h2>More memories.</h2><strong>₩{PAID_PLAN_PRICE_KRW.toLocaleString('ko-KR')}</strong><p>Unlimited image-to-3D generation plan.</p><button className="mj-primary" onClick={() => setCheckout(true)}>Preview checkout</button><p className="mj-small">No charge. Preview does not change your free allowance.</p></article>
    </div>
    {receipt && <p role="status">Checkout preview complete. No payment was taken; your Free plan is unchanged.</p>}
    {checkout && <MockCheckout onClose={() => setCheckout(false)} onComplete={setReceipt} />}
  </section>
}
