import { useEffect, useState } from 'react'
import { getGenerationPlan, remainingCredits } from './generationCredits'
export default function PhotoPlanInfo({ user }) {
  const userId = user?.id
  const [account, setAccount] = useState(null), [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setAccount(null); setFailed(false)
    if (userId) getGenerationPlan({ id: userId }).then(value => { if (active) setAccount(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [userId])
  return <p className="mj-photo-plan" role="status">{!user ? 'Sign in for 3 free generations.' : failed ? 'Check your allowance in Plans.' : !account ? 'Loading allowance…' : `Free · ${remainingCredits(account)} of 3 left`}</p>
}
