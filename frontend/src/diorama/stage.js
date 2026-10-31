import { createContext, useContext } from 'react'

// Fixed camera, straight-on. The backdrop sits well behind the props so no
// furniture geometry can poke through the image plane.
export const CAMERA_Z = 11
export const BACKDROP_Z = -4
export const CAMERA_FOV = 45
// The 3D floor stops just in front of the camera instead of reaching it.
export const FLOOR_NEAR_Z = CAMERA_Z - 2.5

const DEFAULT_IMAGE_ASPECT = 16 / 9

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Maps normalized image coordinates to world coordinates.
 *
 * The background is letterboxed (object-fit: contain) inside the viewport, so
 * (0.5, 0.5) is always the center of the image and x/y stay predictable at any
 * window size. `floorLine` is the image-space Y where the painted wall meets
 * the painted floor; the renderer puts a real 3D floor at that height, and
 * floor props are solved onto it so their base still projects to their
 * normalized image position.
 */
export function createStageMapping({
  viewportWidth,
  viewportHeight,
  fov = CAMERA_FOV,
  imageWidth,
  imageHeight,
  floorLine = 0.62,
}) {
  const safeWidth = viewportWidth > 0 ? viewportWidth : 1
  const safeHeight = viewportHeight > 0 ? viewportHeight : 1
  const aspect = safeWidth / safeHeight

  const imageAspect =
    imageWidth > 0 && imageHeight > 0
      ? imageWidth / imageHeight
      : DEFAULT_IMAGE_ASPECT

  const cameraDistance = CAMERA_Z - BACKDROP_Z
  const tanHalfFov = Math.tan((fov * Math.PI) / 360)
  const visibleHeight = 2 * tanHalfFov * cameraDistance
  const visibleWidth = visibleHeight * aspect

  // Letterbox: the stage keeps the image aspect inside the viewport.
  const stageHeight = Math.min(visibleHeight, visibleWidth / imageAspect)
  const stageWidth = stageHeight * imageAspect

  const safeFloorLine = clamp(floorLine, 0.5, 0.95)
  // The camera sits at y = 0, so this is also how far below eye level the
  // painted floor is.
  const floorY = (0.5 - safeFloorLine) * stageHeight

  // Perspective factor relative to the backdrop plane (1 at the wall).
  const perspectiveAtZ = (z) =>
    Math.max(0.001, (CAMERA_Z - z) / cameraDistance)

  const imageXToWorld = (nx, perspective = 1) =>
    (nx - 0.5) * stageWidth * perspective

  const imageYToWorld = (ny, perspective = 1) =>
    (0.5 - ny) * stageHeight * perspective

  // Solve the floor depth whose projection lands on image-space `ny`.
  const floorZFromImageY = (ny) => {
    const safeNy = clamp(ny, safeFloorLine + 0.002, 1)
    return CAMERA_Z + floorY / (2 * (safeNy - 0.5) * tanHalfFov)
  }

  // Inverse of the above: image-space Y of a point on the floor at depth z.
  const imageYFromFloorZ = (z) => {
    const distance = Math.max(0.2, CAMERA_Z - z)
    return 0.5 - floorY / (2 * distance * tanHalfFov)
  }

  // Inverse used by the dev drag tool for wall / surface props.
  const fromWorldAtZ = (x, y, z) => {
    const perspective = perspectiveAtZ(z)
    return [
      clamp01(0.5 + x / (stageWidth * perspective)),
      clamp01(0.5 - y / (stageHeight * perspective)),
    ]
  }

  // Inverse used by the dev drag tool for floor props.
  const fromFloorPoint = (x, z) => {
    const safeZ = clamp(z, BACKDROP_Z, FLOOR_NEAR_Z)
    const perspective = perspectiveAtZ(safeZ)
    return [
      clamp01(0.5 + x / (stageWidth * perspective)),
      clamp(imageYFromFloorZ(safeZ), safeFloorLine, 1),
    ]
  }

  return {
    stageWidth,
    stageHeight,
    imageAspect,
    aspect,
    floorLine: safeFloorLine,
    floorY,
    floorNearZ: FLOOR_NEAR_Z,
    backdropZ: BACKDROP_Z,
    perspectiveAtZ,
    imageXToWorld,
    imageYToWorld,
    floorZFromImageY,
    imageYFromFloorZ,
    fromWorldAtZ,
    fromFloorPoint,
  }
}

export const StageContext = createContext(null)

export function useStage() {
  const mapping = useContext(StageContext)

  if (!mapping) {
    throw new Error('useStage() must be used inside <StageProvider>')
  }

  return mapping
}
