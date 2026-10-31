import { useEffect, useState } from 'react'
import { getGenerationPlan, remainingCredits } from './generationCredits'

export default function PhotoPlanInfo({ user }) {
  const [account, setAccount] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!user) return
    let active = true
    getGenerationPlan(user).then(value => { if (active) setAccount(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [user?.id])
  return <div className="mj-photo-plan">
    <p role="status">{!user ? 'Sign in with Google to use your 3 free generations.' : failed ? 'Your generation allowance could not be loaded. Check Plans before generating.' : !account ? 'Checking your generation allowance…' : `${account.plan === 'paid' ? 'Paid' : 'Free'} plan · ${remainingCredits(account)} generations remaining`}</p>
    {account && remainingCredits(account) === 0 && <p className="mj-photo-plan-limit">Your generations are used. You can revisit saved worlds any time. Paid upgrades are a mock preview only.</p>}
    <p>One photo per 3D generation. Selecting or saving a photo does not spend a credit.</p>
    <details><summary>Plan allowances</summary><p>Free: 3 requests per account during the judging period.<br />Paid preview: ₩10,000 for 15 generations. Mock checkout grants no real credits. One source image per generation on either plan.</p></details>
  </div>
}
