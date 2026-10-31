// LOCAL ONLY: existing Supabase HTTP contract backed by the actual tour migration.
import http from 'node:http';import {database,A,B,M} from './memorycast_database_fixture.mjs';
const data=await database();const blobs=new Map();
await data.db.exec(`update memorycast_settings set enabled=true,max_user_daily_jobs=10;
 update journal_entries set title='Rain at the window',story='I listened to the rain by the wooden desk.',photos='[{"path":"${A}/${M}/photo.png","type":"image/png"}]',scene='{"objects":[{"id":"desk-1","type":"desk","position":[1,0,-2],"memory":"The wooden desk by the window."}]}',world='{"id":"saved-world"}' where id='${M}';`);
// Tiny synthetic PNG, never a private photograph.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:8028');res.setHeader('Access-Control-Allow-Headers','authorization,content-type,apikey,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 const reply=(status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 try{
  const url=new URL(req.url,'http://test');
  if(url.pathname==='/health')return reply(200,{ok:true});
  if(url.pathname==='/auth/v1/user'){
   const id=req.headers.authorization==='Bearer session-a'?A:req.headers.authorization==='Bearer session-b'?B:null;
   return reply(id?200:401,id?{id,email:'judge@example.test',is_anonymous:false}:{error:'invalid session'});
  }
  if(url.pathname.startsWith('/storage/v1/object/sign/memorycast-audio/')&&req.method==='GET'){
   const path=decodeURIComponent(url.pathname.split('/memorycast-audio/')[1]);const bytes=blobs.get(path);
   if(!bytes||url.searchParams.get('token')!=='test-only-signed')return reply(403,{error:'private audio'});
   res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':bytes.length}).end(bytes);return;
  }
  if(req.headers.apikey!=='test-service-role')return reply(403,{error:'backend authority required'});
  if(url.pathname==='/rest/v1/journal_entries'){
   const id=url.searchParams.get('id')?.replace('eq.',''),user=url.searchParams.get('user_id')?.replace('eq.','');
   return reply(200,(await data.db.query('select * from journal_entries where id=$1 and user_id=$2 and deleted_at is null',[id,user])).rows);
  }
  if(url.pathname.startsWith('/storage/v1/object/authenticated/memory-assets/')){res.writeHead(200,{'Content-Type':'image/png'}).end(png);return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);
  if(url.pathname.startsWith('/storage/v1/object/memorycast-audio/')){
   const path=decodeURIComponent(url.pathname.split('/memorycast-audio/')[1]);if(blobs.has(path))return reply(409,{error:'immutable audio'});
   blobs.set(path,raw);return reply(200,{Key:path});
  }
  const body=JSON.parse(raw.toString()||'{}');
  if(url.pathname.startsWith('/storage/v1/object/sign/memorycast-audio/')){
   const path=url.pathname.split('/memorycast-audio/')[1];return reply(200,{signedURL:'/object/sign/memorycast-audio/'+path+'?token=test-only-signed'});
  }
  if(url.pathname.startsWith('/rest/v1/rpc/'))return reply(200,await data.rpc(url.pathname.split('/').at(-1),body));
  if(url.pathname==='/__test/edit'){await data.db.query('update journal_entries set story=$1 where id=$2',[body.story,M]);return reply(200,{ok:true});}
  return reply(404,{error:'not found'});
 }catch(error){return reply(500,{error:'test fixture failure',detail:error.message});}
});
server.listen(8038,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await data.db.close();process.exit(0);}));
