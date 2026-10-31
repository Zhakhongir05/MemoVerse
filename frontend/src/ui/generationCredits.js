import {supabase} from './supabaseClient.js'
import {accountWorldClient} from '../integration/accountWorldClient.js'
import {pollWorld} from '../integration/worldJobs.js'

export const FREE_GENERATIONS=3
export const PAID_PLAN_PRICE_KRW=15000
export const PAID_PLAN_UNLIMITED=true
export function remainingCredits(account){return Math.max(0,account.credits_total-account.credits_used)}

// The plan UI and generation controls read the SAME server-authoritative ledger.
// A missing database/configuration is an error, never a fabricated fresh allowance.
export async function getGenerationPlan(user,client=supabase,options={}){
 if(!user||!client)throw new Error('Sign in to see your generation allowance.')
 const state=await accountWorldClient(user.id,client).read('/api/world-account',options)
 if(state.limit!==3||!Number.isInteger(state.used)||state.used<0)throw new Error('Generation allowance is unavailable.')
 return {plan:'free',credits_total:FREE_GENERATIONS,credits_used:state.used}
}

// Compatibility adapter: only explicit consent can submit a charged job.
// The old Edge Function is retired, so an account cannot receive two allowances.
export async function requestCreditGeneration({photo,photos,story='',signal,approved=false,onProgress},client=supabase,options={}){
 const source=photo||(photos?.length===1?photos[0]:null)
 if(!source)throw new Error('Select exactly one source photograph.')
 if(!approved)throw new Error('Confirm generation consent before submitting your photograph.')
 if(!(source instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(source.type)||!source.size||source.size>4*1024*1024||!story.trim()||story.trim().length>2000)throw new Error('Choose a photo up to 4 MB and a story of 1–2,000 characters.')
 const {data,error}=await client?.auth.getSession()||{}
 if(error||!data?.session)throw new Error('Sign in to generate a memory.')
 const account=accountWorldClient(data.session.user.id,client)
 const body=new FormData();body.set('photo',source,'memory-photo');body.set('story',story.trim());body.set('approved','true')
 const job=await account.job('/api/world-jobs',{...options,body,signal})
 return {world:await pollWorld(job,{signal,onProgress,request:(path,settings)=>account.job(path,{...options,...settings})})}
}
