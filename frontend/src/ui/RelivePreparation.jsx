import {useState} from 'react'
import WorldGeneration from '../integration/WorldGeneration.jsx'

// Preparation never starts a paid provider call. The account control owns consent,
// quota reservation, deduplication and polling through the existing FastAPI API.
export default function RelivePreparation({memory,hasWorldViewer,onGenerated,onExplore,onBack,onEdit,user,Photo,onPlans,onSample}){
 const [state,setState]=useState(memory.world&&hasWorldViewer?'ready':'waiting')
 const [error,setError]=useState('')
 const [photoIndex,setPhotoIndex]=useState(memory.photos.length===1?0:null)
 const ready=state==='ready'||state==='fallback'
 return <section className="mj-preparation" aria-labelledby="mj-preparation-title">
  <button className="mj-back" onClick={onBack}>← Back to memory</button>
  <div className="mj-preparation-card mj-glass">
   <div className="mj-relive-portal" aria-hidden="true">✧</div>
   <p className="mj-eyebrow">{state==='fallback'?'SYMBOLIC FALLBACK':'RELIVE MY MEMORY'}</p>
   <h1 id="mj-preparation-title">{ready?<>How would you like to <em>return?</em></>:<>Your memory is <em>waiting.</em></>}</h1>
   <p>{state==='fallback'?'This is an artistic symbolic scene, not a realistic reconstruction of your photograph.':ready?'Your memory world is ready. Find your own way, or follow your story.':'Choose one photograph, then explicitly generate a realistic world using your free account allowance.'}</p>
   {error&&<p className="mj-field-error" role="alert">{error}</p>}
   {ready?<div className="mj-relive-choices"><button className="mj-primary" onClick={()=>onExplore('free',state==='fallback')}>Explore Freely ↗</button><button className="mj-secondary" onClick={()=>onExplore('guided',state==='fallback')}>Take a Guided Journey ✧</button></div>:<>
    {!memory.photos.length&&<button className="mj-primary" onClick={onEdit}>Add a photograph</button>}
    {memory.photos.length>1&&<fieldset className="mj-source-photos"><legend>Source photograph</legend>{memory.photos.map((photo,index)=><label key={index}><input type="radio" name="generation-source" checked={photoIndex===index} onChange={()=>setPhotoIndex(index)}/>{Photo&&<Photo file={photo} alt={'Source photograph '+(index+1)}/>}</label>)}</fieldset>}
    <WorldGeneration user={user} file={photoIndex===null?null:memory.photos[photoIndex]} description={memory.story} onExploreSample={onSample} onReady={async world=>{
     try{await onGenerated({world});setState('ready');setError('')}
     catch(err){setError(err.message||'Your world is generated but could not be linked to this entry. Reopen it from your account worlds.')}
    }}/>
    <div className="mj-relive-choices"><button className="mj-secondary" onClick={()=>setState('fallback')}>Use symbolic fallback</button><button className="mj-secondary" onClick={onPlans}>View plans</button></div>
   </>}
  </div>
 </section>
}
