import { Component, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from 'three';
import { podcastTarget } from './podcastCamera.js';
import { existingWorld } from './existingWorld.js';
import EnhancementLayer from '../enhancements/EnhancementLayer.jsx';
import { ASSET_CATALOG } from '../enhancements/catalog.js';
import { DEMO_ENHANCEMENT_RESPONSE, fitEnhancementsToBounds, parseEnhancementsForWorld, placeEnhancementsFromPhoto, spreadEnhancementsInRoom } from '../enhancements/schema.js';
import { loadFurniture } from '../enhancements/generation.js';
import { saveManifest } from '../enhancements/cache.js';

function Assets({world, wireframe, placing, onPlace, onStatus, onCollider, quality}) {
 const {gl,scene}=useThree(); const collider=useRef(null); const [loadedCollider,setLoadedCollider]=useState(null);
 useEffect(()=>{
  let active=true, mesh=null;
  onStatus('Loading world detail…');
  const spark=new SparkRenderer({renderer:gl,preBlurAmount:0,blurAmount:.3}); scene.add(spark);
  const splat=new SplatMesh({url:quality==='full'?world.fullResUrl:world.splatUrl,lod:false});
  // Marble raw OpenCV splats -> Three.js. No metric scale is supplied for this draft.
  splat.rotation.x=Math.PI; scene.add(splat);
  Promise.all([splat.initialized,new GLTFLoader().loadAsync(world.colliderUrl)]).then(([,gltf])=>{
   if(!active){gltf.scene.traverse(o=>{o.geometry?.dispose();});return;}
   mesh=gltf.scene;
   // The collider is exported in the splat's raw capture frame (same as the
   // SplatMesh above), so it needs the same π rotation to land in render space.
   mesh.traverse(o=>{if(o.isMesh){o.material=new MeshBasicMaterial({color:'#60ffb0',wireframe:true,transparent:true,opacity:0,depthWrite:false,side:DoubleSide});}});
   collider.current=mesh;setLoadedCollider({mesh,quality});onCollider?.(mesh);
   const bounds=new Box3().setFromObject(mesh);
   onStatus(`Loaded ${splat.numSplats.toLocaleString()} splats and collider. Asset units; metric scale unavailable.`);
   console.info('World Labs assets loaded', {splats:splat.numSplats,colliderBounds:bounds.min.toArray().concat(bounds.max.toArray())});
  }).catch(()=>{if(active)onStatus('World assets failed to load. Reopen this saved memory to retry; no new generation is needed.');});
  return ()=>{active=false;scene.remove(spark,splat);splat.dispose();spark.dispose();if(mesh){scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}collider.current=null;onCollider?.(null);};
 },[gl,scene,onStatus,onCollider,quality,world]);
 useEffect(()=>{collider.current?.traverse(o=>{if(o.isMesh)o.material.opacity=wireframe?.5:0;});});
 return loadedCollider?.quality===quality?<primitive object={loadedCollider.mesh} rotation={[Math.PI,0,0]} onDoubleClick={e=>{if(placing){e.stopPropagation();onPlace(e.point.toArray());}}}/>:null;
}
class Boundary extends Component {
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="alert">World viewer unavailable. Choose Primitive room.</p>:this.props.children;}
}
function CameraJourney({controls,journey,onDone,ready}) {
 const {camera}=useThree();const elapsed=useRef(0);
 useEffect(()=>{elapsed.current=0;},[journey]);
 useFrame((_,dt)=>{
  if(!journey||!ready||!controls.current)return;
  elapsed.current+=dt;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  camera.position.lerp(new Vector3(0,0,.1),reduced?1:1-Math.exp(-dt*2));
  controls.current.target.lerp(new Vector3(0,0,-2),reduced?1:1-Math.exp(-dt*2));
  controls.current.update();
  if(reduced||elapsed.current>2.8)onDone();
 });return null;
}
function PodcastFocus({controls,cue,anchors,ready}) {
 const {camera}=useThree();
 const target=podcastTarget(cue,anchors);
 useFrame((_,dt)=>{
  if(!ready||!target||!controls.current)return;
  // Rotate attention without translating through unverified room geometry.
  const point=new Vector3(...target);
  if(point.distanceTo(camera.position)<.05)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.current.target.lerp(point,reduced?1:1-Math.exp(-dt*2));
  controls.current.update();
 });return null;
}
function readEnhancements(payload, worldId = existingWorld.id) {
 try { return { enhancements: parseEnhancementsForWorld(payload, worldId), error: '' }; }
 catch (error) { console.warn('[MemoVerse] Enhancement response rejected.', error); return { enhancements: [], error: error.message }; }
}
// A model guess can land beyond the walls even after bounding-box clamping,
// because the box includes empty corners. Pull those points toward the room
// center until a downward ray meets real floor geometry.
const SETTLE_STEPS=[0.75,0.5,0.25,0];
function floorHit(mesh,[x,,z]){
 const ray=new Raycaster();ray.set(new Vector3(x,50,z),new Vector3(0,-1,0));
 return ray.intersectObject(mesh,true).length>0;
}
function settleInsideRoom(mesh,list){
 if(!mesh)return list;
 mesh.updateWorldMatrix(true,true);
 const box=new Box3().setFromObject(mesh),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
 return list.map(enhancement=>{
  const [x,,z]=enhancement.position;
  if(floorHit(mesh,enhancement.position))return enhancement;
  for(const step of SETTLE_STEPS){
   const nx=cx+(x-cx)*step,nz=cz+(z-cz)*step;
   if(floorHit(mesh,[nx,0,nz]))return {...enhancement,position:[nx,enhancement.position[1],nz]};
  }
  return enhancement;
 });
}
export default function WorldLabsViewer({ world = existingWorld, enhancementResponse = null, mood: externalMood, onMoodChange, embedded = false, imageUrl = '', scene = null, memory: savedMemory = null, enhancementOwner, savedAnchors = [], onSaveExperience, podcastCue = null, mode = 'explore' }){
 // Only the saved sample room ships a predefined furniture demo. Journal worlds use
 // their saved manifest when one exists, otherwise they propose furniture once from
 // the bound photograph and cache the result on this device.
 const showTools = !embedded || mode === 'edit';
 const persistentExperience=typeof onSaveExperience==='function';
 const response = enhancementResponse ?? (!persistentExperience && world.id === existingWorld.id ? DEMO_ENHANCEMENT_RESPONSE : null);
 const [{list:enhancements,error:enhancementError},setEnhancementState]=useState({list:[],baseline:[],error:''});
 const [enhancementStatus,setEnhancementStatus]=useState('');
 const [enhancementSource,setEnhancementSource]=useState('');
 const [cacheInfo,setCacheInfo]=useState(null);
 const [retryEnhancements,setRetryEnhancements]=useState(0);
 const [quality,setQuality]=useState('balanced');
 const [status,setStatus]=useState(world.id===existingWorld.id?'Opening saved sample…':'Opening your newly generated world…');
 const [wireframe,setWireframe]=useState(false),[placing,setPlacing]=useState(false);
 const [anchors,setAnchors]=useState(savedAnchors),[selected,setSelected]=useState(null);
 const [memory,setMemory]=useState(''),[moodSetting,setMoodSetting]=useState('nostalgic');
 // A host (the Dashboard's SenseShift radios) can drive the mood; otherwise use the local buttons.
 const mood=externalMood?externalMood.toLowerCase():moodSetting;
 const [journey,setJourney]=useState(1),[ambience,setAmbience]=useState(false),[audioError,setAudioError]=useState('');
 const [selectedEnhancement,setSelectedEnhancement]=useState(null);
 const [calibrating,setCalibrating]=useState(false),[transformMode,setTransformMode]=useState('translate');
 const [colliderMesh,setColliderMesh]=useState(null);
 const controls=useRef(null),urls=useRef(new Set()),audio=useRef(null),needsFit=useRef(false),roomRef=useRef(null),furnitureRequest=useRef(null);
 const selectedAnchor=anchors.find(a=>a.id===selected);
 const selectedEnhancementData=enhancements.find(e=>e.id===selectedEnhancement);
 const story=savedMemory?.story??scene?.description??'';
 const savedMemoryId=savedMemory?.id, savedMemoryOwner=savedMemory?.owner;
 useEffect(()=>{
  const controller=new AbortController();let active=true;furnitureRequest.current=controller;
  needsFit.current=false;
  // Loading external photo/cache/provider state invalidates the prior overlay.
  // oxlint-disable-next-line react/set-state-in-effect
  setCacheInfo(null);setEnhancementSource('');setSelectedEnhancement(null);
  setEnhancementState({list:[],baseline:[],error:''});
  setEnhancementStatus('Loading furniture…');
  async function load(){
   try{
    if(response){
     const next=readEnhancements(response, world.id);
     if(next.error)throw new Error('The supplied furniture manifest is invalid.');
     if(!active||controller.signal.aborted)return;
     setEnhancementState({list:next.enhancements,baseline:next.enhancements,error:''});
     setEnhancementSource('provided');setEnhancementStatus('Supplied placements · not newly AI-generated.');return;
    }
    // A journal world without saved placements may still propose furniture on first
    // open; device cache keeps later opens from calling the provider again.
    if(!imageUrl){setEnhancementStatus(persistentExperience?'No photograph is bound to this saved world; furniture stays empty.':'No photograph supplied; furniture stays empty.');return;}
    const result=await loadFurniture({imageUrl,story,memory:{id:savedMemoryId,owner:savedMemoryOwner},owner:enhancementOwner,worldId:world.id,signal:controller.signal});
    if(!active||controller.signal.aborted)return;
    let placements=result.list;
    if(result.source==='ai'){
     const room=roomRef.current;
     if(room)placements=settleInsideRoom(room,fitEnhancementsToBounds(placements,new Box3().setFromObject(room)));
     else needsFit.current=true;
    }
    // Provider fallbacks are not saved: the next open retries instead of caching an empty room.
    const fallback=result.payload?.source==='demo';
    setEnhancementState({list:placements,baseline:placements,error:result.warning});
    setCacheInfo(fallback?null:{identity:result.identity,payload:result.payload});
    setEnhancementSource(fallback?'':result.source);
    setEnhancementStatus(result.source==='saved'?'Saved placements restored from this device.'
     :fallback?'The furniture provider is unavailable right now; no furniture was added.'
     :!placements.length?'No furniture was proposed for this photograph; nothing was added.'
     :'AI furniture · approximate placements; review alignment.');
   }catch(error){
    if(error.name==='AbortError'||!active)return;
    setEnhancementState({list:[],baseline:[],error:error.message||'Furniture could not be loaded. Please retry.'});
    setEnhancementStatus('No generated furniture loaded.');
   }
  }
  load();
  return ()=>{active=false;controller.abort();};
 },[response,world.id,imageUrl,story,savedMemoryId,savedMemoryOwner,enhancementOwner,retryEnhancements,persistentExperience]);
 useEffect(()=>{
  if(!cacheInfo||!['ai','saved'].includes(enhancementSource)||needsFit.current)return;
  let active=true;
  saveManifest(cacheInfo.identity,{...cacheInfo.payload,enhancements}).catch(()=>{
   if(active)setEnhancementState(state=>({...state,error:'Furniture is visible but could not be saved on this device.'}));
  });
  return ()=>{active=false;};
 },[cacheInfo,enhancementSource,enhancements,colliderMesh]);
 function showSampleFurniture(){
  furnitureRequest.current?.abort();needsFit.current=false;
  const next=readEnhancements(response??DEMO_ENHANCEMENT_RESPONSE, world.id);
  setCacheInfo(null);setEnhancementSource('sample');
  setEnhancementState({list:next.enhancements,baseline:next.enhancements,error:next.error});
  setEnhancementStatus('Sample furniture · predefined for this saved World Labs room, not generated from your photograph.');
 }
 // Keep the loaded collider available to the in-flight request without making
 // the request re-run when the room finishes loading.
 useEffect(()=>{
  roomRef.current=colliderMesh;
 },[colliderMesh]);
 // Approximate AI placements may arrive before the collider finishes loading.
 // Fit them into the room once its bounds are known.
 useEffect(()=>{
  if(!colliderMesh||!needsFit.current)return;
  needsFit.current=false;
  const bounds=new Box3().setFromObject(colliderMesh);
  // Photo-relative hints win; the generic spread is only for guesses without one.
  const fitAll=list=>{
    const fitted=fitEnhancementsToBounds(list,bounds);
    const placed=placeEnhancementsFromPhoto(fitted,bounds);
    const laid=placed===fitted?spreadEnhancementsInRoom(fitted,bounds):placed;
    return settleInsideRoom(colliderMesh,laid);
  };
  setEnhancementState(state=>({...state,list:fitAll(state.list),baseline:fitAll(state.baseline)}));
 },[colliderMesh]);
 function selectEnhancement(id){setSelectedEnhancement(id);setSelected(null);}
 function updateEnhancement(id,transform){setEnhancementState(state=>({...state,list:state.list.map(e=>e.id===id?{...e,...transform,anchor:'none'}:e)}));}
 // Collider grounding lands once per world load; write it to the baseline too so
 // "Reset" returns to the grounded placement, not the floating payload guess.
 function groundEnhancement(id,y){setEnhancementState(state=>{
  const grounded=list=>list.map(e=>e.id===id?{...e,position:[e.position[0],y,e.position[2]]}:e);
  return {...state,list:grounded(state.list),baseline:grounded(state.baseline)};
 });}
 function resetEnhancements(){
  setEnhancementState(state=>({...state,list:state.baseline.map(e=>({...e,position:[...e.position],rotation:[...e.rotation],scale:[...e.scale]}))}));
 }
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));audio.current?.close();},[]);
 useEffect(()=>{
  if(audio.current){audio.current.osc.frequency.setTargetAtTime({nostalgic:130.81,joyful:164.81,melancholic:110}[mood],audio.current.currentTime,.8);}
 },[mood]);
 async function toggleAmbience(){
  try{
   if(audio.current){await audio.current.close();audio.current=null;setAmbience(false);return;}
   const context=new (window.AudioContext||window.webkitAudioContext)();
   const osc=context.createOscillator(),gain=context.createGain();
   gain.gain.value=.012;osc.type='sine';osc.frequency.value={nostalgic:130.81,joyful:164.81,melancholic:110}[mood];
   osc.connect(gain).connect(context.destination);osc.start();await context.resume();context.osc=osc;audio.current=context;setAmbience(true);setAudioError('');
  }catch{setAudioError('Audio is unavailable in this browser.');}
 }
 function place(position){
  if(selected&&placing==='move'){setAnchors(a=>a.map(x=>x.id===selected?{...x,position}:x));}
  else if(memory.trim()){const id=crypto.randomUUID();setAnchors(a=>[...a,{id,position,memory:memory.trim()}]);setSelected(id);setMemory('');}
  setPlacing(false);
 }
 function attach(event,kind){
  const file=event.target.files?.[0];if(!file||!selectedAnchor)return;
  const valid=kind==='photo'?/^image\/(jpeg|png|webp)$/.test(file.type):/^audio\/(mpeg|mp3|wav|x-wav|ogg|webm|mp4|aac)$/.test(file.type);
  if(!valid||file.size>10*1024*1024){setAudioError('Choose a supported photo or audio file up to 10 MB.');return;}
  const url=URL.createObjectURL(file);urls.current.add(url);
  const old=selectedAnchor[kind];if(old){URL.revokeObjectURL(old);urls.current.delete(old);}
  setAnchors(a=>a.map(x=>x.id===selected?{...x,[kind]:url}:x));setAudioError('');event.target.value='';
 }
 function remove(){
  for(const kind of ['photo','audio'])if(selectedAnchor?.[kind]){URL.revokeObjectURL(selectedAnchor[kind]);urls.current.delete(selectedAnchor[kind]);}
  setAnchors(a=>a.filter(x=>x.id!==selected));setSelected(null);setPlacing(false);
 }
 return <Boundary><div data-world-state={status.startsWith('Loaded') ? 'ready' : 'loading'} data-world-id={world.id} data-world-source={world.id===existingWorld.id?'sample':'generated'} className={`world-host immersive-world ${mood} ${embedded && mode !== 'edit'?'mv-clean-viewer':''}`}>
  <Canvas camera={{position:[.25,.1,.45],fov:70,near:.01,far:500}} dpr={[1,1.5]} gl={{antialias:false,powerPreference:'high-performance'}}>
   <color attach="background" args={['#17171b']}/>
   <Assets world={world} quality={quality} wireframe={wireframe} placing={placing} onPlace={place} onStatus={setStatus} onCollider={setColliderMesh}/>
   <EnhancementLayer enhancements={enhancements} collider={colliderMesh} mood={mood} selectedId={selectedEnhancement} calibrating={calibrating} transformMode={transformMode} onSelect={selectEnhancement} onTransform={updateEnhancement} onGround={groundEnhancement}/>
   {anchors.map(a=><mesh key={a.id} renderOrder={10000} position={a.position} onClick={e=>{e.stopPropagation();setSelected(a.id);setSelectedEnhancement(null);}}><sphereGeometry args={[.025,16,16]}/><meshBasicMaterial color={(selected===a.id||podcastCue?.anchor_id===a.id)?'#fff0b6':'#dfad62'} transparent depthTest={false} depthWrite={false}/></mesh>)}
   <OrbitControls ref={controls} makeDefault target={[0,0,-2]} enableDamping dampingFactor={.07} minDistance={.08} maxDistance={8} zoomSpeed={.5} panSpeed={.55} rotateSpeed={.4} onStart={()=>setJourney(0)}/>
   <PodcastFocus controls={controls} cue={podcastCue} anchors={anchors} ready={status.startsWith('Loaded')}/>
   <CameraJourney controls={controls} journey={podcastCue?0:journey} ready={status.startsWith('Loaded')} onDone={()=>setJourney(0)}/>
  </Canvas>
  {embedded&&!status.startsWith('Loaded')&&<p role={status.includes('failed')?'alert':'status'} style={{position:'absolute',bottom:'1rem',left:'1rem',zIndex:3,background:'#17171bcc',padding:'.6rem 1rem',borderRadius:'.5rem'}}>{status}</p>}
  <div className="atmosphere-wash" aria-hidden="true"/>
  {showTools && <div className="sense-controls" aria-label="SenseShift atmosphere">
   {['nostalgic','joyful','melancholic'].map(value=><button key={value} aria-pressed={mood===value} onClick={()=>onMoodChange?onMoodChange(value):setMoodSetting(value)}>{value}</button>)}
   <button aria-pressed={quality==='full'} onClick={()=>setQuality(q=>q==='full'?'balanced':'full')}>{quality==='full'?'Full detail · switch to smooth':'Smooth · load full detail'}</button>
   <button onClick={()=>setJourney(n=>n+1)}>Return to memory</button>
   <button aria-pressed={ambience} onClick={toggleAmbience}>{ambience?'Mute ambience':'Play gentle ambience'}</button>
  </div>}
  {showTools && <section className="enhancement-panel" aria-label="Enhanced objects">
   <header><div><p className="enhancement-eyebrow">HIGH-DETAIL OVERLAY</p><h2>Enhanced objects</h2></div>
    <button aria-pressed={calibrating} onClick={()=>setCalibrating(value=>!value)}>{calibrating?'Done':'Calibrate'}</button></header>
   <p role="status">{enhancementStatus}</p>
   {enhancementError&&<p role="alert" className="enhancement-error">{enhancementError}</p>}
   <button onClick={()=>setRetryEnhancements(value=>value+1)}>Retry furniture</button>
   {world.id===existingWorld.id&&<button onClick={showSampleFurniture}>Show sample furniture</button>}
   {onSaveExperience&&<button onClick={()=>onSaveExperience({enhancements:{worldId:world.id,scaleStatus:'uncalibrated',unitsPerMeter:null,enhancements:enhancements.map(e=>({...e,anchor:'none'})),source:'user',fallback:false,requiresReview:true},anchors:anchors.map(({id,position,memory})=>({id,position,memory}))})}>Save placements and stories to account</button>}
   {calibrating&&<div className="enhancement-modes" role="group" aria-label="Transform tool">
    {[['translate','Move'],['rotate','Rotate'],['scale','Scale']].map(([mode,label])=><button key={mode} aria-pressed={transformMode===mode} onClick={()=>setTransformMode(mode)}>{label}</button>)}
    <button onClick={resetEnhancements}>Reset</button>
   </div>}
   {enhancements.length>0&&<div className="enhancement-list">{enhancements.map(e=><button key={e.id} aria-pressed={selectedEnhancement===e.id} onClick={()=>selectEnhancement(e.id)}>
    <span>{ASSET_CATALOG[e.assetId]?.label||e.type}</span><small>{e.memory||'No memory yet'}</small>
   </button>)}</div>}
   {selectedEnhancementData?<article className="enhancement-story" aria-label="Enhanced object memory">
    <h3>{ASSET_CATALOG[selectedEnhancementData.assetId]?.label||selectedEnhancementData.type}</h3>
    <p>{selectedEnhancementData.memory||'No memory attached to this object yet.'}</p>
    <p className="enhancement-meta">Placement {selectedEnhancementData.confidence.replace(/-/g,' ')}</p>
    {calibrating&&<p className="enhancement-hint">Drag the gizmo to move, rotate or scale. Changes are saved on this device when storage is available; cloud sync is not connected.</p>}
    <button onClick={()=>setSelectedEnhancement(null)}>Close</button>
   </article>:<p className="enhancement-hint">Click an object in the room to read its story.</p>}
  </section>}
  {showTools && <details className="world-tools" open><summary>Memory journal · {anchors.length} anchors</summary><p role="status">{status}</p>
   <label>New memory<textarea value={memory} maxLength={2000} rows={2} placeholder="Write a real memory, then place it in the room…" onChange={e=>setMemory(e.target.value)}/></label>
   <button disabled={!memory.trim()&&!placing} onClick={()=>setPlacing(placing?false:'new')}>{placing?'Cancel placement':'Place memory'}</button>
   {placing&&<p>Double-click a surface to {placing==='move'?'move this memory':'place your memory'}.</p>}
   {anchors.length>0&&<div className="anchor-list">{anchors.map((a,i)=><button key={a.id} aria-pressed={selected===a.id} onClick={()=>setSelected(a.id)}>Memory {i+1}</button>)}</div>}
   {selectedAnchor&&<section aria-label="Anchor memory"><h3>Your memory</h3><textarea aria-label="Edit memory story" rows={2} maxLength={2000} value={selectedAnchor.memory} onChange={e=>setAnchors(a=>a.map(x=>x.id===selected?{...x,memory:e.target.value}:x))}/>
    {selectedAnchor.photo&&<img alt="Attached memory photograph" src={selectedAnchor.photo}/>}
    {selectedAnchor.audio&&<audio controls src={selectedAnchor.audio}/>}
    <label>Attach photograph<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>attach(e,'photo')}/></label>
    <button onClick={()=>setPlacing('move')}>Move selected memory</button><button onClick={remove}>Remove selected memory</button>
   </section>}
   {audioError&&<p role="alert">{audioError}</p>}
   <label><input type="checkbox" checked={wireframe} onChange={e=>setWireframe(e.target.checked)}/> Show collider alignment</label>
   <p className="local-note">Save placements and anchor stories with the account save button. New photo/audio anchor attachments stay in this tab. Saved worlds reopen without AI generation.</p>
  </details>}
 </div></Boundary>;
}
