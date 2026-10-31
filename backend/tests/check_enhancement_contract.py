"""Offline cross-language contract check against pinned teammate source.
Run from repo root: python backend/tests/check_enhancement_contract.py
"""
import json,subprocess,tempfile,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from backend.enhancements import CATALOG,Enhancement,EnhancementContext,manifest
repo=Path(__file__).resolve().parents[2]
pin=json.loads((repo/'backend/contracts/enhancement-catalog.json').read_text())['sourceCommit']
with tempfile.TemporaryDirectory() as directory:
    temp=Path(directory)
    for name in ['catalog.js','schema.js','schema.test.js']:
        data=subprocess.check_output(['git','show',f'{pin}:frontend/src/enhancements/{name}'],cwd=repo)
        (temp/name).write_bytes(data)
    (temp/'package.json').write_text('{"type":"module"}')
    ctx=EnhancementContext(worldId='contract-test',coordinateFrame='render-y-up')
    proposals=[Enhancement(id=f'object-{i}',type=kind,assetId=asset,position=[0,0,-1]) for i,(asset,kind) in enumerate(CATALOG.items())]
    (temp/'backend.json').write_text(manifest(ctx,proposals,'ai').model_dump_json(exclude_none=True))
    (temp/'backend.test.js').write_text('''import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ASSET_CATALOG} from './catalog.js';
import {parseEnhancementsForWorld} from './schema.js';
test('backend nine-asset manifest is accepted by teammate parser',()=>{
 const payload=JSON.parse(readFileSync(new URL('./backend.json',import.meta.url)));
 const items=parseEnhancementsForWorld(payload,'contract-test');
 assert.equal(items.length,Object.keys(ASSET_CATALOG).length);
 for(const item of items)assert.equal(ASSET_CATALOG[item.assetId].type,item.type);
});
''')
    subprocess.run(['node','--test','schema.test.js','backend.test.js'],cwd=temp,check=True)
