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
