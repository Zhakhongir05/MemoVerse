import {existingWorld} from './existingWorld.js';

export function isMemoryWorld(world, supabaseUrl = import.meta.env?.VITE_SUPABASE_URL){
 if(!world?.id || world.id===existingWorld.id || ['sample','mock'].includes(world.source))return false;
 return ['splatUrl','fullResUrl','colliderUrl'].every(key=>{
  try{const url=new URL(world[key]);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='worldlabs.ai'||url.hostname.endsWith('.worldlabs.ai')||(supabaseUrl && url.origin===new URL(supabaseUrl).origin && url.pathname.startsWith('/storage/v1/object/sign/memory-worlds/')));}
  catch{return false;}
 });
}
