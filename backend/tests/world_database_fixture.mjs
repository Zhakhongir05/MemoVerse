// Local tests ONLY: real PostgreSQL engine, synthetic auth.users and roles.
import {PGlite} from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
export async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');`);
 const migration=await readFile(new URL('../../frontend/supabase/004_world_generation_allowance.sql',import.meta.url),'utf8');await db.exec(migration);
 await db.exec(`update public.world_generation_demo set enabled=true,starts_at=now()-interval '1 minute',expires_at=now()+interval '29 days',credit_budget=100000,max_new_per_hour=100,max_new_per_day=100,max_in_flight=100;`);
 const functions={mv_world_config:[],mv_world_account:['p_user_id'],mv_world_reserve:['p_user_id','p_submission','p_job_id'],mv_world_poll:['p_user_id','p_job_id','p_lease'],mv_world_finish:['p_user_id','p_job_id','p_lease','p_update']};
 return {db,async rpc(name,args={}){
  if(!Object.hasOwn(functions,name))throw new Error('Unknown RPC');
  const names=functions[name],values=names.map(key=>key==='p_update'?JSON.stringify(args[key]):args[key]);
  const result=await db.query(`select public.${name}(${names.map((_,i)=>'$'+(i+1)).join(',')}) as result`,values);
  return result.rows[0].result;
 },async reserve(user,submission){return this.rpc('mv_world_reserve',{p_user_id:user,p_submission:submission.repeat(64).slice(0,64),p_job_id:randomUUID()});}};
}
