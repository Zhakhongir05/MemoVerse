import {worldFetch,worldRequest} from './worldJobs.js';
// Uses the EXISTING Supabase session. Never mints an account or a shared secret.
export function accountWorldClient(expectedUserId,client){
 async function call(request,path,options={}){
  const {data,error}=await client.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Sign in with your existing account to create or open your worlds.');
  if(data.session.user.id!==expectedUserId)throw new DOMException('Account changed.','AbortError');
  options.signal?.throwIfAborted();
  return request(path,{...options,accessToken:data.session.access_token});
 }
 return {read:(path,options)=>call(worldFetch,path,options),job:(path,options)=>call(worldRequest,path,options)};
}
