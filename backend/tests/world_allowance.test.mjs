import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,A,B} from './world_database_fixture.mjs';
async function withDb(fn){const data=await database();try{await fn(data);}finally{await data.db.close();}}
test('actual migration grants every existing account 3 slots, keeps accounts isolated',()=>withDb(async d=>{
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,3);
 await d.reserve(A,'a');assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
 assert.equal((await d.rpc('mv_world_account',{p_user_id:B})).remaining,3);
}));
test('simultaneous reservations cap the account at 3 with exact credit accounting',()=>withDb(async d=>{
 const results=await Promise.all('abcdef'.split('').map(hash=>d.reserve(A,hash)));
 assert.equal(results.filter(r=>r.fresh).length,3);assert.equal(results.filter(r=>r.error==='allowance_used').length,3);
 assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,4740);
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,0);
}));
test('concurrent retries of same submission reserve one allowance and one charge',()=>withDb(async d=>{
 const result=await Promise.all(Array.from({length:5},()=>d.reserve(A,'a')));
 assert.equal(result.filter(r=>r.fresh).length,1);assert.equal(new Set(result.map(r=>r.job.job_id)).size,1);
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
}));
test('global cap covers all accounts atomically',()=>withDb(async d=>{
 await d.db.exec('update world_generation_demo set credit_budget=1580');
 const result=await Promise.all([d.reserve(A,'a'),d.reserve(B,'b')]);assert.equal(result.filter(r=>r.fresh).length,1);assert.equal(result.filter(r=>r.error==='budget').length,1);
}));
test('uncertain submission and provider failure keep allowances and credits reserved',()=>withDb(async d=>{
 const claim=await d.reserve(A,'a');
 await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:claim.job.job_id,p_lease:null,p_update:{status:'unknown',message:'review'}});
 assert.equal((await d.reserve(A,'a')).fresh,false);assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
 assert.equal((await d.db.query('select reserved_credits from world_generation_demo')).rows[0].reserved_credits,1580);
}));
test('completed-world revisits and cross-device sessions never spend another slot',()=>withDb(async d=>{
 const first=await d.reserve(A,'a');await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:first.job.job_id,p_lease:null,p_update:{status:'pending',operation_id:'op-1'}});
 await d.db.exec('update world_generation_jobs set poll_after=null');const lease=randomUUID();
 await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:first.job.job_id,p_lease:lease});
 await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:first.job.job_id,p_lease:lease,p_update:{status:'succeeded',world_id:'world-1',world:{id:'world-1'}}});
 for(let i=0;i<15;i++)assert.equal((await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:first.job.job_id,p_lease:randomUUID()})).poll,false);
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
 assert.equal((await d.rpc('mv_world_poll',{p_user_id:B,p_job_id:first.job.job_id,p_lease:randomUUID()})).error,'not_found');
}));
test('30-day cutoff stops new reservations, keeps previous jobs readable and idempotent',()=>withDb(async d=>{
 const first=await d.reserve(A,'a');await d.db.exec("update world_generation_demo set starts_at=now()-interval '30 days',expires_at=now()-interval '1 minute'");
 assert.equal((await d.reserve(A,'b')).error,'ended');assert.equal((await d.reserve(A,'a')).fresh,false);
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).jobs[0].job_id,first.job.job_id);
 await assert.rejects(()=>d.db.exec("update world_generation_demo set expires_at=starts_at+interval '31 days'"));
}));
test('rate limits, in-flight cap and disabled flag stop new jobs',()=>withDb(async d=>{
 await d.db.exec('update world_generation_demo set max_in_flight=1');await d.reserve(A,'a');assert.equal((await d.reserve(B,'b')).error,'busy');
 await d.db.exec('update world_generation_demo set enabled=false');assert.equal((await d.reserve(B,'c')).error,'disabled');
 for(let i=0;i<10;i++)await d.reserve(A,'a');assert.equal((await d.reserve(A,'a')).error,'rate_limit');
}));
test('browser database roles cannot reserve, update jobs, or manipulate budgets',()=>withDb(async d=>{
 await d.db.exec('set role authenticated');await assert.rejects(()=>d.rpc('mv_world_reserve',{p_user_id:A,p_submission:'a'.repeat(64),p_job_id:randomUUID()}),/permission denied/);
 await assert.rejects(()=>d.db.exec('update public.world_generation_demo set credit_budget=999999'),/permission denied/);
 await assert.rejects(()=>d.db.exec('select * from public.world_generation_jobs'),/permission denied/);await d.db.exec('reset role');
}));
test('lost submission and stale poll lease cannot resubmit or overwrite final result',()=>withDb(async d=>{
 const claim=await d.reserve(A,'a');await d.db.exec("update world_generation_jobs set created_at=now()-interval '2 minutes'");
 const result=await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:claim.job.job_id,p_lease:randomUUID()});assert.equal(result.job.status,'unknown');assert.equal((await d.reserve(A,'a')).fresh,false);
}));
test('a stale poll lease cannot overwrite a completed job or change its allowance',()=>withDb(async d=>{
 const job=(await d.reserve(A,'a')).job;
 await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:job.job_id,p_lease:null,p_update:{status:'pending',operation_id:'op-1'}});
 await d.db.exec('update world_generation_jobs set poll_after=null');const old=randomUUID();await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:job.job_id,p_lease:old});
 await d.db.exec('update world_generation_jobs set poll_after=null');const current=randomUUID();await d.rpc('mv_world_poll',{p_user_id:A,p_job_id:job.job_id,p_lease:current});
 await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:job.job_id,p_lease:current,p_update:{status:'succeeded',world_id:'world-final',world:{id:'world-final'}}});
 const late=await d.rpc('mv_world_finish',{p_user_id:A,p_job_id:job.job_id,p_lease:old,p_update:{status:'failed'}});assert.equal(late.status,'succeeded');assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
}));
test('global fixed-hour and fixed-day limits do not spend another account slot',()=>withDb(async d=>{
 await d.db.exec('update world_generation_demo set max_new_per_hour=1');await d.reserve(A,'a');assert.equal((await d.reserve(B,'b')).error,'busy');
 await d.db.exec('update world_generation_demo set max_new_per_hour=100,max_new_per_day=1');assert.equal((await d.reserve(B,'c')).error,'busy');assert.equal((await d.rpc('mv_world_account',{p_user_id:B})).remaining,3);
}));
test('the existing service_role can execute backend RPCs without browser table grants',()=>withDb(async d=>{
 await d.db.exec('set role service_role');
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,3);
 const claim=await d.reserve(A,'a');assert.equal(claim.fresh,true);
 assert.equal((await d.rpc('mv_world_account',{p_user_id:A})).remaining,2);
 await d.db.exec('reset role');
}));
