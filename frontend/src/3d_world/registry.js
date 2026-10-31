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
