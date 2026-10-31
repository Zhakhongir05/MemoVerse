import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSceneToRoom,ROOM_ZONE,ASSET_BOUNDS} from './roomLayout.js';
function fixture(){return {title:'Room',environment:'bedroom',mood:'nostalgic',objects:Object.keys(ASSET_BOUNDS).map((type,i)=>({id:`o-${i}`,type,position:[i-3,0,i-3],scale:[1,1,1],memory:'A written memory',audioUrl:null}))};}
function inside(scene){
 const fit=fitSceneToRoom(scene);assert.ok(fit.scale>0&&fit.scale<=1);
 for(const o of scene.objects)for(let axis=0;axis<3;axis++)for(const side of ['min','max']){
  const value=(o.position[axis]+ASSET_BOUNDS[o.type][side][axis]*o.scale[axis])*fit.scale+fit.offset[axis];
  assert.ok(value>=ROOM_ZONE.min[axis]-1e-9&&value<=ROOM_ZONE.max[axis]+1e-9,`${o.type} extends outside room`);
 }
 return fit;
}
test('all seven generated asset types fit in the existing room without mutating IDs, stories or transforms',()=>{
 const s=fixture(),original=structuredClone(s);inside(s);assert.deepEqual(s,original);
});
test('extreme backend positions and scales stay within the room without camera changes',()=>{
 const s=fixture();s.objects.forEach((o,i)=>{o.position=[i%2?10:-10,i%2?10:-10,i%3?10:-10];o.scale=[5,.2,5];});inside(s);
});
test('layout rejects unsupported object types and non-finite coordinates',()=>{
 const s=fixture();s.objects[0].type='unknown';assert.throws(()=>fitSceneToRoom(s));
 s.objects[0].type='desk';s.objects[0].position[0]=Infinity;assert.throws(()=>fitSceneToRoom(s));
});
