import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,A,B} from './world_database_fixture.mjs';
async function memory(d,user=A){
 const id=randomUUID(),path=`${user}/${id}/photo.png`;
 await d.db.query(`insert into journal_entries(id,user_id,story,photos) values($1,$2,'An actual saved memory',$3)`,[id,user,JSON.stringify([{path}])]);
 return {p_user_id:user,p_memory_id:id,p_photo_path:path,p_story:'An actual saved memory',p_submission:randomUUID().replaceAll('-','').repeat(2),p_job_id:randomUUID()};
}
test('journal reservation is persistent, deduplicated, and ownership checked',async()=>{
 const d=await database();try{
  const p=await memory(d),first=await d.rpc('mv_world_reserve_memory',p);
  assert.equal(first.fresh,true);
  const retry=await d.rpc('mv_world_reserve_memory',{...p,p_job_id:randomUUID(),p_submission:'f'.repeat(64)});
  assert.equal(retry.fresh,false);assert.equal(retry.job.job_id,first.job.job_id);
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
  assert.equal((await d.rpc('mv_world_memory',{p_user_id:B,p_memory_id:p.p_memory_id})).error,'not_found');
  assert.equal((await d.rpc('mv_world_reserve_memory',{...p,p_user_id:B})).error,'not_found');
 }finally{await d.db.close();}
});
test('completion atomically links real world, stale sync preserves it, revisits cost nothing',async()=>{
 const d=await database();try{
  const p=await memory(d),first=await d.rpc('mv_world_reserve_memory',p),id=first.job.job_id,lease=randomUUID();
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:id,p_lease:null,p_update:{status:'pending',operation_id:'op-live-shape'}});
  await d.db.query('update world_generation_jobs set poll_after=null where id=$1',[id]);
  await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:id,p_lease:lease});
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:id,p_lease:lease,p_update:{status:'succeeded',world_id:'specific-world',world:{id:'specific-world',splatUrl:'https://cdn.marble.worldlabs.ai/new.spz'}}});
  let saved=await d.rpc('mv_world_memory',{p_user_id:A,p_memory_id:p.p_memory_id});
  assert.equal(saved.world.id,'specific-world');assert.equal(saved.world.jobId,id);assert.equal(saved.world.journalEntryId,p.p_memory_id);
  await d.db.query('update journal_entries set world=null,story=$2 where id=$1',[p.p_memory_id,'Edited in another tab']);
  for(let i=0;i<4;i++){saved=await d.rpc('mv_world_memory',{p_user_id:A,p_memory_id:p.p_memory_id});assert.equal(saved.world.id,'specific-world');}
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
  await d.db.query('update journal_entries set deleted_at=now(),world=null where id=$1',[p.p_memory_id]);
  assert.equal((await d.rpc('mv_world_memory',{p_user_id:A,p_memory_id:p.p_memory_id})).error,'not_found');
 }finally{await d.db.close();}
});
test('changed saved inputs do not reserve or submit; draft reservation costs exactly 230',async()=>{
 const d=await database();try{
  const p=await memory(d);
  assert.equal((await d.rpc('mv_world_reserve_memory',{...p,p_story:'Forged story'})).error,'memory_changed');
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,3);
  await d.db.exec(`update world_generation_demo set model='marble-1.0-draft',credits_per_job=230,credit_budget=230;`);
  assert.equal((await d.rpc('mv_world_reserve_memory',p)).model,'marble-1.0-draft');
  assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,230);
  assert.equal((await d.rpc('mv_world_reserve_memory',await memory(d,B))).error,'budget');
  await assert.rejects(d.db.exec(`update world_generation_demo set model='marble-1.1',credits_per_job=230`));
 }finally{await d.db.close();}
});
test('three account slots, simultaneous journal retries, and failed reservations remain held',async()=>{
 const d=await database();try{
  const p=await memory(d);
  const results=await Promise.all(Array.from({length:8},()=>d.rpc('mv_world_reserve_memory',{...p,p_job_id:randomUUID()})));
  assert.equal(results.filter(r=>r.fresh).length,1);assert.equal(new Set(results.map(r=>r.job.job_id)).size,1);
  await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:results[0].job.job_id,p_lease:null,p_update:{status:'unknown',message:'Billing uncertain'}});
  for(let i=0;i<2;i++)assert.equal((await d.rpc('mv_world_reserve_memory',await memory(d))).fresh,true);
  assert.equal((await d.rpc('mv_world_reserve_memory',await memory(d))).error,'allowance_used');
  assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,0);
  assert.equal((await d.rpc('mv_world_reserve_memory',p)).fresh,false);
 }finally{await d.db.close();}
});
