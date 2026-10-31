import { Component } from 'react';
import { fitSceneToRoom } from './roomLayout.js';
import Scene from '../3d_world/Scene';

const palettes = {
  nostalgic: {background:'#ded2c0',wood:'#a77950',fabric:'#cfb194',light:'#ffe4b7'},
  joyful: {background:'#dce9df',wood:'#bc9060',fabric:'#80baa7',light:'#fff3cb'},
  melancholic: {background:'#a9b6c8',wood:'#736f7c',fabric:'#8697b5',light:'#d9e3ff'},
};
function Box({position, size, color}) {
 return <mesh position={position}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.85}/></mesh>;
}
// Small integration catalog; all geometry is application code, never model-generated.
function Asset({type,p}) {
 switch(type) {
  case 'desk':return <><Box position={[0,.82,0]} size={[1.8,.12,.9]} color={p.wood}/>{[-.7,.7].flatMap(x=>[-.3,.3].map(z=><Box key={`${x}-${z}`} position={[x,.4,z]} size={[.12,.8,.12]} color={p.wood}/>))}</>;
  case 'bed':return <><Box position={[0,.2,0]} size={[1.7,.4,2.4]} color={p.wood}/><Box position={[0,.5,0]} size={[1.6,.25,2.3]} color={p.fabric}/><Box position={[0,.7,-.82]} size={[1.35,.15,.5]} color="#faf3e8"/><Box position={[0,.7,-1.15]} size={[1.75,1.1,.12]} color={p.wood}/></>;
  case 'chair':return <><Box position={[0,.48,0]} size={[.65,.12,.65]} color={p.wood}/><Box position={[0,.88,-.28]} size={[.65,.7,.1]} color={p.wood}/>{[-.23,.23].flatMap(x=>[-.23,.23].map(z=><Box key={`${x}-${z}`} position={[x,.23,z]} size={[.08,.46,.08]} color={p.wood}/>))}</>;
  case 'window':return <><Box position={[0,0,0]} size={[1.6,1.7,.12]} color={p.wood}/><Box position={[0,0,.08]} size={[1.4,1.5,.04]} color="#a7d5e2"/><Box position={[0,0,.12]} size={[.07,1.5,.05]} color="#f4ebdc"/><Box position={[0,0,.12]} size={[1.4,.07,.05]} color="#f4ebdc"/></>;
  case 'bookshelf':return <><Box position={[-.7,1,0]} size={[.12,2,.45]} color={p.wood}/><Box position={[.7,1,0]} size={[.12,2,.45]} color={p.wood}/>{[.08,.7,1.35,1.95].map(y=><Box key={y} position={[0,y,0]} size={[1.4,.1,.45]} color={p.wood}/>)}{[0,1,2,3,4].map(i=><Box key={i} position={[-.5+i*.22,1.03,0]} size={[.16,.5,.32]} color={['#8f9b7d','#b98570','#829ab3'][i%3]}/>)}</>;
  case 'lamp':return <><mesh position={[0,.08,0]}><cylinderGeometry args={[.28,.32,.12,16]}/><meshStandardMaterial color={p.wood}/></mesh><mesh position={[0,.65,0]}><cylinderGeometry args={[.04,.04,1.1,12]}/><meshStandardMaterial color={p.wood}/></mesh><mesh position={[0,1.25,0]}><coneGeometry args={[.42,.55,16]}/><meshStandardMaterial color={p.light} emissive={p.light} emissiveIntensity={.25}/></mesh></>;
  case 'photo-frame':return <><Box position={[0,0,0]} size={[.95,.75,.1]} color={p.wood}/><Box position={[0,0,.065]} size={[.8,.6,.03]} color={p.fabric}/></>;
  default:return null;
 }
}
class WorldBoundary extends Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="alert">The 3D view is unavailable. Select an object from the list to read its memory.</p>:this.props.children;}
}
export default function MemoryWorld({scene,onSelect,generation=0}) {
 const p=palettes[scene?.mood] || palettes.nostalgic;
 const layout=scene?fitSceneToRoom(scene):null;
 return <WorldBoundary key={generation}><div className="world-host"><Scene>
  {scene ? <>
   <group position={layout.offset} scale={layout.scale} key={generation}>
    {scene.objects.map(object=><group key={object.id} name={object.id} position={object.position} scale={object.scale} onClick={event=>{event.stopPropagation();onSelect(object.id);}}>
     <Asset type={object.type} p={p}/>
    </group>)}
   </group>
  </> : null}
 </Scene></div></WorldBoundary>;
}
