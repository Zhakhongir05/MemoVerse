import {test} from 'node:test'
import assert from 'node:assert/strict'
import {FREE_GENERATIONS,PAID_PACK_GENERATIONS,PAID_PACK_PRICE_KRW,getGenerationPlan,remainingCredits,requestCreditGeneration} from './generationCredits.js'
const client={auth:{getSession:async()=>({data:{session:{user:{id:'account-a'},access_token:'session-token'}}})}}
const photo=()=>new File(['picture'],'photo.jpg',{type:'image/jpeg'})
test('free plan and mock pack keep teammate pricing terms',()=>{
 assert.equal(FREE_GENERATIONS,3);assert.equal(PAID_PACK_GENERATIONS,15);assert.equal(PAID_PACK_PRICE_KRW,10000)
 assert.equal(remainingCredits({credits_total:3,credits_used:3}),0)
})
test('plans read the same authenticated backend allowance and never fabricate three on failure',async()=>{
 const plan=await getGenerationPlan({id:'account-a'},client,{fetchImpl:async(path,options)=>{
  assert.equal(path,'/api/world-account');assert.equal(options.headers.Authorization,'Bearer session-token')
  return Response.json({limit:3,used:2,remaining:1})
 }})
 assert.equal(remainingCredits(plan),1)
 await assert.rejects(getGenerationPlan({id:'account-a'},client,{fetchImpl:async()=>Response.json({detail:'Quota unavailable'},{status:503})}),/Quota unavailable/)
 await assert.rejects(getGenerationPlan({id:'other-account'},client),{name:'AbortError'})
})
test('compatibility generation requires consent and cannot invoke the legacy Edge Function',async()=>{
 await assert.rejects(requestCreditGeneration({photo:photo(),story:'A sunny day'},client),/consent/)
 await assert.rejects(requestCreditGeneration({photos:[photo(),photo()],approved:true},client),/exactly one/)
 let requests=0
 const result=await requestCreditGeneration({photo:photo(),story:'A sunny day',approved:true},client,{fetchImpl:async(path,options)=>{
  requests++;assert.equal(path,'/api/world-jobs');assert.equal(options.body.getAll('photo').length,1)
  assert.equal(options.body.get('plan'),null);assert.equal(options.body.get('credits'),null)
  return Response.json({job_id:'11111111-1111-4111-8111-111111111111',status:'succeeded',world:{id:'world',splatUrl:'https://cdn.marble.worldlabs.ai/a.spz',fullResUrl:'https://cdn.marble.worldlabs.ai/a.spz',colliderUrl:'https://cdn.marble.worldlabs.ai/a.glb'}})
 }})
 assert.equal(result.world.id,'world');assert.equal(requests,1)
})
test('credit exhaustion is reported without a fabricated generated world',async()=>{
 await assert.rejects(requestCreditGeneration({photo:photo(),story:'A sunny day',approved:true},client,{fetchImpl:async()=>Response.json({detail:'No generation credits remaining.'},{status:429})}),/No generation credits/)
})
