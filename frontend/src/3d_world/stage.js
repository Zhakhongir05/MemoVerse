import { createContext, useContext } from 'react'

// Fixed camera, straight-on. A point at depth 0 sits on the painted image plane.
export const CAMERA_Z = 11
export const BACKDROP_Z = 0
export const CAMERA_FOV = 45
export const DEPTH_MIN = 0.4
export const DEPTH_MAX = 2.6

const DEFAULT_IMAGE_ASPECT = 16 / 9

/**
 * Maps normalized image coordinates to world coordinates.
 *
 * The background is letterboxed (object-fit: contain) inside the viewport, so
 * (0.5, 0.5) is always the center of the image and x/y stay predictable at any
 * window size. `depth` (0..1) moves the object toward the camera; its screen
 * projection stays anchored to the same normalized point.
 */
export function createStageMapping({
  viewportWidth,
  viewportHeight,
  fov = CAMERA_FOV,
  imageWidth,
  imageHeight,
}) {
  const safeWidth = viewportWidth > 0 ? viewportWidth : 1
  const safeHeight = viewportHeight > 0 ? viewportHeight : 1
  const aspect = safeWidth / safeHeight

  const imageAspect =
    imageWidth > 0 && imageHeight > 0
      ? imageWidth / imageHeight
      : DEFAULT_IMAGE_ASPECT

  const cameraDistance = CAMERA_Z - BACKDROP_Z
  const visibleHeight = 2 * Math.tan((fov * Math.PI) / 360) * cameraDistance
  const visibleWidth = visibleHeight * aspect

  // Letterbox: the stage keeps the image aspect inside the viewport.
  const stageHeight = Math.min(visibleHeight, visibleWidth / imageAspect)
  const stageWidth = stageHeight * imageAspect

  const toWorld = (nx, ny, depth = 0) => {
    const d = Math.min(1, Math.max(0, depth))
    const z = DEPTH_MIN + d * (DEPTH_MAX - DEPTH_MIN)
    // Perspective shrink so the object's origin projects onto (nx, ny).
    const scale = (CAMERA_Z - z) / cameraDistance

    return [
      (nx - 0.5) * stageWidth * scale,
      (0.5 - ny) * stageHeight * scale,
      z,
    ]
  }

  return {
    stageWidth,
    stageHeight,
    imageAspect,
    aspect,
    toWorld,
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
