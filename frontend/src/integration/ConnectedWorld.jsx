import { lazy, Suspense, useState } from 'react';
const MemoryWorld=lazy(()=>import('./MemoryWorld.jsx'));
import './connectedWorld.css';
const PhotoDepthScene=lazy(()=>import('../photoDepth/PhotoDepthScene.jsx'));
const Diorama=lazy(()=>import('../diorama/Scene.jsx'));
const WorldLabsViewer=lazy(()=>import('./WorldLabsViewer.jsx'));
export default function ConnectedWorld({scene,mood='Nostalgic',worldMode='symbolic',generatedWorld,onMoodChange,imageUrl,memory=null,enhancementOwner}){
 const [selected,setSelected]=useState(null),[preview,setPreview]=useState('symbolic');
 const object=scene?.objects?.find(o=>o.id===selected);
 const displayScene=scene?{...scene,mood:mood.toLowerCase()}:null;
 return <div className="mv-connected-world">
  {worldMode!=='symbolic'?<Suspense fallback={<p role="status">{worldMode==='generated'?'Loading your newly generated world…':'Loading saved World Labs sample…'}</p>}><WorldLabsViewer key={worldMode==='generated'?generatedWorld?.id:'sample'} world={worldMode==='generated'?generatedWorld:undefined} imageUrl={imageUrl} scene={scene} memory={memory} enhancementOwner={enhancementOwner} mood={mood.toLowerCase()} onMoodChange={onMoodChange}/></Suspense>:<>
   <div className="mv-mode-picker" aria-label="Symbolic preview type">{[['symbolic','Symbolic objects'],['diorama','Grounded diorama'],['photo','Photo depth · not reconstruction']].map(([value,label])=><button key={value} onClick={()=>setPreview(value)} aria-pressed={preview===value}>{label}</button>)}</div>
   <Suspense fallback={<p role="status">Loading preview…</p>}>{preview==='photo'?<PhotoDepthScene imageUrl={imageUrl} scene={scene} mood={mood} description={scene?.title}/>:preview==='diorama'?<Diorama scene={scene || undefined}/>:<MemoryWorld scene={displayScene} onSelect={setSelected}/>}</Suspense>
   {scene&&<aside className="mv-object-journal" aria-label="Scene memories"><p>Explore your memory objects</p><div>{scene.objects.map(o=><button key={o.id} aria-pressed={selected===o.id} onClick={()=>setSelected(o.id)}>{o.type}</button>)}</div>{object&&<section aria-label="Selected object memory"><strong>{object.type}</strong><p>{object.memory||'No story was provided for this object.'}</p></section>}</aside>}
  </>}
 </div>;
}
