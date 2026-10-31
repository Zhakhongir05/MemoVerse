import test from 'node:test';import assert from 'node:assert/strict';import {savedWorldId} from './savedWorldLocation.js';
test('saved-world URL restores only a strict memory UUID, never a generation request',()=>{
 const id='54f8a20d-d08e-485e-b83d-cb12c9eff646';assert.equal(savedWorldId('#world/'+id),id);
 for(const value of ['', '#world/other-account','#world/'+id+'/generate','#world/javascript:alert(1)'])assert.equal(savedWorldId(value),null);
});
