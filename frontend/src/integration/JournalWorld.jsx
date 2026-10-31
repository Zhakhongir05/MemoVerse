import {lazy,Suspense} from 'react';
import '../ui/ViewerChrome.css';
const Viewer=lazy(()=>import('./WorldLabsViewer.jsx'));
export default function JournalWorld({world,mood,memorycastCue,previewOnly=false}){
 return <Suspense fallback={<p role="status">Opening your memory world…</p>}><Viewer key={world.id} world={world} mood={mood} memorycastCue={memorycastCue} allowEnhancementRequests={!previewOnly} embedded /></Suspense>;
}
JournalWorld.memorycastCamera=true;
