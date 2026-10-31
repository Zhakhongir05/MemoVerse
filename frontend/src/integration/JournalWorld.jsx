import {lazy,Suspense} from 'react';
import '../ui/ViewerChrome.css';
const Viewer=lazy(()=>import('./WorldLabsViewer.jsx'));
export default function JournalWorld({world,mood}){
 return <Suspense fallback={<p role="status">Opening your memory world…</p>}><Viewer key={world.id} world={world} mood={mood} embedded /></Suspense>;
}
