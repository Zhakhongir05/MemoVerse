import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {database,A,B,M,CONTEXT} from './memorycast_database_fixture.mjs';
async function using(fn){const d=await database();try{await fn(d);}finally{await d.db.close();}}
async function enable(d){await d.db.exec('update memorycast_settings set enabled=true,max_daily_jobs=20,max_user_daily_jobs=10');}
async function reserve(d,hash='a',regenerate=false,user=A){return d.rpc('mc_reserve',{p_user:user,p_memory:M,p_id:randomUUID(),p_hash:hash.repeat(64),p_context:CONTEXT,p_regenerate:regenerate});}
async function claim(d,id,user=A){const lease=randomUUID();const result=await d.rpc('mc_claim',{p_user:user,p_id:id,p_lease:lease});return {...result,lease};}
async function finish(d,id,c,update){return d.rpc('mc_finish',{p_user:A,p_id:id,p_lease:c.lease,p_update:update});}
test('database defaults disabled, verifies memory ownership and denies browser RPC writes',()=>using(async d=>{
 assert.equal((await reserve(d)).error,'disabled');assert.equal((await reserve(d,'a',false,B)).error,'not_found');
 await d.db.exec('set role authenticated');await assert.rejects(d.db.query(`select public.mc_reserve('${A}','${M}','${randomUUID()}','${'a'.repeat(64)}','{}',false)`),/permission denied/);await d.db.exec('reset role');
}));
test('simultaneous reservations and claims submit one job and lease one paid step',()=>using(async d=>{
 await enable(d);const results=await Promise.all(Array.from({length:5},()=>reserve(d)));assert.equal(results.filter(x=>x.fresh).length,1);
 const id=results[0].tour.id;const claims=await Promise.all(Array.from({length:5},()=>claim(d,id)));assert.equal(claims.filter(x=>x.claimed).length,1);
 assert.equal((await claim(d,id,B)).error,'not_found');
}));
test('script and three audio chapters survive new reads and ready jobs cannot regenerate',()=>using(async d=>{
 await enable(d);const {tour}=await reserve(d);let c=await claim(d,tour.id);
 await finish(d,tour.id,c,{script:{chapters:[{order:1},{order:2},{order:3}]}});
 for(let i=1;i<=3;i++){c=await claim(d,tour.id);await finish(d,tour.id,c,{audio_path:`${A}/${M}/${tour.id}/${i}.wav`,duration:12});}
 const saved=await d.rpc('mc_read',{p_user:A,p_memory:M,p_tour:null});assert.equal(saved.tour.status,'ready');assert.equal(saved.tour.audio_paths.length,3);
 assert.equal((await reserve(d)).fresh,false);assert.equal((await claim(d,tour.id)).claimed,false);
 await d.db.exec(`set test.account_id='${A}';set role authenticated;`);assert.equal((await d.db.query('select count(*)::integer n from memorycast_tours')).rows[0].n,1);await d.db.exec('reset role');
 await d.db.exec(`set test.account_id='${B}';set role authenticated;`);assert.equal((await d.db.query('select count(*)::integer n from memorycast_tours')).rows[0].n,0);await d.db.exec('reset role');
}));
test('memory edits require explicit regeneration; rate cap and same-hash cache are persistent',()=>using(async d=>{
 await enable(d);await reserve(d);assert.equal((await reserve(d,'b')).error,'stale');assert.equal((await reserve(d,'b',true)).fresh,true);
 await d.db.exec('update memorycast_settings set max_user_daily_jobs=2');assert.equal((await reserve(d,'c',true)).error,'limit');assert.equal((await reserve(d)).fresh,false);
}));
test('expired or failed provider lease cannot trigger paid retries or overwrite a result',()=>using(async d=>{
 await enable(d);const {tour}=await reserve(d);const c=await claim(d,tour.id);
 await d.db.exec(`update memorycast_tours set lease_until=now()-interval '1 second' where id='${tour.id}'`);
 const next=await claim(d,tour.id);assert.equal(next.tour.status,'uncertain');assert.equal(next.claimed,false);
 assert.equal((await finish(d,tour.id,c,{script:{chapters:[]}})).tour.status,'uncertain');assert.equal((await reserve(d)).fresh,false);
}));
test('soft-deleted memories deny new steps, replay and private Storage reads',()=>using(async d=>{
 await enable(d);const {tour}=await reserve(d);await d.db.exec(`update journal_entries set deleted_at=now() where id='${M}'`);
 assert.equal((await claim(d,tour.id)).error,'not_found');assert.equal((await d.rpc('mc_read',{p_user:A,p_memory:M,p_tour:null})).error,'not_found');
}));

test('private audio Storage policies allow only the owner of a ready, undeleted tour',()=>using(async d=>{
 await enable(d);const {tour}=await reserve(d);await finish(d,tour.id,await claim(d,tour.id),{script:{chapters:[{order:1},{order:2},{order:3}]}});
 for(let i=1;i<=3;i++)await finish(d,tour.id,await claim(d,tour.id),{audio_path:`${A}/${M}/${tour.id}/${i}.wav`,duration:1});
 await d.db.query('insert into storage.objects values($1,$2)',['memorycast-audio',`${A}/${M}/${tour.id}/1.wav`]);
 assert.equal((await d.db.query("select public from storage.buckets where id='memorycast-audio'")).rows[0].public,false);
 for(const [user,expected] of [[A,1],[B,0]]){
  await d.db.exec(`set test.account_id='${user}';set role authenticated;`);
  assert.equal((await d.db.query('select count(*)::integer n from storage.objects')).rows[0].n,expected);
  await assert.rejects(d.db.query("insert into storage.objects values('memorycast-audio','forged.wav')"),/permission denied/);
  await d.db.exec('reset role');
 }
 await d.db.exec(`update journal_entries set deleted_at=now() where id='${M}';set test.account_id='${A}';set role authenticated;`);
 assert.equal((await d.db.query('select count(*)::integer n from storage.objects')).rows[0].n,0);await d.db.exec('reset role');
}));
test('missing generation configuration fails closed without a provider lease',()=>using(async d=>{
 await enable(d);const {tour}=await reserve(d);await d.db.exec('delete from memorycast_settings');
 assert.equal((await reserve(d,'b',true)).error,'disabled');assert.equal((await claim(d,tour.id)).error,'disabled');
 assert.equal((await d.db.query('select lease from memorycast_tours')).rows[0].lease,null);
}));

test('status-only polling detects interrupted generation without retrying a provider',()=>using(async d=>{
 await enable(d);const {tour}=await reserve(d);await claim(d,tour.id);
 await d.db.exec(`update memorycast_tours set lease_until=now()-interval '1 second' where id='${tour.id}'`);
 const read=await d.rpc('mc_read',{p_user:A,p_memory:M,p_tour:null});assert.equal(read.tour.status,'uncertain');
 assert.equal((await claim(d,tour.id)).claimed,false);
}));
