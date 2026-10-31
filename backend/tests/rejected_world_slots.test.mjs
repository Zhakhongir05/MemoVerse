import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,A,B} from './world_database_fixture.mjs';
test('held unknowns do not block other work; confirmed rejection restores slots and budget once',async()=>{
 const d=await database();try{
  await d.db.exec('update world_generation_demo set max_in_flight=2');
  const first=await d.reserve(A,'a'),second=await d.reserve(B,'b');
  for(const [owner,r] of [[A,first],[B,second]])await d.rpc('mv_world_finish',{p_user_id:owner,p_job_id:r.job.job_id,p_lease:null,p_update:{status:'unknown'}});
  const allowed=await d.reserve(B,'c');assert.equal(allowed.fresh,true);
  for(const [owner,r] of [[A,first],[B,second]]){
   const p={p_user_id:owner,p_job_id:r.job.job_id,p_lease:null,p_update:{status:'failed',rejected:true,diagnostics:{http_status:422,source:'verified-runtime-log'}}};
   assert.equal((await d.rpc('mv_world_finish',p)).allowance_released,true);await d.rpc('mv_world_finish',p);
   assert.equal((await d.rpc('mv_world_account',{p_user_id:owner})).remaining,owner===A?3:2);
  }
  assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,1580);
  assert.equal((await d.db.query('select count(*)::int as n from world_generation_jobs')).rows[0].n,3);
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

test('015 applies twice without changing records, credit holds, grants, reuse, or account limits',async()=>{
 const d=await database();try{
  const original=await readFile(new URL('../../frontend/supabase/013_rejected_world_slots.sql',import.meta.url),'utf8');
  await d.db.exec(original.slice(original.indexOf('create or replace function public.mv_world_reserve('),original.indexOf('create or replace function public.mv_world_account(')));
  await d.db.exec('update world_generation_demo set max_in_flight=2');
  const a=await d.reserve(A,'a'),b=await d.reserve(B,'b');
  for(const [owner,r] of [[A,a],[B,b]])await d.rpc('mv_world_finish',{p_user_id:owner,p_job_id:r.job.job_id,p_lease:null,p_update:{status:'unknown'}});
  const snapshot=async()=>({jobs:(await d.db.query('select * from world_generation_jobs order by id')).rows,budget:(await d.db.query('select * from world_generation_demo')).rows,grants:(await d.db.query("select proacl,prosecdef,proconfig from pg_proc where oid='public.mv_world_reserve(uuid,text,uuid)'::regprocedure")).rows});
  const before=await snapshot();
  const migration=await readFile(new URL('../../frontend/supabase/015_review_reservations_not_active.sql',import.meta.url),'utf8');
  await d.db.exec(migration);assert.deepEqual(await snapshot(),before);
  const definition=(await d.db.query("select pg_get_functiondef('public.mv_world_reserve(uuid,text,uuid)'::regprocedure) as body")).rows;
  await d.db.exec(migration);assert.deepEqual(await snapshot(),before);
  assert.deepEqual((await d.db.query("select pg_get_functiondef('public.mv_world_reserve(uuid,text,uuid)'::regprocedure) as body")).rows,definition);
  assert.equal((await d.reserve(A,'a')).fresh,false);
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
  assert.equal((await d.reserve(A,'c')).fresh,true);
  assert.equal((await d.reserve(A,'d')).fresh,true);
  assert.equal((await d.reserve(A,'e')).error,'allowance_used');
  assert.equal((await d.reserve(B,'f')).error,'in_flight_limit');
 }finally{await d.db.close();}
});

async function reserveDefinition(){
 const sql=await readFile(new URL('../../frontend/supabase/013_rejected_world_slots.sql',import.meta.url),'utf8');
 return sql.slice(sql.indexOf('create or replace function public.mv_world_reserve('),sql.indexOf('create or replace function public.mv_world_account('));
}

test('015 accepts indentation differences and already-deployed slot-rule variants',async()=>{
 const d=await database();try{
  const original=await reserveDefinition();
  const legacy=original.replace("status in ('submitting','pending','unknown')","status in ('submitting','pending')")
   .replaceAll("'review_required'","'in_flight_limit'")
   .replace('Generation is blocked by earlier submissions awaiting owner review. No new World Labs request was sent; your allowance is unchanged.','All global generation slots are processing existing worlds. Resume a pending world or try after one finishes. Your allowance is unchanged.');
  const clean=original.replace(/  if exists\(select 1 from public.world_generation_jobs where status='unknown'\) then\n   return jsonb_build_object\('error','review_required'.*?\n  end if;\n/,'')
   .replace("status in ('submitting','pending','unknown')","status in ('submitting','pending')");
  const migration=await readFile(new URL('../../frontend/supabase/015_review_reservations_not_active.sql',import.meta.url),'utf8');
  for(const sql of [original,legacy,clean]){
   const indented=sql.split('\n').filter(line=>!line.trim().startsWith('--')).map((line,i)=>' '.repeat(i%11)+line).join('\n');
   await d.db.exec(indented);
   const prior=(await d.db.query("select prosrc from pg_proc where oid='public.mv_world_reserve(uuid,text,uuid)'::regprocedure")).rows;
   await d.db.exec(migration);
   const first=(await d.db.query("select prosrc from pg_proc where oid='public.mv_world_reserve(uuid,text,uuid)'::regprocedure")).rows;
   if(sql!==original)assert.deepEqual(first,prior,'Already-safe deployed variants must remain byte-identical');
   await d.db.exec(migration);
   assert.deepEqual((await d.db.query("select prosrc from pg_proc where oid='public.mv_world_reserve(uuid,text,uuid)'::regprocedure")).rows,first);
  }
 }finally{await d.db.close();}
});

test('015 aborts on unreviewed business-logic changes without overwriting them',async()=>{
 const d=await database();try{
  await d.db.exec((await reserveDefinition()).replace('if n >= 3 then','if n >= 4 then'));
  const before=(await d.db.query("select pg_get_functiondef('public.mv_world_reserve(uuid,text,uuid)'::regprocedure) as body")).rows;
  const migration=await readFile(new URL('../../frontend/supabase/015_review_reservations_not_active.sql',import.meta.url),'utf8');
  await assert.rejects(d.db.exec(migration),/Unexpected reservation definition/);
  await d.db.exec('rollback');
  assert.deepEqual((await d.db.query("select pg_get_functiondef('public.mv_world_reserve(uuid,text,uuid)'::regprocedure) as body")).rows,before);
 }finally{await d.db.close();}
});
