import {lazy,Suspense} from 'react';
import '../ui/ViewerChrome.css';
import {isMemoryWorld} from './savedWorld.js';
import {existingWorld} from './existingWorld.js';
const Viewer=lazy(()=>import('./WorldLabsViewer.jsx'));
export default function JournalWorld({world,mood}){
 if(!isMemoryWorld(world)&&!(world?.source==='sample'&&world.id===existingWorld.id))return <p role="alert">This memory has no saved realistic world. Return to the journal to generate one.</p>;
 return <Suspense fallback={<p role="status">Opening your memory world…</p>}><Viewer key={world.id} world={world} mood={mood} embedded /></Suspense>;
}
