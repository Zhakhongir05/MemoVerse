import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,A,B} from './world_database_fixture.mjs';
test('two historical unknowns block a fresh account; confirmed rejection restores slots and budget once',async()=>{
 const d=await database();try{
  await d.db.exec('update world_generation_demo set max_in_flight=2');
  const first=await d.reserve(A,'a'),second=await d.reserve(B,'b');
  for(const [owner,r] of [[A,first],[B,second]])await d.rpc('mv_world_finish',{p_user_id:owner,p_job_id:r.job.job_id,p_lease:null,p_update:{status:'unknown'}});
  const blocked=await d.reserve(A,'c');assert.equal(blocked.error,'review_required');
  for(const [owner,r] of [[A,first],[B,second]]){
   const p={p_user_id:owner,p_job_id:r.job.job_id,p_lease:null,p_update:{status:'failed',rejected:true,diagnostics:{http_status:422,source:'verified-runtime-log'}}};
   assert.equal((await d.rpc('mv_world_finish',p)).allowance_released,true);await d.rpc('mv_world_finish',p);
   assert.equal((await d.rpc('mv_world_account',{p_user_id:owner})).remaining,3);
  }
  assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,0);
  assert.equal((await d.db.query('select count(*)::int as n from world_generation_jobs')).rows[0].n,2);
  assert.equal((await d.reserve(A,'a')).fresh,true);
 }finally{await d.db.close();}
});
test('ambiguous submission and provider execution failure never release quota',async()=>{
 const d=await database();try{
  const first=await d.reserve(A,'a');
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:first.job.job_id,p_lease:null,p_update:{status:'unknown'}});
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
  assert.equal((await d.reserve(A,'a')).fresh,false);
  const second=await d.reserve(A,'b'),lease=randomUUID();
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:second.job.job_id,p_lease:null,p_update:{status:'pending',operation_id:'op-known'}});
  await d.db.query('update world_generation_jobs set poll_after=null where id=$1',[second.job.job_id]);
  await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:second.job.job_id,p_lease:lease});
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:second.job.job_id,p_lease:lease,p_update:{status:'failed'}});
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,1);
 }finally{await d.db.close();}
});
