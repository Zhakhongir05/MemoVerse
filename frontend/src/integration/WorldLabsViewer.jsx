import { Component, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, MeshBasicMaterial, DoubleSide, Vector3 } from 'three';
import { existingWorld } from './existingWorld.js';

function Assets({wireframe, placing, onPlace, onStatus,quality}) {
 const {gl,scene}=useThree(); const collider=useRef(null); const [loadedCollider,setLoadedCollider]=useState(null);
 useEffect(()=>{
  let active=true, mesh=null;
  onStatus('Loading saved world detail…');
  const spark=new SparkRenderer({renderer:gl,preBlurAmount:0,blurAmount:.3}); scene.add(spark);
  const splat=new SplatMesh({url:quality==='full'?existingWorld.fullResUrl:existingWorld.splatUrl,lod:false});
  // Marble raw OpenCV splats -> Three.js. No metric scale is supplied for this draft.
  splat.rotation.x=Math.PI; scene.add(splat);
  Promise.all([splat.initialized,new GLTFLoader().loadAsync(existingWorld.colliderUrl)]).then(([,gltf])=>{
   if(!active){gltf.scene.traverse(o=>{o.geometry?.dispose();});return;}
   mesh=gltf.scene;
   // Collider GLB is already in glTF's Y-up convention; do not rotate it twice.
   mesh.traverse(o=>{if(o.isMesh){o.material=new MeshBasicMaterial({color:'#60ffb0',wireframe:true,transparent:true,opacity:0,depthWrite:false,side:DoubleSide});}});
   collider.current=mesh;setLoadedCollider({mesh,quality});
   const bounds=new Box3().setFromObject(mesh);
   onStatus(`Loaded ${splat.numSplats.toLocaleString()} splats and collider. Asset units; metric scale unavailable.`);
   console.info('World Labs assets loaded', {splats:splat.numSplats,colliderBounds:bounds.min.toArray().concat(bounds.max.toArray())});
  }).catch(()=>{if(active)onStatus('World assets failed to load. Switch to the primitive room to continue.');});
  return ()=>{active=false;scene.remove(spark,splat);splat.dispose();spark.dispose();if(mesh){scene.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}collider.current=null;};
 },[gl,scene,onStatus,quality]);
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
export default function WorldLabsViewer(){
 const [quality,setQuality]=useState(()=>window.matchMedia('(pointer: fine)').matches?'full':'balanced');
 const [status,setStatus]=useState('Opening your saved memory world…');
 const [wireframe,setWireframe]=useState(false),[placing,setPlacing]=useState(false);
 const [anchors,setAnchors]=useState([]),[selected,setSelected]=useState(null);
 const [memory,setMemory]=useState(''),[mood,setMood]=useState('nostalgic');
 const [journey,setJourney]=useState(1),[ambience,setAmbience]=useState(false),[audioError,setAudioError]=useState('');
 const controls=useRef(null),urls=useRef(new Set()),audio=useRef(null);
 const selectedAnchor=anchors.find(a=>a.id===selected);
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
 return <Boundary><div className={`world-host immersive-world ${mood}`}>
  <Canvas camera={{position:[.25,.1,.45],fov:70,near:.01,far:500}} dpr={[1,2]} gl={{antialias:false}}>
   <color attach="background" args={['#17171b']}/>
   <Assets quality={quality} wireframe={wireframe} placing={placing} onPlace={place} onStatus={setStatus}/>
   {anchors.map(a=><mesh key={a.id} renderOrder={10000} position={a.position} onClick={e=>{e.stopPropagation();setSelected(a.id);}}><sphereGeometry args={[.025,16,16]}/><meshBasicMaterial color={selected===a.id?'#fff0b6':'#dfad62'} transparent depthTest={false} depthWrite={false}/></mesh>)}
   <OrbitControls ref={controls} makeDefault target={[0,0,-2]} enableDamping dampingFactor={.07} minDistance={.08} maxDistance={8} zoomSpeed={.5} panSpeed={.55} rotateSpeed={.4} onStart={()=>setJourney(0)}/>
   <CameraJourney controls={controls} journey={journey} ready={status.startsWith('Loaded')} onDone={()=>setJourney(0)}/>
  </Canvas>
  <div className="atmosphere-wash" aria-hidden="true"/>
  <div className="sense-controls" aria-label="SenseShift atmosphere">
   {['nostalgic','joyful','melancholic'].map(value=><button key={value} aria-pressed={mood===value} onClick={()=>setMood(value)}>{value}</button>)}
   <button aria-pressed={quality==='full'} onClick={()=>setQuality(q=>q==='full'?'balanced':'full')}>{quality==='full'?'Full detail · switch to smooth':'Smooth · load full detail'}</button>
   <button onClick={()=>setJourney(n=>n+1)}>Return to memory</button>
   <button aria-pressed={ambience} onClick={toggleAmbience}>{ambience?'Mute ambience':'Play gentle ambience'}</button>
  </div>
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
