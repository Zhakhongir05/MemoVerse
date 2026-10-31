import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database,A,B} from './world_database_fixture.mjs';
const migration=()=>readFile(new URL('../../frontend/supabase/016_marble_1_1_model.sql',import.meta.url),'utf8');
const snapshot=async d=>({jobs:(await d.db.query('select * from world_generation_jobs order by id')).rows,config:(await d.db.query('select * from world_generation_demo')).rows[0]});
test('model upgrade preserves existing jobs/holds and prices only new reservations at 1580',async()=>{
 const d=await database();try{
  await d.db.exec("update world_generation_demo set model='marble-1.0-draft',credits_per_job=500,credit_budget=6000");
  const old=await d.reserve(A,'a');await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:old.job.job_id,p_lease:null,p_update:{status:'unknown'}});
  const saved=await d.reserve(B,'e'),pending=await d.reserve(B,'f');
  await d.db.query("update world_generation_jobs set status='succeeded',world_id='saved-world',assets=$1::jsonb where id=$2",[JSON.stringify({id:'saved-world',splatUrl:'https://cdn.marble.worldlabs.ai/synthetic.spz'}),saved.job.job_id]);
  await d.rpc('mv_world_finish',{p_user_id:B,p_job_id:pending.job.job_id,p_lease:null,p_update:{status:'pending',operation_id:'existing-operation'}});
  const before=await snapshot(d),sql=await migration();await d.db.exec(sql);
  const after=await snapshot(d);assert.deepEqual(after.jobs,before.jobs);
  assert.deepEqual(after.config,{...before.config,model:'marble-1.1',credits_per_job:1580});
  await d.db.exec(sql);assert.deepEqual(await snapshot(d),after);
  const reopened=await d.reserve(B,'e');assert.equal(reopened.fresh,false);assert.equal(reopened.job.world.id,'saved-world');assert.equal(reopened.model,'marble-1.0-draft');
  const resumed=await d.reserve(B,'f');assert.equal(resumed.fresh,false);assert.equal(resumed.job.status,'pending');assert.equal(resumed.model,'marble-1.0-draft');
  const reused=await d.reserve(A,'a');assert.equal(reused.fresh,false);assert.equal(reused.model,'marble-1.0-draft');
  for(const hash of ['b','c']){const next=await d.reserve(A,hash);assert.equal(next.fresh,true);assert.equal(next.model,'marble-1.1');}
  assert.equal((await d.reserve(A,'d')).error,'allowance_used');
  assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,4660);
 }finally{await d.db.close();}
});
test('new model keeps the existing budget and rejects a reservation it cannot cover',async()=>{
 const d=await database();try{
  await d.db.exec("update world_generation_demo set model='marble-1.0-draft',credits_per_job=500,credit_budget=2000");
  await d.reserve(A,'a');await d.db.exec(await migration());const before=await snapshot(d);
  assert.equal((await d.reserve(B,'b')).error,'budget');assert.deepEqual(await snapshot(d),before);
 }finally{await d.db.close();}
});
test('unreviewed model settings abort without changing records or configuration',async()=>{
 const d=await database();try{
  await d.db.exec("update world_generation_demo set model='marble-1.0-draft',credits_per_job=600");const before=await snapshot(d);
  await assert.rejects(d.db.exec(await migration()),/Unexpected model configuration/);await d.db.exec('rollback');assert.deepEqual(await snapshot(d),before);
 }finally{await d.db.close();}
});
