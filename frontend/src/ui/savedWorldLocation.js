const pattern=/^#world\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
export function savedWorldId(hash=globalThis.location?.hash||''){return pattern.exec(hash)?.[1]||null;}
export function rememberWorld(id){
 if(!savedWorldId('#world/'+id))return;
 globalThis.history?.replaceState(null,'','#world/'+id);
}
export function clearWorldLocation(){
 if(savedWorldId())globalThis.history?.replaceState(null,'',globalThis.location.pathname+globalThis.location.search);
}
