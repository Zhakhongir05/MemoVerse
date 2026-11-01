// URL routing for the journal. The app has a single entry point, so every
// screen is described by a path the server can fall back on (see vercel.json).
// Keeping the parser pure lets the tests run without a browser.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MEMORY_PATH = new RegExp('^/journal/memory/(' + UUID + ')(?:/(edit|prepare|relive))?$', 'i')
const WORLD_HASH = new RegExp('^#world/(' + UUID + ')$', 'i')

const SIMPLE = {
  '/journal': 'journal',
  '/journal/timeline': 'timeline',
  '/journal/worlds': 'creations',
  '/journal/plans': 'plans',
  '/journal/favorites': 'favorites',
  '/journal/new': 'create',
  '/journal/studio': 'studio',
  '/journal/demo': 'relive',
}

const PATHS = {
  journal: '/journal',
  timeline: '/journal/timeline',
  creations: '/journal/worlds',
  plans: '/journal/plans',
  favorites: '/journal/favorites',
  studio: '/journal/studio',
  create: '/journal/new',
}

function normalize(pathname) {
  const path = String(pathname || '/')
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** Read the screen the browser is on. */
export function parseRoute(pathname = globalThis.location?.pathname || '/', hash = globalThis.location?.hash || '') {
  const path = normalize(pathname)
  if (SIMPLE[path]) return { screen: 'journal', view: SIMPLE[path], ...(path === '/journal/demo' ? { demo: true } : {}) }
  const memory = MEMORY_PATH.exec(path)
  if (memory) return { screen: 'journal', view: memory[2] || 'detail', memoryId: memory[1].toLowerCase() }
  // Older share links pointed at the world with a hash. Keep them working, then
  // let the next state change rewrite them to a real path.
  const legacy = WORLD_HASH.exec(hash || '')
  if (legacy) return { screen: 'journal', view: 'relive', memoryId: legacy[1].toLowerCase(), legacy: true }
  return { screen: 'landing' }
}

/** Path for a journal view, or null when the view has no address of its own. */
export function routePath({ view, memoryId, demo, draftId } = {}) {
  if (demo && (view === 'relive' || view === 'prepare')) return '/journal/demo'
  if (view === 'create') return draftId ? '/journal/memory/' + draftId + '/edit' : '/journal/new'
  if (view === 'detail' || view === 'prepare' || view === 'relive' || view === 'edit') {
    if (!memoryId) return '/journal'
    return view === 'detail' ? '/journal/memory/' + memoryId : '/journal/memory/' + memoryId + '/' + view
  }
  return PATHS[view] || '/journal'
}

/** Change the address, then tell mounted screens to read it again. */
export function go(path, { replace = false } = {}) {
  if (typeof window === 'undefined' || !path) return
  const current = window.location.pathname + window.location.search + window.location.hash
  if (current === path) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.dispatchEvent(new Event('memoverse:navigate'))
}

/** Run handler on Back/Forward and on go(). Returns an unsubscribe function. */
export function onRouteChange(handler) {
  if (typeof window === 'undefined') return () => {}
  const listener = () => handler()
  window.addEventListener('popstate', listener)
  window.addEventListener('memoverse:navigate', listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener('memoverse:navigate', listener)
  }
}
