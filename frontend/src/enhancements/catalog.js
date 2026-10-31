/**
 * Approved local asset catalog for the World Labs enhancement layer.
 *
 * Every asset the renderer is allowed to mount must exist here. A backend
 * response names an `assetId`; it can never supply a URL. Adding a model is a
 * code review step: drop the GLB in public/models and add an entry below.
 */
export const ASSET_CATALOG = Object.freeze({
  'bed-modern-01': Object.freeze({
    type: 'bed',
    url: '/models/bed-modern-01.glb',
    label: 'Modern bed',
    unitScale: 1,
    // Approximate native footprint, used for the loading placeholder.
    size: [1.9, 1.0, 2.4],
  }),
  'desk-modern-01': Object.freeze({
    type: 'desk',
    url: '/models/desk-modern-01.glb',
    label: 'Writing desk',
    unitScale: 1,
    size: [2.0, 0.85, 1.0],
  }),
  'chair-modern-01': Object.freeze({
    type: 'chair',
    url: '/models/chair-modern-01.glb',
    label: 'Wooden chair',
    unitScale: 1,
    size: [0.6, 1.15, 0.6],
  }),
  'lamp-warm-01': Object.freeze({
    type: 'lamp',
    url: '/models/lamp-warm-01.glb',
    label: 'Warm table lamp',
    unitScale: 1,
    size: [0.6, 1.4, 0.6],
  }),
  'bookshelf-oak-01': Object.freeze({
    type: 'bookshelf',
    url: '/models/bookshelf-oak-01.glb',
    label: 'Oak bookshelf',
    unitScale: 1,
    size: [2.2, 2.3, 0.4],
  }),
  'armchair-ochre-01': Object.freeze({
    type: 'armchair',
    url: '/models/armchair-ochre-01.glb',
    label: 'Ochre armchair',
    unitScale: 1,
    size: [0.95, 1.0, 0.9],
  }),
  'pendant-warm-01': Object.freeze({
    type: 'pendant',
    url: '/models/pendant-warm-01.glb',
    label: 'Hanging pendant',
    unitScale: 1,
    // Origin sits at the ceiling anchor; the dome hangs below it.
    size: [0.6, 0.5, 0.6],
  }),
  'basket-woven-01': Object.freeze({
    type: 'basket',
    url: '/models/basket-woven-01.glb',
    label: 'Woven basket',
    unitScale: 1,
    size: [0.55, 0.45, 0.55],
  }),
  'rug-feather-01': Object.freeze({
    type: 'rug',
    url: '/models/rug-feather-01.glb',
    label: 'Feather rug',
    unitScale: 1,
    size: [2.6, 0.05, 1.8],
  }),
})

export const ENHANCEMENT_TYPES = Object.freeze([
  'bed',
  'desk',
  'chair',
  'lamp',
  'bookshelf',
  'armchair',
  'pendant',
  'basket',
  'rug',
])
