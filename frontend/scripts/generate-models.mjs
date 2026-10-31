/**
 * Builds the local approved GLB catalog for the enhancement layer.
 *
 * These are placeholder-quality meshes authored in application code. They exist
 * so the overlay pipeline (catalog -> loader -> transform -> selection) is real
 * and testable today; swap the output files for artist/asset-store models with
 * the same ids and nothing else changes.
 *
 * Run from frontend/: node scripts/generate-models.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// three's exporter uses FileReader for the binary chunk; Node has Blob but not FileReader.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
    }
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'models')

const PALETTE = {
  wood: '#a77950',
  darkWood: '#7d5636',
  fabric: '#cfb194',
  cream: '#f2e7d6',
  metal: '#6b5b4a',
  shade: '#ffe4b7',
  oak: '#b0895f',
  oakDark: '#8a6844',
  rust: '#9a5b3d',
  cushion: '#b8744f',
  pillow: '#f1e8d8',
  wicker: '#c9a878',
  wickerDark: '#a8865a',
  plum: '#5c2b38',
  rugCream: '#ded2bd',
  rugBorder: '#c3ae90',
  brass: '#8a6a45',
}

// Deterministic noise so regenerating the catalog produces identical bytes.
let seed = 20261031
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.82,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0,
  })
}

function box(scene, name, size, position, color, options) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, options))
  mesh.name = name
  mesh.position.set(...position)
  scene.add(mesh)
  return mesh
}

function cylinder(scene, name, radius, height, position, color, options) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 20),
    material(color, options),
  )
  mesh.name = name
  mesh.position.set(...position)
  scene.add(mesh)
  return mesh
}

function cone(scene, name, radius, height, position, color, options) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 24, 1, true), material(color, options))
  mesh.name = name
  mesh.position.set(...position)
  scene.add(mesh)
  return mesh
}

function sphere(scene, name, radius, position, color, options) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material(color, options))
  mesh.name = name
  mesh.position.set(...position)
  scene.add(mesh)
  return mesh
}

function rounded(scene, name, size, position, color, radius = 0.05, options) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius),
    material(color, options),
  )
  mesh.name = name
  mesh.position.set(...position)
  scene.add(mesh)
  return mesh
}

function torus(scene, name, radius, tube, position, color, options) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 28), material(color, options))
  mesh.name = name
  mesh.position.set(...position)
  scene.add(mesh)
  return mesh
}

function buildBed() {
  const scene = new THREE.Scene()
  box(scene, 'frame', [1.8, 0.28, 2.3], [0, 0.14, 0], PALETTE.wood)
  box(scene, 'mattress', [1.66, 0.26, 2.14], [0, 0.41, 0], PALETTE.cream)
  box(scene, 'blanket', [1.7, 0.09, 1.25], [0, 0.56, 0.38], PALETTE.fabric)
  box(scene, 'pillow-left', [0.62, 0.16, 0.36], [-0.4, 0.58, -0.76], PALETTE.cream)
  box(scene, 'pillow-right', [0.62, 0.16, 0.36], [0.4, 0.58, -0.76], PALETTE.cream)
  box(scene, 'headboard', [1.86, 0.9, 0.12], [0, 0.56, -1.12], PALETTE.darkWood)
  return scene
}

function buildDesk() {
  const scene = new THREE.Scene()
  box(scene, 'top', [1.9, 0.08, 0.86], [0, 0.76, 0], PALETTE.wood)
  for (const x of [-0.86, 0.86]) {
    for (const z of [-0.36, 0.36]) {
      box(scene, `leg-${x}-${z}`, [0.08, 0.72, 0.08], [x, 0.36, z], PALETTE.darkWood)
    }
  }
  box(scene, 'drawer', [0.72, 0.3, 0.62], [0.48, 0.55, 0.0], PALETTE.darkWood)
  box(scene, 'drawer-front', [0.68, 0.24, 0.04], [0.48, 0.55, 0.33], PALETTE.wood)
  return scene
}

function buildChair() {
  const scene = new THREE.Scene()
  box(scene, 'seat', [0.56, 0.09, 0.56], [0, 0.46, 0], PALETTE.fabric)
  box(scene, 'back', [0.56, 0.62, 0.08], [0, 0.8, -0.24], PALETTE.wood)
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.22, 0.22]) {
      box(scene, `leg-${x}-${z}`, [0.06, 0.46, 0.06], [x, 0.23, z], PALETTE.darkWood)
    }
  }
  return scene
}

function buildLamp() {
  const scene = new THREE.Scene()
  cylinder(scene, 'base', 0.17, 0.06, [0, 0.03, 0], PALETTE.metal)
  cylinder(scene, 'stem', 0.025, 1.02, [0, 0.55, 0], PALETTE.metal)
  sphere(scene, 'bulb', 0.075, [0, 1.04, 0], PALETTE.shade, {
    emissive: PALETTE.shade,
    emissiveIntensity: 2,
  })
  cone(
    scene,
    'shade',
    0.3,
    0.44,
    [0, 1.16, 0],
    PALETTE.shade,
    { emissive: PALETTE.shade, emissiveIntensity: 0.45, roughness: 0.6 },
  )
  return scene
}

/**
 * Built-in oak bookcase from the panorama: five rows of books, a couple of
 * horizontal stacks, and a small ceramic vase. Origin at the floor, facing +Z.
 */
function buildBookshelf() {
  const scene = new THREE.Scene()
  const W = 2.2
  const H = 2.3
  const D = 0.4
  box(scene, 'back', [W, H, 0.03], [0, H / 2, -D / 2 + 0.015], PALETTE.oakDark)
  box(scene, 'side-left', [0.05, H, D], [-W / 2 + 0.025, H / 2, 0], PALETTE.oak)
  box(scene, 'side-right', [0.05, H, D], [W / 2 - 0.025, H / 2, 0], PALETTE.oak)
  box(scene, 'top', [W, 0.05, D], [0, H - 0.025, 0], PALETTE.oak)
  box(scene, 'base', [W, 0.06, D], [0, 0.03, 0], PALETTE.oakDark)

  const shelfY = [0.5, 0.95, 1.4, 1.85]
  for (const y of shelfY) box(scene, `shelf-${y}`, [W - 0.1, 0.04, D - 0.03], [0, y, 0], PALETTE.oak)

  const bookColors = ['#7a3b32', '#3f5566', '#6f7f57', '#8c6a3f', '#5b4a63', '#a68a63', '#4b4b4b']
  const levels = [0.06, 0.52, 0.97, 1.42, 1.87]
  for (const [level, baseY] of levels.entries()) {
    let x = -W / 2 + 0.09
    while (x < W / 2 - 0.2) {
      if (rand() < 0.14) {
        x += 0.08 + rand() * 0.16
        continue
      }
      const width = 0.035 + rand() * 0.03
      const height = 0.17 + rand() * 0.11
      const depth = 0.19 + rand() * 0.05
      box(
        scene,
        `book-${level}-${x.toFixed(2)}`,
        [width, height, depth],
        [x + width / 2, baseY + height / 2, 0.02 + rand() * 0.03],
        bookColors[Math.floor(rand() * bookColors.length)],
        { roughness: 0.92 },
      )
      x += width + 0.005
    }
  }

  // Two stacks lying flat, as in the reference shelves.
  for (const [index, [x, y]] of [[-0.55, 0.52], [0.62, 0.97]].entries()) {
    for (let i = 0; i < 3; i += 1) {
      box(
        scene,
        `stack-${index}-${i}`,
        [0.3, 0.035, 0.22],
        [x, y + 0.018 + i * 0.037, 0.03],
        bookColors[(index * 3 + i + 2) % bookColors.length],
      )
    }
  }

  cylinder(scene, 'vase', 0.07, 0.2, [0.78, 1.97, 0.02], '#d8c7ae', { roughness: 0.5 })
  cylinder(scene, 'vase-neck', 0.04, 0.06, [0.78, 2.1, 0.02], '#d8c7ae', { roughness: 0.5 })
  return scene
}

/** Ochre upholstered armchair with a cream accent pillow. Origin at the floor. */
function buildArmchair() {
  const scene = new THREE.Scene()
  for (const x of [-0.38, 0.38]) {
    for (const z of [-0.32, 0.32]) {
      box(scene, `leg-${x}-${z}`, [0.07, 0.18, 0.07], [x, 0.09, z], PALETTE.darkWood)
    }
  }
  rounded(scene, 'seat-base', [0.9, 0.26, 0.84], [0, 0.31, 0], PALETTE.rust, 0.05)
  rounded(scene, 'cushion', [0.76, 0.16, 0.72], [0, 0.52, 0.02], PALETTE.cushion, 0.07)
  const back = rounded(scene, 'back', [0.9, 0.68, 0.16], [0, 0.72, -0.35], PALETTE.rust, 0.06)
  back.rotation.x = -0.1
  rounded(scene, 'arm-left', [0.12, 0.34, 0.8], [-0.44, 0.55, 0], PALETTE.rust, 0.05)
  rounded(scene, 'arm-right', [0.12, 0.34, 0.8], [0.44, 0.55, 0], PALETTE.rust, 0.05)
  const pillow = rounded(scene, 'pillow', [0.4, 0.34, 0.12], [0, 0.74, -0.2], PALETTE.pillow, 0.06)
  pillow.rotation.x = -0.15
  return scene
}

/**
 * Hanging pendant from the panorama. Origin sits at the ceiling anchor and the
 * dome hangs below it, so y is the ceiling height in world units.
 */
function buildPendant() {
  const scene = new THREE.Scene()
  cylinder(scene, 'ceiling-cap', 0.06, 0.025, [0, 0, 0], PALETTE.brass)
  cylinder(scene, 'cable', 0.012, 0.16, [0, -0.09, 0], PALETTE.metal)
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    material(PALETTE.shade, {
      emissive: PALETTE.shade,
      emissiveIntensity: 0.55,
      roughness: 0.55,
    }),
  )
  dome.material.side = THREE.DoubleSide
  dome.name = 'dome'
  dome.position.set(0, -0.45, 0)
  scene.add(dome)
  torus(scene, 'rim', 0.3, 0.014, [0, -0.45, 0], PALETTE.brass).rotation.x = Math.PI / 2
  sphere(scene, 'bulb', 0.07, [0, -0.4, 0], PALETTE.shade, {
    emissive: PALETTE.shade,
    emissiveIntensity: 2.2,
  })
  return scene
}

/** Round woven storage basket with a lid and handle. Origin at the floor. */
function buildBasket() {
  const scene = new THREE.Scene()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.21, 0.34, 24),
    material(PALETTE.wicker, { roughness: 0.95 }),
  )
  body.name = 'body'
  body.position.set(0, 0.17, 0)
  scene.add(body)
  for (const [index, y] of [0.09, 0.17, 0.25].entries()) {
    const radius = 0.245 - (y - 0.09) * 0.12
    torus(scene, `weave-${index}`, radius, 0.006, [0, y, 0], PALETTE.wickerDark).rotation.x = Math.PI / 2
  }
  torus(scene, 'rim', 0.26, 0.016, [0, 0.34, 0], PALETTE.wickerDark).rotation.x = Math.PI / 2
  cylinder(scene, 'lid', 0.265, 0.03, [0, 0.365, 0], PALETTE.wickerDark)
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.012, 8, 20, Math.PI),
    material(PALETTE.wickerDark),
  )
  handle.name = 'handle'
  handle.position.set(0, 0.38, 0)
  scene.add(handle)
  return scene
}

/** Flat cream rug with the panorama's dark feather motif. Origin at the floor. */
function buildRug() {
  const scene = new THREE.Scene()
  const W = 2.6
  const D = 1.8
  const y = 0.012
  box(scene, 'pile', [W, 0.018, D], [0, y, 0], PALETTE.rugCream, { roughness: 1 })
  box(scene, 'border-a', [W - 0.14, 0.02, 0.08], [0, y + 0.002, -D / 2 + 0.09], PALETTE.rugBorder)
  box(scene, 'border-b', [W - 0.14, 0.02, 0.08], [0, y + 0.002, D / 2 - 0.09], PALETTE.rugBorder)
  box(scene, 'border-c', [0.08, 0.02, D - 0.16], [-W / 2 + 0.09, y + 0.002, 0], PALETTE.rugBorder)
  box(scene, 'border-d', [0.08, 0.02, D - 0.16], [W / 2 - 0.09, y + 0.002, 0], PALETTE.rugBorder)

  const top = y + 0.012
  // Feathers are built from a shaft plus angled barbs, all flat on the pile.
  function feather(x, z, angle, scale) {
    const group = new THREE.Group()
    group.position.set(x, top, z)
    group.rotation.y = angle
    group.scale.setScalar(scale)
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.006, 0.035), material(PALETTE.plum))
    shaft.name = 'feather-shaft'
    group.add(shaft)
    for (let i = 0; i < 7; i += 1) {
      const px = -0.34 + i * 0.1
      const length = 0.26 - Math.abs(i - 3) * 0.03
      for (const side of [-1, 1]) {
        const barb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.006, 0.028), material(PALETTE.plum))
        barb.name = `barb-${i}-${side}`
        barb.geometry.translate(length / 2, 0, 0)
        barb.position.set(px, 0, 0)
        barb.rotation.y = side * (0.62 + (i % 2) * 0.08)
        group.add(barb)
      }
    }
    scene.add(group)
  }

  feather(-0.55, 0.25, 0.55, 1)
  feather(0.35, 0.4, -0.35, 0.9)
  feather(0.75, -0.35, 1.15, 0.75)
  return scene
}

const MODELS = [
  ['bed-modern-01', buildBed],
  ['desk-modern-01', buildDesk],
  ['chair-modern-01', buildChair],
  ['lamp-warm-01', buildLamp],
  ['bookshelf-oak-01', buildBookshelf],
  ['armchair-ochre-01', buildArmchair],
  ['pendant-warm-01', buildPendant],
  ['basket-woven-01', buildBasket],
  ['rug-feather-01', buildRug],
]

mkdirSync(outDir, { recursive: true })

const exporter = new GLTFExporter()
for (const [id, build] of MODELS) {
  const scene = build()
  scene.name = id
  const data = await exporter.parseAsync(scene, { binary: true })
  const file = join(outDir, `${id}.glb`)
  writeFileSync(file, Buffer.from(data))
  console.log(`${id}.glb  ${data.byteLength} bytes`)
}
