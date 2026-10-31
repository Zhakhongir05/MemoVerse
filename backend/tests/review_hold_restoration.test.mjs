import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,A,B} from './world_database_fixture.mjs';
const template=()=>readFile(new URL('../../docs/operations/restore_uncertain_world_holds.sql',import.meta.url),'utf8');
const snapshot=async d=>({jobs:(await d.db.query('select * from world_generation_jobs order by id')).rows,budget:(await d.db.query('select * from world_generation_demo')).rows});
async function releasedJobs(d){
 const ids=[randomUUID(),randomUUID()];
 await d.db.query(`insert into world_generation_jobs(id,user_id,submission_hash,status,model,reserved_credits,message,allowance_released,provider_diagnostics) values($1,$2,$3,'failed','marble-1.0-draft',500,'Prior release',true,$4::jsonb),($5,$2,$6,'failed','marble-1.0-draft',500,'Prior release',true,$4::jsonb)`,[ids[0],A,'a'.repeat(64),JSON.stringify({source:'owner-approved-held-slot-clear',evidence:'preserved'}),ids[1],'b'.repeat(64)]);
 await d.db.exec('update world_generation_demo set reserved_credits=1000,max_in_flight=2');
 await d.db.query("select set_config('memoverse.review_job_a',$1,false),set_config('memoverse.review_job_b',$2,false)",ids);
 return ids;
}
test('reviewed recovery preserves evidence and holds exactly once without blocking global slots',async()=>{
 const d=await database();try{
  await releasedJobs(d);const sql=await template();await d.db.exec(sql);
  const first=await snapshot(d);assert.equal(first.budget[0].reserved_credits,2000);
  for(const j of first.jobs){assert.equal(j.status,'unknown');assert.equal(j.allowance_released,false);assert.equal(j.provider_diagnostics.evidence,'preserved');assert.equal(j.provider_diagnostics.hold_restoration.previous_message,'Prior release');assert.equal(j.operation_id,null);assert.equal(j.world_id,null);}
  await d.db.exec(sql);assert.deepEqual(await snapshot(d),first);
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,1);
  assert.equal((await d.reserve(A,'a')).fresh,false);
  assert.equal((await d.reserve(A,'c')).fresh,true);
  assert.equal((await d.reserve(A,'d')).error,'allowance_used');
  assert.equal((await d.reserve(B,'e')).fresh,true);
  assert.equal((await d.reserve(B,'f')).error,'in_flight_limit');
 }finally{await d.db.close();}
});
test('manual recovery refuses missing IDs and changed provider evidence atomically',async()=>{
 const d=await database();try{
  const sql=await template();let before=await snapshot(d);
  await assert.rejects(d.db.exec(sql),/Two distinct reviewed job IDs/);await d.db.exec('rollback');assert.deepEqual(await snapshot(d),before);
  const ids=await releasedJobs(d);await d.db.query("update world_generation_jobs set world_id='world-later-discovered' where id=$1",[ids[0]]);before=await snapshot(d);
  await assert.rejects(d.db.exec(sql),/Job state differs/);await d.db.exec('rollback');assert.deepEqual(await snapshot(d),before);
 }finally{await d.db.close();}
});
