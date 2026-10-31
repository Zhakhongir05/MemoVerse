// Local-only Supabase HTTP stand-in, backed by the actual migration in PostgreSQL.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {database} from './world_database_fixture.mjs';
export const TEST_USERS=Array.from({length:12},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
export function sessionFor(id){
 const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const access_token=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({sub:id,role:'authenticated',aud:'authenticated',iat:1700000000,exp:4102444800,iss:'http://127.0.0.1:8036/auth/v1'})+'.test-only-signature';
 return {access_token,refresh_token:'test-refresh-'+id,expires_at:4102444800,expires_in:3600,token_type:'bearer',user:{id,email:`judge-${id.slice(-2)}@example.test`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},identities:[{provider:'google'}],user_metadata:{},created_at:'2026-10-31T00:00:00Z'}};
}
const asset={id:'mock-world',splatUrl:'https://cdn.marble.worldlabs.ai/demo-generated.spz',fullResUrl:'https://cdn.marble.worldlabs.ai/demo-generated-full.spz',colliderUrl:'https://cdn.marble.worldlabs.ai/demo-collider.glb',thumbnailUrl:'https://cdn.marble.worldlabs.ai/demo-thumb.png'};
async function serve(){
 const data=await database();for(const id of TEST_USERS)await data.db.query('insert into auth.users values($1)',[id]);
 const stored=new Map();
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
   const currentUser=TEST_USERS.find(id=>req.headers.authorization==='Bearer '+sessionFor(id).access_token);
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
   if(req.url.startsWith('/storage/v1/object/')){
    const path=req.url.replace(/^\/storage\/v1\/object\/(authenticated\/)?memory-assets\//,'');
    if(req.method==='POST'&&currentUser&&path.startsWith(currentUser+'/')){
     let asset={bytes,type:req.headers['content-type']};
     if(asset.type.startsWith('multipart/form-data')){
      const form=await new Response(bytes,{headers:{'Content-Type':asset.type}}).formData();
      const file=[...form.values()].find(value=>typeof value.arrayBuffer==='function');
      asset={bytes:Buffer.from(await file.arrayBuffer()),type:file.type};
     }
     stored.set(path,asset);return reply(200,{Key:path});
    }
    if(req.method==='GET'&&(req.headers.apikey==='test-service-role'||currentUser&&path.startsWith(currentUser+'/'))&&stored.has(path)){
     const asset=stored.get(path);res.writeHead(200,{'Content-Type':asset.type}).end(asset.bytes);return;
    }
    return reply(404,{error:'private photo missing'});
   }
   let text=bytes.toString();
   const body=JSON.parse(text||'{}');
   if(req.url.startsWith('/rest/v1/journal_entries')&&currentUser){
    if(req.method==='GET')return reply(200,(await data.db.query('select * from journal_entries where user_id=$1',[currentUser])).rows);
    if(req.method==='POST'&&body.user_id===currentUser){
     const keys=['id','user_id','title','memory_date','story','mood','photos','audio','scene','world','created_at','updated_at','deleted_at'];
     const values=keys.map(k=>['photos','audio','scene','world'].includes(k)&&body[k]!=null?JSON.stringify(body[k]):body[k]??null);
     const rows=await data.db.query(`insert into journal_entries(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(id) do update set ${keys.filter(k=>k!=='id'&&k!=='user_id').map(k=>k+'=excluded.'+k).join(',')} returning *`,values);
     return reply(200,rows.rows[0]);
    }
   }
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
