import {
  Bed,
  CRT_TV,
  Desk,
  DeskLamp,
  Fallback,
  Poster,
  Rug,
} from './objects'

// Backend type -> component. Unknown types fall back to a neutral prop so an
// unexpected type is still visible and clickable.
export const OBJECT_COMPONENTS = {
  bed: Bed,
  desk: Desk,
  crt_tv: CRT_TV,
  desk_lamp: DeskLamp,
  rug: Rug,
  poster: Poster,
}

export function getObjectComponent(type) {
  return OBJECT_COMPONENTS[type] ?? Fallback
}

// Placement defaults. Floor props are solved onto the 3D floor from their
// normalized image position; wall props stay on the painted image plane.
const FLOOR_TYPES = new Set(['bed', 'desk', 'chair', 'rug', 'bookshelf', 'wardrobe'])
const WALL_TYPES = new Set(['poster'])

export function resolveAnchor(object) {
  if (object.anchor) return object.anchor
  if (object.support) return 'surface'
  if (WALL_TYPES.has(object.type)) return 'wall'
  if (FLOOR_TYPES.has(object.type)) return 'floor'
  return 'image'
}

// Native height (in the primitive's local units, from its base) of the surface
// that another prop can stand on.
export const SURFACE_HEIGHTS = {
  desk: 1.375,
  bed: 0.9,
}

// Native footprint [x, z] used for contact shadows.
export const FOOTPRINTS = {
  bed: [3, 4.2],
  desk: [4, 1.7],
  crt_tv: [1.6, 1.1],
  desk_lamp: [0.6, 0.6],
  chair: [0.8, 0.8],
  rug: [3, 2.5],
}
