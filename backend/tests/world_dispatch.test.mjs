import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,A} from './world_database_fixture.mjs';
const enqueue=(d,hash='e')=>d.rpc('mv_world_enqueue',{p_user_id:A,p_submission:hash.repeat(64),p_job_id:randomUUID(),p_payload:{image_base64:'aGVsbG8=',story:'test'}});
test('durable queue survives delays; simultaneous dispatch claims authorize one POST',async()=>{
 const d=await database();try{
  const r=await enqueue(d),id=r.job.job_id;
  await d.db.query("update world_generation_jobs set created_at=now()-interval '1 day' where id=$1",[id]);
  assert.equal((await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:id,p_lease:randomUUID()})).job.status,'submitting');
  const results=await Promise.all(Array.from({length:8},()=>d.rpc('mv_world_dispatch_claim',{p_user_id:A,p_job_id:id})));
  assert.equal(results.filter(r=>r.dispatch).length,1);
  assert.equal(results.find(r=>r.dispatch).payload.story,'test');
  assert.equal((await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:id,p_lease:randomUUID()})).job.status,'submitting');
 }finally{await d.db.close();}
});
test('definite rejection restores one slot and budget once; explicit retry gets a new job',async()=>{
 const d=await database();try{
  const r=await enqueue(d),id=r.job.job_id;
  const update={p_user_id:A,p_job_id:id,p_lease:null,p_update:{status:'failed',rejected:true,diagnostics:{http_status:422,fields:['body.tags.1']}}};
  await d.rpc('mv_world_finish',update);await d.rpc('mv_world_finish',update);
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,3);
  assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,0);
  assert.notEqual((await enqueue(d)).job.job_id,id);
  const records=(await d.db.query('select * from world_generation_jobs')).rows;
  assert.equal(records.length,2);assert.equal(records.filter(j=>j.allowance_released).length,1);
 }finally{await d.db.close();}
});
test('unknown billing stays held and late operation write can recover without resubmission',async()=>{
 const d=await database();try{
  const r=await enqueue(d),id=r.job.job_id;
  await d.rpc('mv_world_dispatch_claim',{p_user_id:A,p_job_id:id});
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:id,p_lease:null,p_update:{status:'unknown'}});
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
  assert.equal((await d.rpc('mv_world_dispatch_claim',{p_user_id:A,p_job_id:id})).dispatch,false);
  assert.equal((await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:id,p_lease:null,p_update:{status:'pending',operation_id:'known-operation'}})).status,'pending');
 }finally{await d.db.close();}
});
test('scheduler sends only scoped job tokens to the production worker and is idempotent',async()=>{
 const d=await database();try{
  await d.db.exec(`create schema cron;create schema net;
   create table cron.job(jobname text primary key,schedule text,command text);
   create function cron.schedule(text,text,text) returns bigint language sql as 'insert into cron.job values($1,$2,$3);select 1::bigint';
   create table net.requests(url text,headers jsonb,body jsonb,timeout_milliseconds integer);
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.requests values($1,$2,$3,$4);select 1::bigint';`);
  const {readFile}=await import('node:fs/promises');
  const scheduler=(await readFile(new URL('../../frontend/supabase/014_world_job_scheduler.sql',import.meta.url),'utf8')).replace(/^create extension.*$/gm,'');
  await d.db.exec(scheduler);await d.db.exec(scheduler);
  assert.equal((await d.db.query('select * from cron.job')).rows.length,1);
  const r=await enqueue(d);await d.db.exec('select public.mv_world_dispatch_tick()');
  const sent=(await d.db.query('select * from net.requests')).rows[0];
  assert.equal(sent.url,'https://memoverse05.vercel.app/api/world-worker');
  assert.equal(sent.timeout_milliseconds,55000);
  assert.equal(sent.body.job_id,r.job.job_id);
  assert.equal((await d.rpc('mv_world_worker_owner',{p_job_id:r.job.job_id,p_token:randomUUID()})).user_id,undefined);
  assert.equal((await d.rpc('mv_world_worker_owner',{p_job_id:r.job.job_id,p_token:sent.body.token})).user_id,A);
  await d.db.exec('set role authenticated');
  await assert.rejects(d.db.exec('select * from world_generation_inputs'));
  await assert.rejects(d.db.exec('select public.mv_world_dispatch_tick()'));
 }finally{await d.db.close();}
});
