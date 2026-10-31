import {existingWorld} from './existingWorld.js';

export function isMemoryWorld(world){
 if(!world?.id || world.id===existingWorld.id || ['sample','mock'].includes(world.source))return false;
 return ['splatUrl','fullResUrl','colliderUrl'].every(key=>{
  try{const url=new URL(world[key]);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='worldlabs.ai'||url.hostname.endsWith('.worldlabs.ai'));}
  catch{return false;}
 });
}
