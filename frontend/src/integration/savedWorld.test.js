import test from 'node:test';
import assert from 'node:assert/strict';
import {isMemoryWorld} from './savedWorld.js';
import {existingWorld} from './existingWorld.js';
test('Relive accepts specific valid worlds, never the hardcoded sample or incomplete manifests',()=>{
 assert.equal(isMemoryWorld(existingWorld),false);
 assert.equal(isMemoryWorld({...existingWorld,source:'worldlabs'}),false);
 assert.equal(isMemoryWorld({id:'only-id'}),false);
 const generated={...existingWorld,id:'a-new-world'};
 assert.equal(isMemoryWorld(generated),true);
 assert.equal(isMemoryWorld({...generated,source:'sample'}),false);
 assert.equal(isMemoryWorld({...generated,splatUrl:'https://example.org/untrusted.spz'}),false);
});
test('private archived worlds use the configured Supabase signed assets, never an arbitrary origin',()=>{
 const origin='https://project.supabase.co';
 const path=origin+'/storage/v1/object/sign/memory-worlds/account/job/';
 const world={id:'private-generated-world',source:'worldlabs',splatUrl:path+'world.spz?token=test',fullResUrl:path+'world.spz?token=test',colliderUrl:path+'collider.glb?token=test'};
 assert.equal(isMemoryWorld(world,origin),true);
 assert.equal(isMemoryWorld(world,'https://other.supabase.co'),false);
 assert.equal(isMemoryWorld({...world,splatUrl:origin+'/storage/v1/object/public/other/file.spz'},origin),false);
 assert.equal(isMemoryWorld({...world,id:existingWorld.id},origin),false);
 assert.equal(isMemoryWorld({...world,colliderUrl:undefined},origin),false);
});
