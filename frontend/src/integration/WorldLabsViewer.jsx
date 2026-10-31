import { Component, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from 'three';
import { existingWorld } from './existingWorld.js';
import EnhancementLayer from '../enhancements/EnhancementLayer.jsx';
import { ASSET_CATALOG } from '../enhancements/catalog.js';
import { DEMO_ENHANCEMENT_RESPONSE, fitEnhancementsToBounds, parseEnhancementsForWorld } from '../enhancements/schema.js';
import { requestEnhancements, toProposal } from '../enhancements/api.js';
import MemoryCastCamera from './MemoryCastCamera.jsx';

function Assets({wireframe, placing, onPlace, onStatus, onCollider, quality, world}) {
 const {gl,scene}=useThree(); const collider=useRef(null); const [loadedCollider,setLoadedCollider]=useState(null);
 useEffect(()=>{
  let active=true, mesh=null;
  onStatus('Loading saved world detail…');
  const spark=new SparkRenderer({renderer:gl,preBlurAmount:0,blurAmount:.3}); scene.add(spark);
  const splat=new SplatMesh({url:quality==='full'?world.fullResUrl:world.splatUrl,lod:false});
  // Marble raw OpenCV splats -> Three.js. No metric scale is supplied for this draft.
  splat.rotation.x=Math.PI; scene.add(splat);
  Promise.all([splat.initialized,new GLTFLoader().loadAsync(world.colliderUrl)]).then(([,gltf])=>{
   if(!active){gltf.scene.traverse(o=>{o.geometry?.dispose();});return;}
   mesh=gltf.scene;
   // glTF collider is Y-up already; only raw splats need capture-frame rotation.
   mesh.traverse(o=>{if(o.isMesh){o.material=new MeshBasicMaterial({color:'#60ffb0',wireframe:true,transparent:true,opacity:0,depthWrite:false,side:DoubleSide});}});
   collider.current=mesh;setLoadedCollider({mesh,quality});onCollider?.(mesh);
   const bounds=new Box3().setFromObject(mesh);
   onStatus(`Loaded ${splat.numSplats.toLocaleString()} splats and collider. Asset units; metric scale unavailable.`);
   console.info('World Labs assets loaded', {splats:splat.numSplats,colliderBounds:bounds.min.toArray().concat(bounds.max.toArray())});
  }).catch(()=>{if(active)onStatus('World assets failed to load. Switch to the primitive room to continue.');});
  return ()=>{active=false;scene.remove(spark,splat);splat.dispose();spark.dispose();if(mesh){scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}collider.current=null;onCollider?.(null);};
 },[gl,scene,onStatus,onCollider,quality,world]);
 useEffect(()=>{collider.current?.traverse(o=>{if(o.isMesh)o.material.opacity=wireframe?.5:0;});});
 return loadedCollider?.quality===quality?<primitive object={loadedCollider.mesh} onDoubleClick={e=>{if(placing){e.stopPropagation();onPlace(e.point.toArray());}}}/>:null;
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
function readEnhancements(payload,worldId) {
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
export default function WorldLabsViewer({world=existingWorld,enhancementResponse,mood:externalMood,onMoodChange,embedded=false,imageUrl='',scene=null,memorycastCue}){
 const response=enhancementResponse??(world.id===existingWorld.id?DEMO_ENHANCEMENT_RESPONSE:null);
 const [{list:enhancements,error:enhancementError},setEnhancementState]=useState(()=>{
  const initial=(response?readEnhancements(response,world.id):{enhancements:[],error:''});
  return {list:initial.enhancements,baseline:initial.enhancements,error:initial.error};
 });
 const [quality,setQuality]=useState(()=>window.matchMedia('(pointer: fine)').matches?'full':'balanced');
 const [status,setStatus]=useState(world.id===existingWorld.id?'Opening saved sample…':'Opening your newly generated world…');
 const [wireframe,setWireframe]=useState(false),[placing,setPlacing]=useState(false);
 const [anchors,setAnchors]=useState([]),[selected,setSelected]=useState(null);
 const activeAnchorId=anchors.some(item=>item.id===memorycastCue?.anchor_id)?memorycastCue.anchor_id:selected;
 const [memory,setMemory]=useState(''),[moodSetting,setMoodSetting]=useState('nostalgic');
 // A host (the Dashboard's SenseShift radios) can drive the mood; otherwise use the local buttons.
 const requestedMood=externalMood?externalMood.toLowerCase():moodSetting;
 const mood=['nostalgic','joyful','melancholic'].includes(requestedMood)?requestedMood:'nostalgic';
 const [journey,setJourney]=useState(1),[ambience,setAmbience]=useState(false),[audioError,setAudioError]=useState('');
 const [selectedEnhancement,setSelectedEnhancement]=useState(null);
 const [calibrating,setCalibrating]=useState(false),[transformMode,setTransformMode]=useState('translate');
 const [colliderMesh,setColliderMesh]=useState(null);
 const controls=useRef(null),urls=useRef(new Set()),audio=useRef(null),needsFit=useRef(false),roomRef=useRef(null);
 const selectedAnchor=anchors.find(a=>a.id===activeAnchorId);
 const selectedEnhancementData=enhancements.find(e=>e.id===selectedEnhancement);
 useEffect(()=>{
  const next=(response?readEnhancements(response,world.id):{enhancements:[],error:''});
  // oxlint-disable-next-line react/set-state-in-effect
  setEnhancementState({list:next.enhancements,baseline:next.enhancements,error:next.error});
  setSelectedEnhancement(null);
 },[response,world.id]);
 // Ask the backend for placements of the mounted world. With an uploaded photo
 // it runs the AI path (objects + locations from the image); without one it
 // reissues the current placements as user proposals. Demo objects render
 // immediately and are replaced only by a validated manifest, so a slow or
 // missing backend never empties the room.
 const story=scene?.description??'';
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  async function load(){
   const demo=(response?readEnhancements(response,world.id):{enhancements:[],error:''}).enhancements;
   let photo=null;
   if(imageUrl){
    try{
     const source=await fetch(imageUrl,{signal:controller.signal});
     if(!source.ok)throw new Error(`photo read failed (${source.status})`);
     const blob=await source.blob();
     photo=new File([blob],'memory-photo',{type:blob.type||'image/jpeg'});
    }catch(error){
     if(error.name==='AbortError'||!active)return;
     console.info('[MemoVerse] Uploaded photo could not be read; keeping current objects.',error.message);
     return;
    }
   }
   if(!photo&&!demo.length)return;
   try{
    const payload=await requestEnhancements({
     worldId:world.id,
     story,
     proposals:photo?[]:demo.map(toProposal),
     photo,
    },{signal:controller.signal});
    if(!active)return;
    const next=readEnhancements(payload,world.id);
    if(next.error||next.enhancements.length===0){
     console.info('[MemoVerse] Backend sent no usable placements; keeping current objects.',next.error||`source=${payload.source} fallback=${payload.fallback}`);
     return;
    }
    let placements=next.enhancements;
    if(payload.source==='ai'){
     const room=roomRef.current;
     if(room)placements=settleInsideRoom(room,fitEnhancementsToBounds(placements,new Box3().setFromObject(room)));
     else needsFit.current=true;
    }
    console.info(`[MemoVerse] Loaded ${placements.length} placements (source=${payload.source}, fallback=${payload.fallback}).`);
    setEnhancementState({list:placements,baseline:placements,error:''});
    setSelectedEnhancement(null);
   }catch(error){
    if(error.name==='AbortError'||!active)return;
    console.info('[MemoVerse] Enhancement backend unavailable; keeping current objects.',error.message);
   }
  }
  load();
  return ()=>{active=false;controller.abort();};
 },[response,world.id,imageUrl,story]);
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
  const fitAll=list=>settleInsideRoom(colliderMesh,fitEnhancementsToBounds(list,bounds));
  setEnhancementState(state=>({...state,list:fitAll(state.list),baseline:fitAll(state.baseline)}));
 },[colliderMesh]);
 function selectEnhancement(id){setSelectedEnhancement(id);setSelected(null);}
 function updateEnhancement(id,transform){setEnhancementState(state=>({...state,list:state.list.map(e=>e.id===id?{...e,...transform}:e)}));}
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
 return <Boundary><div className={`world-host immersive-world ${mood} ${embedded?'mv-clean-viewer':''}`}>
  <Canvas camera={{position:[.25,.1,.45],fov:70,near:.01,far:500}} dpr={[1,1.5]} gl={{antialias:false,powerPreference:'high-performance'}}>
   <color attach="background" args={['#17171b']}/>
   <Assets world={world} quality={quality} wireframe={wireframe} placing={placing} onPlace={place} onStatus={setStatus} onCollider={setColliderMesh}/>
   <EnhancementLayer enhancements={enhancements} collider={colliderMesh} mood={mood} selectedId={selectedEnhancement} calibrating={calibrating} transformMode={transformMode} onSelect={selectEnhancement} onTransform={updateEnhancement} onGround={groundEnhancement}/>
   {anchors.map(a=><mesh key={a.id} renderOrder={10000} position={a.position} onClick={e=>{e.stopPropagation();setSelected(a.id);setSelectedEnhancement(null);}}><sphereGeometry args={[.025,16,16]}/><meshBasicMaterial color={activeAnchorId===a.id?'#fff0b6':'#dfad62'} transparent depthTest={false} depthWrite={false}/></mesh>)}
   <OrbitControls ref={controls} makeDefault target={[0,0,-2]} enableDamping dampingFactor={.07} minDistance={.08} maxDistance={8} zoomSpeed={.5} panSpeed={.55} rotateSpeed={.4} onStart={()=>{setJourney(0);memorycastCue?.onCancel?.();}}/>
   <CameraJourney controls={controls} journey={memorycastCue?0:journey} ready={status.startsWith('Loaded')} onDone={()=>setJourney(0)}/>
   <MemoryCastCamera cue={memorycastCue} controls={controls} ready={status.startsWith('Loaded')} stopDefaultJourney={setJourney}/>
  </Canvas>
  <div className="atmosphere-wash" aria-hidden="true"/>
  <div className="sense-controls" aria-label="SenseShift atmosphere">
   {['nostalgic','joyful','melancholic'].map(value=><button key={value} aria-pressed={mood===value} onClick={()=>onMoodChange?onMoodChange(value):setMoodSetting(value)}>{value}</button>)}
   <button aria-pressed={quality==='full'} onClick={()=>setQuality(q=>q==='full'?'balanced':'full')}>{quality==='full'?'Full detail · switch to smooth':'Smooth · load full detail'}</button>
   <button onClick={()=>setJourney(n=>n+1)}>Return to memory</button>
   <button aria-pressed={ambience} onClick={toggleAmbience}>{ambience?'Mute ambience':'Play gentle ambience'}</button>
  </div>
  {(enhancements.length>0||enhancementError)&&<section className="enhancement-panel" aria-label="Enhanced objects">
   <header><div><p className="enhancement-eyebrow">HIGH-DETAIL OVERLAY</p><h2>Enhanced objects</h2></div>
    <button aria-pressed={calibrating} onClick={()=>setCalibrating(value=>!value)}>{calibrating?'Done':'Calibrate'}</button></header>
   {enhancementError&&<p role="alert" className="enhancement-error">{enhancementError}</p>}
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
    {calibrating&&<p className="enhancement-hint">Drag the gizmo to move, rotate or scale. Changes stay in this tab.</p>}
    <button onClick={()=>setSelectedEnhancement(null)}>Close</button>
   </article>:<p className="enhancement-hint">Click an object in the room to read its story.</p>}
  </section>}
  <details className="world-tools" open><summary>Memory journal · {anchors.length} anchors</summary><p role="status">{status}</p>
   <label>New memory<textarea value={memory} maxLength={2000} rows={2} placeholder="Write a real memory, then place it in the room…" onChange={e=>setMemory(e.target.value)}/></label>
   <button disabled={!memory.trim()&&!placing} onClick={()=>setPlacing(placing?false:'new')}>{placing?'Cancel placement':'Place memory'}</button>
   {placing&&<p>Double-click a surface to {placing==='move'?'move this memory':'place your memory'}.</p>}
   {anchors.length>0&&<div className="anchor-list">{anchors.map((a,i)=><button key={a.id} aria-pressed={selected===a.id} onClick={()=>setSelected(a.id)}>Memory {i+1}</button>)}</div>}
   {selectedAnchor&&<section aria-label="Anchor memory"><h3>Your memory</h3><textarea aria-label="Edit memory story" rows={2} maxLength={2000} value={selectedAnchor.memory} onChange={e=>setAnchors(a=>a.map(x=>x.id===selected?{...x,memory:e.target.value}:x))}/>
    {selectedAnchor.photo&&<img alt="Attached memory photograph" src={selectedAnchor.photo}/>}
    {selectedAnchor.audio&&<audio controls src={selectedAnchor.audio}/>}
    <label>Attach photograph<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>attach(e,'photo')}/></label>
    <label>Attach voice recording<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/aac" onChange={e=>attach(e,'audio')}/></label>
    <button onClick={()=>setPlacing('move')}>Move selected memory</button><button onClick={remove}>Remove selected memory</button>
   </section>}
   {audioError&&<p role="alert">{audioError}</p>}
   <label><input type="checkbox" checked={wireframe} onChange={e=>setWireframe(e.target.checked)}/> Show collider alignment</label>
   <p className="local-note">Attachments stay in this tab. Reloading or switching modes clears the journal. No uploads or API calls here.</p>
  </details>
 </div></Boundary>;
}
