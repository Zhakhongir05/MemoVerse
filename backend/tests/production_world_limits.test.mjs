import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database,A,B} from './world_database_fixture.mjs';
const migration=await readFile(new URL('../../frontend/supabase/018_remove_demo_generation_caps.sql',import.meta.url),'utf8');

test('demo exhaustion, old review holds and calendar cutoffs cannot block an eligible account',async()=>{
 const d=await database();try{
  for(const hash of ['a','b','c'])await d.reserve(B,hash);
  await d.db.exec(`update world_generation_jobs set status='unknown'; update world_generation_demo set credit_budget=reserved_credits,max_new_per_hour=1,max_new_per_day=1,max_in_flight=1,starts_at=now()-interval '2 days',expires_at=now()-interval '1 day';`);
  const before=(await d.db.query('select credit_budget,reserved_credits from world_generation_demo')).rows[0];
  await d.db.exec(migration);
  assert.equal((await d.rpc('mv_world_config')).enabled,true);
  assert.equal((await d.rpc('mv_world_config')).expires_at,null);
  assert.deepEqual((await d.db.query('select credit_budget,reserved_credits from world_generation_demo')).rows[0],before);
  const first=await d.reserve(A,'d');assert.equal(first.fresh,true);
  const duplicate=await d.reserve(A,'d');assert.equal(duplicate.fresh,false);assert.equal(duplicate.job.job_id,first.job.job_id);
  assert.equal((await d.reserve(A,'e')).fresh,true);assert.equal((await d.reserve(A,'f')).fresh,true);
  assert.equal((await d.reserve(A,'g')).error,'allowance_used');
  assert.equal((await d.db.query("select count(*)::int n from world_generation_jobs where user_id=$1 and status='unknown'",[B])).rows[0].n,3);
  const after=(await d.db.query('select credit_budget,reserved_credits from world_generation_demo')).rows[0];
  assert.equal(after.credit_budget,before.credit_budget);assert.equal(after.reserved_credits,before.reserved_credits+3*1580);
  await d.db.exec(migration);assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).used,3);
 }finally{await d.db.close();}
});

test('parallel retries deduplicate; owner quotas, kill switch and server-only execution remain',async()=>{
 const d=await database();try{
  await d.db.exec(migration);
  const results=await Promise.all(Array.from({length:6},()=>d.reserve(A,'a')));
  assert.equal(results.filter(x=>x.fresh).length,1);assert.equal(new Set(results.map(x=>x.job.job_id)).size,1);
  assert.equal((await d.reserve(B,'a')).fresh,true);
  await d.db.exec('update world_generation_demo set enabled=false');
  assert.equal((await d.reserve(A,'a')).fresh,false);assert.equal((await d.reserve(A,'b')).error,'disabled');
  assert.equal((await d.rpc('mv_world_config')).enabled,false);
  for(const role of ['anon','authenticated'])assert.equal((await d.db.query("select has_function_privilege($1,'public.mv_world_reserve(uuid,text,uuid)','execute') allowed",[role])).rows[0].allowed,false);
  assert.equal((await d.db.query("select has_function_privilege('service_role','public.mv_world_reserve(uuid,text,uuid)','execute') allowed")).rows[0].allowed,true);
 }finally{await d.db.close();}
});
