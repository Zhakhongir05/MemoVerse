import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { generateScene } from './generateScene.js';
import { sceneStatus } from './sceneResponse.js';
import MemoryWorld from './MemoryWorld.jsx';
import './studio.css';
const WorldLabsViewer=lazy(()=>import('./WorldLabsViewer.jsx'));
export default function MemoryStudio(){
 const [worldMode,setWorldMode]=useState('worldlabs');
 const [story,setStory]=useState('I remember reading quietly beside the window on a sunny afternoon.');
 const [photo,setPhoto]=useState(null),[result,setResult]=useState(null),[selected,setSelected]=useState(null);
 const [status,setStatus]=useState({state:'idle',message:'Add a photo and a memory to begin.'});
 const [generation,setGeneration]=useState(0);const request=useRef(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const loading=status.state==='loading';
 async function submit(event){
  event.preventDefault();request.current?.abort();const controller=new AbortController();request.current=controller;
  try{
   const next=await generateScene({story,photo,signal:controller.signal,onStatus:setStatus});
   if(controller.signal.aborted)return;
   setResult(next);setSelected(null);setGeneration(n=>n+1);
  }catch(error){if(!controller.signal.aborted)setStatus({state:'error',message:error.message});}
 }
 const scene=result?.scene;const object=scene?.objects.find(o=>o.id===selected);
 return <main className={`memory-studio ${worldMode==='worldlabs'?'saved-mode':''}`}>
  <header><span className="brand">MemoVerse <small>감각</small></span><span>KU iNThon · Memory studio</span></header>
  <section className="studio-intro"><h1>Step into a memory.</h1><p>Enter a saved memory world. Leave a story where it belongs.</p></section>
  <div className="studio-layout">
   <aside className="memory-editor"><h2>Photo & story planning</h2><p className="hint">The saved bedroom is an existing World Labs generation. New photographs create symbolic scene plans only; spatial generation is disabled.</p><form onSubmit={submit}>
    <label htmlFor="memory-photo">Photograph</label><input id="memory-photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={loading} onChange={e=>setPhoto(e.target.files?.[0]??null)}/>
    <p className="hint">JPEG, PNG or WebP · up to 5 MB. Live mode sends the photo to OpenAI and your story plus photo observations to the scene planner.</p>
    <label htmlFor="memory-story">Memory description</label><textarea id="memory-story" value={story} onChange={e=>setStory(e.target.value)} required maxLength={2000} rows={6} disabled={loading}/>
    <button className="primary" type="submit" disabled={loading}>{loading?'Planning symbolic scene…':'Plan symbolic scene'}</button>
    {loading&&<button type="button" onClick={()=>{request.current?.abort();setStatus({state:'idle',message:'Generation cancelled. Your previous world is unchanged.'});}}>Cancel generation</button>}
   </form>
   <p className={status.state==='error'?'status error':'status'} role={status.state==='error'?'alert':'status'} aria-live="polite">{status.message}</p>
   {result&&<p className={`source-badge ${result.source}`} data-testid="scene-source">{sceneStatus(result)}</p>}
   <section className="memory-details" aria-live="polite" aria-label="Selected memory"><h2>{object?`${object.type} memory`:'A story in every object'}</h2><p>{object?(object.memory||'No memory description was provided for this object.'):'Select an object to read its associated memory.'}</p></section>
   {scene&&<section aria-label="Memory objects"><h2>Explore the objects</h2><p className="hint">Click an object in the world, or choose one here.</p><div className="object-list">{scene.objects.map(o=><button type="button" aria-pressed={selected===o.id} key={o.id} onClick={()=>setSelected(o.id)}>{o.type} <small>{o.id}</small></button>)}</div></section>}
   <p className="hint">Symbolic scene planning, not photo-to-3D reconstruction.</p>
   </aside>
   <section className="world-panel" aria-label="Interactive memory world"><div className="world-title"><h2>{worldMode==='worldlabs'?'Bedroom · World Labs draft':scene?.title||'Your memory world'}</h2><span>{worldMode==='worldlabs'?'Existing generated world · no new generation':scene?`${scene.environment} · ${scene.mood}`:'Awaiting your photograph'}</span></div>
    <div className="world-mode"><button aria-pressed={worldMode==='primitive'} onClick={()=>setWorldMode('primitive')}>Symbolic fallback</button><button aria-pressed={worldMode==='worldlabs'} onClick={()=>setWorldMode('worldlabs')}>Saved 3D memory</button></div>{worldMode==='worldlabs'?<Suspense fallback={<p role="status">Loading world viewer…</p>}><WorldLabsViewer/></Suspense>:<MemoryWorld scene={scene} onSelect={setSelected} generation={generation}/>}<p className="world-help">{worldMode==='worldlabs'?'Drag to orbit · right-drag to pan · scroll to zoom · click golden memory anchors':'Drag to orbit · scroll to zoom · click objects to read memories'}</p>
   </section>
  </div>
 </main>;
}
