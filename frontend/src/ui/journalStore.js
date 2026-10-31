const DATABASE = 'memoverse-journal'
export const MOODS = ['Nostalgic', 'Joyful', 'Peaceful', 'Grateful', 'Loved', 'Excited', 'Hopeful', 'Bittersweet', 'Melancholic']

export function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function validateEntry(entry) {
  const errors = {}
  if (!entry.title?.trim()) errors.title = 'Give this memory a title.'
  if (entry.title?.length > 100) errors.title = 'Use 100 characters or fewer.'
  const date = new Date(`${entry.date}T12:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') || Number.isNaN(date.getTime()) || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` !== entry.date) errors.date = 'Choose a valid memory date.'
  if (!entry.story?.trim() && !entry.photos?.length && !entry.audio) errors.story = 'Add a story, photograph, or audio recording.'
  if (entry.story?.length > 12000) errors.story = 'Use 12,000 characters or fewer.'
  if (!MOODS.includes(entry.mood)) errors.mood = 'Choose one of the available moods.'
  if ((entry.photos || []).length > 6 || (entry.photos || []).some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024)) errors.photos = 'Choose up to 6 JPG, PNG, or WebP photos, each up to 10 MB.'
  if (entry.audio && (!entry.audio.size || entry.audio.size > 25 * 1024 * 1024 || !/\.(mp3|wav|m4a|ogg|webm)$/i.test(entry.audio.name))) errors.audio = 'Choose an MP3, WAV, M4A, OGG, or WebM recording up to 25 MB.'
  return errors
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('This browser cannot store your journal. Enable browser storage and try again.')); return }
    const request = indexedDB.open(DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('entries', { keyPath: 'id' })
      store.createIndex('owner', 'owner')
    }
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new Error('Close other MemoVerse tabs, then retry opening your journal.')) }
  })
}

export async function listEntries(owner, { includeDeleted = false } = {}) {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('entries', 'readonly')
      const request = transaction.objectStore('entries').index('owner').getAll(owner)
      transaction.oncomplete = () => resolve(request.result.filter(entry => includeDeleted || !entry.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)))
      transaction.onabort = () => reject(transaction.error || new Error('Could not read your journal.'))
    })
  } finally { database.close() }
}

export async function saveEntry(owner, entry, { preserveTimestamps = false } = {}) {
  if (!owner) throw new Error('A journal owner is required.')
  if (!entry.deletedAt && Object.keys(validateEntry(entry)).length) throw new Error('Check your memory details before saving.')
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('entries', 'readwrite')
      const store = transaction.objectStore('entries')
      const now = new Date().toISOString()
      const id = entry.id || crypto.randomUUID()
      const lookup = store.get(id)
      let saved
      let ownershipError = false
      lookup.onsuccess = () => {
        if (lookup.result && lookup.result.owner !== owner) { ownershipError = true; transaction.abort(); return }
        saved = { ...entry, id, owner, title: entry.title.trim(), story: entry.story || '', photos: entry.photos || [], audio: entry.audio || null, createdAt: lookup.result?.createdAt || entry.createdAt || now, updatedAt: preserveTimestamps ? entry.updatedAt || now : now }
        store.put(saved)
      }
      transaction.oncomplete = () => resolve(saved)
      transaction.onabort = () => reject(ownershipError ? new Error('This entry belongs to another journal.') : transaction.error || new Error('Could not save your journal.'))
    })
  } finally { database.close() }
}

export async function markEntryDeleted(owner, entry) {
  return saveEntry(owner, { ...entry, deletedAt: new Date().toISOString(), syncState: 'pending-delete', story: '', photos: [], audio: null, scene: null, world: null, cloudMedia: null })
}

export function formatMemoryDate(date, options = { month: 'long', day: 'numeric', year: 'numeric' }) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options)
}

export function journeySteps(entry) {
  if (entry.world?.guidedTour?.chapters?.length) return entry.world.guidedTour.chapters.map((chapter,index)=>({id:chapter.id,title:['Enter the memory','Explore meaningful objects','Reflect on the memory'][index]||'Saved memory',text:chapter.narration,photoIndex:null,cameraPose:null,narrationUrl:null}))
  const paragraphs = entry.story.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
  const count = Math.max(1, paragraphs.length, entry.photos.length)
  return Array.from({ length: count }, (_, index) => ({
    id: `${entry.id}:anchor:${index}`, title: index === 0 ? 'Arrive in the moment' : `A little closer · ${index + 1}`,
    text: paragraphs[index] || (paragraphs.length ? 'Take a moment to notice the details in this photograph.' : 'Let the details bring you back to this moment.'),
    photoIndex: entry.photos.length ? Math.min(index, entry.photos.length - 1) : null,
    cameraPose: null, narrationUrl: null,
  }))
}
