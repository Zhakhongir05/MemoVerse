import test from 'node:test';
import assert from 'node:assert/strict';
import {accountWorldClient} from './accountWorldClient.js';
const session=id=>({data:{session:{user:{id},access_token:'token-'+id}}});
test('each request uses the current session for the same registered user',async()=>{
 let value=session('A'),calls=0;
 const client=accountWorldClient('A',{auth:{getSession:async()=>value}});
 const fetchImpl=async(path,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer token-A');return {ok:true,json:async()=>({remaining:2})};};
 assert.equal((await client.read('/api/world-account',{fetchImpl})).remaining,2);
 value=session('B');await assert.rejects(()=>client.read('/api/world-account',{fetchImpl}),{name:'AbortError'});assert.equal(calls,1);
});
test('signed-out sessions never send a request for the previous account',async()=>{
 const client=accountWorldClient('A',{auth:{getSession:async()=>({data:{session:null}})}});
 await assert.rejects(()=>client.read('/api/world-account',{fetchImpl:()=>assert.fail('must not request')}),/Sign in/);
});
