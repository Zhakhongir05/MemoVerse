// Local-only Supabase HTTP stand-in, backed by the actual migration in PostgreSQL.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {database} from './world_database_fixture.mjs';
export const TEST_USERS=Array.from({length:12},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
export function sessionFor(id){
 const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const access_token=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({sub:id,role:'authenticated',aud:'authenticated',iat:1700000000,exp:4102444800,iss:'http://127.0.0.1:8036/auth/v1'})+'.test-only-signature';
 return {access_token,refresh_token:'test-refresh-'+id,expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id,email:`judge-${id.slice(-2)}@example.test`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{},created_at:'2026-10-31T00:00:00Z'}};
}
const asset={id:'mock-world',splatUrl:'https://cdn.marble.worldlabs.ai/demo-generated.spz',fullResUrl:'https://cdn.marble.worldlabs.ai/demo-generated-full.spz',colliderUrl:'https://cdn.marble.worldlabs.ai/demo-collider.glb',thumbnailUrl:'https://cdn.marble.worldlabs.ai/demo-thumb.png'};
async function serve(){
 const data=await database();for(const id of TEST_USERS)await data.db.query('insert into auth.users values($1)',[id]);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5206');res.setHeader('Access-Control-Allow-Headers','apikey,authorization,content-type,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));};
  try{
   if(req.url==='/health')return reply(200,{ok:true});
   if(req.url==='/auth/v1/user'){
    const user=TEST_USERS.find(id=>req.headers.authorization==='Bearer '+sessionFor(id).access_token);
    return reply(user?200:401,user?sessionFor(user).user:{error:'invalid test token'});
   }
   if(req.url.startsWith('/auth/v1/logout')){res.writeHead(204).end();return;}
   let text='';for await(const chunk of req)text+=chunk;
   const body=JSON.parse(text||'{}');
   if(req.url==='/__test/seed-completed'){
    for(let i=0;i<3;i++){
     const claim=await data.rpc('mv_world_reserve',{p_user_id:body.user_id,p_submission:String(i).repeat(64),p_job_id:randomUUID()});
     await data.rpc('mv_world_finish',{p_user_id:body.user_id,p_job_id:claim.job.job_id,p_lease:null,p_update:{status:'pending',operation_id:'seed-op'}});
     await data.db.query('update world_generation_jobs set poll_after=null where id=$1',[claim.job.job_id]);
     const lease=randomUUID();await data.rpc('mv_world_poll',{p_user_id:body.user_id,p_job_id:claim.job.job_id,p_lease:lease});
     await data.rpc('mv_world_finish',{p_user_id:body.user_id,p_job_id:claim.job.job_id,p_lease:lease,p_update:{status:'succeeded',world_id:asset.id,world:asset}});
    }
    return reply(200,{seeded:3});
   }
   if(req.url.startsWith('/rest/v1/rpc/')&&req.headers.apikey==='test-service-role')return reply(200,await data.rpc(req.url.split('/').at(-1),body));
   return reply(403,{error:'forbidden'});
  }catch(error){return reply(500,{error:'test fixture error',detail:error.message});}
 });
 server.listen(8036,'127.0.0.1');
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await data.db.close();process.exit(0);}));
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await serve();
