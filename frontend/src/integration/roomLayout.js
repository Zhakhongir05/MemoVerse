import { validateScene } from './sceneResponse.js';

// Clear area inside the teammate's 10x10 room, in front of its fixed desk and
// to the right of its fixed bed. Furniture/environment remain untouched.
export const ROOM_ZONE = Object.freeze({min: [-1.3, .03, -2.6], max: [4.3, 4.8, 4.2]});
export const ASSET_BOUNDS = Object.freeze({
 desk: {min: [-.9, 0, -.45], max: [.9, .88, .45]},
 bed: {min: [-.875, 0, -1.21], max: [.875, 1.25, 1.2]},
 chair: {min: [-.325, 0, -.33], max: [.325, 1.23, .325]},
 window: {min: [-.8, -.85, -.06], max: [.8, .85, .145]},
 bookshelf: {min: [-.76, 0, -.225], max: [.76, 2.05, .225]},
 lamp: {min: [-.42, .02, -.42], max: [.42, 1.525, .42]},
 'photo-frame': {min: [-.475, -.375, -.05], max: [.475, .375, .08]},
});

export function fitSceneToRoom(input) {
 const scene = validateScene(input);
 const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
 for (const object of scene.objects) {
  const box = ASSET_BOUNDS[object.type];
  for (let axis=0;axis<3;axis++) {
   min[axis]=Math.min(min[axis],object.position[axis]+box.min[axis]*object.scale[axis]);
   max[axis]=Math.max(max[axis],object.position[axis]+box.max[axis]*object.scale[axis]);
  }
 }
 // One uniform transform preserves relative positions and vector proportions.
 // Never enlarge generated objects beyond their original scale.
 const scale=Math.min(1,...min.map((v,i)=>(ROOM_ZONE.max[i]-ROOM_ZONE.min[i])/(max[i]-v)));
 const offset=min.map((v,i)=>i===1 ? ROOM_ZONE.min[i]-v*scale : (ROOM_ZONE.min[i]+ROOM_ZONE.max[i])/2-(v+max[i])/2*scale);
 return {scale,offset,bounds:{min,max}};
}
