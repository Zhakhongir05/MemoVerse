import {useEffect,useMemo,useState} from 'react';
import {supabase} from '../ui/supabaseClient.js';
import {accountWorldClient} from './accountWorldClient.js';

export default function WorldAllowance({user}) {
 const userId=user?.id;
 const account=useMemo(()=>userId&&supabase?accountWorldClient(userId,supabase):null,[userId]);
 const [state,setState]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();setState(null);setError('');
  if(account)account.read('/api/world-account',{signal:controller.signal}).then(result=>{
   if(!controller.signal.aborted)setState(result);
  }).catch(err=>{if(!controller.signal.aborted)setError(err.message);});
  return()=>controller.abort();
 },[account]);
 return <aside className="mj-plan-banner" aria-label="Your generation plan">
  <strong>Free account</strong>
  <span>{!account?'Sign in to use 3 free image-to-3D generations.':state?`${state.remaining} of 3 worlds remaining`:'Checking your world allowance…'}</span>

  {state?.remaining===0&&<p>You’ve used your free worlds. Your existing worlds are still yours to revisit.</p>}
  {error&&<p role="status">Your allowance is temporarily unavailable. {error}</p>}
 </aside>;
}
