import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js'
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222'
async function fixture() {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,name text,bucket_id text); alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`)
  for (const file of ['004_journal_sync.sql','006_journal_deletion.sql','008_world_generation_allowance.sql','009_unify_generation_allowance.sql','010_journal_world_binding.sql'])
    await db.exec(await readFile(new URL('../../frontend/supabase/'+file, import.meta.url),'utf8'))
  await db.exec(`update world_generation_demo set enabled=true,starts_at=now()-interval '1 minute',expires_at=now()+interval '1 day',credit_budget=100000,max_in_flight=100,max_new_per_hour=100,max_new_per_day=100`)
  const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result
  const add = async (owner=A) => {
    const id=randomUUID()
    await db.query(`insert into journal_entries(id,user_id,title,memory_date,mood,photos) values($1,$2,'Synthetic memory',current_date,'Nostalgic',$3)`,[id,owner,JSON.stringify([{path:`${owner}/${id}/photo.png`,type:'image/png'}])])
    return id
  }
  return { db, rpc, add, reserve: (owner,id) => rpc('mv_journal_reserve',[owner,id,0,randomUUID()]) }
}
async function using(fn) {const f=await fixture();try {await fn(f)} finally {await f.db.close()}}
test('journal save makes no world reservation; repeated Relive binds exactly one job',()=>using(async f=>{
  const id=await f.add()
  assert.equal((await f.rpc('mv_journal_world',[A,id])).status,'none')
  assert.equal((await f.db.query('select count(*) n from world_generation_jobs')).rows[0].n,0)
  const results=await Promise.all(Array.from({length:6},()=>f.reserve(A,id)))
  assert.equal(results.filter(x=>x.fresh).length,1)
  assert.equal(new Set(results.map(x=>x.job.job_id)).size,1)
  assert.equal((await f.rpc('mv_world_account',[A])).used,1)
}))
test('different entries get independent worlds and three-per-account enforcement',()=>using(async f=>{
  const ids=await Promise.all(Array.from({length:4},()=>f.add()))
  for (const id of ids.slice(0,3)) assert.equal((await f.reserve(A,id)).fresh,true)
  assert.equal((await f.reserve(A,ids[3])).error,'allowance_used')
  const other=await f.add(B);assert.equal((await f.reserve(B,other)).fresh,true)
  assert.equal((await f.reserve(B,ids[0])).error,'not_found')
}))
test('completion survives new reads, changed photos, judging cutoff, and retains durable paths',()=>using(async f=>{
 const id=await f.add(),job=(await f.reserve(A,id)).job,lease=randomUUID()
 await f.rpc('mv_world_finish',[A,job.job_id,null,JSON.stringify({status:'pending',operation_id:'op-test'})])
 await f.db.exec('update world_generation_jobs set poll_after=null')
 await f.rpc('mv_world_poll',[A,job.job_id,lease])
 const world={id:'saved-world',storagePaths:{splatUrl:`${A}/${job.job_id}/world.spz`,colliderUrl:`${A}/${job.job_id}/collider.glb`}}
 await f.rpc('mv_world_finish',[A,job.job_id,lease,JSON.stringify({status:'succeeded',world_id:world.id,world})])
 await f.db.query('update journal_entries set photos=\'[]\' where id=$1',[id])
 await f.db.exec('update world_generation_demo set enabled=false')
 const reopened=await f.rpc('mv_journal_world',[A,id]);assert.deepEqual(reopened.world,world)
 assert.equal((await f.reserve(A,id)).fresh,false)
 assert.equal((await f.rpc('mv_world_account',[A])).used,1)
}))
test('RLS prevents foreign world/media reads and browser job mutations',()=>using(async f=>{
 const id=await f.add(),job=(await f.reserve(A,id)).job
 await f.db.query('insert into storage.objects values($1,$2,\'memory-worlds\')',[randomUUID(),`${A}/${job.job_id}/world.spz`])
 await f.db.exec(`set role authenticated; set request.jwt.claim.sub='${B}'`)
 assert.equal((await f.db.query('select * from journal_worlds')).rows.length,0)
 assert.equal((await f.db.query('select * from storage.objects')).rows.length,0)
 await assert.rejects(()=>f.reserve(A,id),/permission denied/)
 await assert.rejects(()=>f.db.exec('update journal_worlds set anchors=\'[]\''),/permission denied/)
 await f.db.exec(`set request.jwt.claim.sub='${A}'`)
 assert.equal((await f.db.query('select * from journal_worlds')).rows.length,1)
 assert.equal((await f.db.query('select * from storage.objects')).rows.length,1)
 await f.db.exec('reset role')
 await f.db.query('update journal_entries set deleted_at=now() where id=$1',[id])
 await f.db.exec(`set role authenticated; set request.jwt.claim.sub='${A}'`)
 assert.equal((await f.db.query('select * from journal_worlds')).rows.length,0)
 assert.equal((await f.db.query('select * from storage.objects')).rows.length,0)
}))
test('saved anchors/placements have optimistic revision conflict protection',()=>using(async f=>{
 const id=await f.add();await f.reserve(A,id)
 const data=JSON.stringify({anchors:[{id:'anchor-1',position:[0,0,0],memory:'Supplied story'}],enhancements:null,guidedTour:null})
 assert.equal((await f.rpc('mv_journal_experience',[A,id,0,data])).revision,1)
 assert.equal((await f.rpc('mv_journal_experience',[A,id,0,data])).error,'conflict')
 assert.equal((await f.rpc('mv_journal_world',[A,id])).anchors[0].id,'anchor-1')
}))
test('unknown billing retains allowance and cannot create a replacement job',()=>using(async f=>{
 const id=await f.add(), job=(await f.reserve(A,id)).job
 await f.rpc('mv_world_finish',[A,job.job_id,null,JSON.stringify({status:'unknown'})])
 assert.equal((await f.reserve(A,id)).fresh,false)
 assert.equal((await f.rpc('mv_world_account',[A])).used,1)
}))
test('older unmatched saved worlds require recovery and never reserve a replacement',()=>using(async f=>{
 const id=await f.add()
 await f.db.query('update journal_entries set world=$1 where id=$2',[JSON.stringify({id:'older-world',source:'worldlabs'}),id])
 assert.equal((await f.rpc('mv_journal_world',[A,id])).status,'legacy_recovery')
 assert.equal((await f.reserve(A,id)).error,'conflict')
 assert.equal((await f.rpc('mv_world_account',[A])).used,0)
}))
