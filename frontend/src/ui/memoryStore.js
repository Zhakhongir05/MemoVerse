import { supabase } from './supabaseClient.js'

const BUCKET = 'memory-assets'
const columns = 'id,title,description,mood,scene,photo_path,audio_path,created_at'

export async function listMemories(userId) {
  const { data, error } = await supabase.from('memories').select(columns)
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data
}

export async function openMemory(memory) {
  async function download(path) {
    if (!path) return null
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error) throw error
    return new File([data], path.split('/').pop(), { type: data.type })
  }
  const [file, audioFile] = await Promise.all([download(memory.photo_path), download(memory.audio_path)])
  return { ...memory, file, audioFile }
}

// A record belongs to one editable draft. Only the autosave queue mutates it.
export function createDraftRecord(memory) {
  return {
    id: memory?.id || crypto.randomUUID(),
    file: memory?.file || null, audioFile: memory?.audioFile || null,
    photoPath: memory?.photo_path || null, audioPath: memory?.audio_path || null,
  }
}

export async function persistDraft({ userId, draft, record, client = supabase }) {
  const uploaded = []
  async function assetPath(file, previousFile, previousPath, kind) {
    if (file === previousFile) return previousPath
    if (!file) return null
    const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const path = `${userId}/${record.id}/${kind}-${crypto.randomUUID()}.${extension}`
    const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (error) throw error
    uploaded.push(path)
    return path
  }
  let saved
  let photoPath
  let audioPath
  try {
    photoPath = await assetPath(draft.file, record.file, record.photoPath, 'photo')
    audioPath = await assetPath(draft.audioFile, record.audioFile, record.audioPath, 'audio')
    const { data, error } = await client.from('memories').upsert({
      id: record.id, user_id: userId,
      title: draft.description.trim().slice(0, 70) || 'Untitled memory',
      description: draft.description, mood: draft.mood, scene: draft.scene,
      photo_path: photoPath, audio_path: audioPath,
    }, { onConflict: 'id' }).select(columns).single()
    if (error) throw error
    saved = data
  } catch (error) {
    if (uploaded.length) await client.storage.from(BUCKET).remove(uploaded).catch(() => {})
    throw error
  }
  const obsolete = [record.photoPath, record.audioPath].filter(path => path && path !== photoPath && path !== audioPath)
  Object.assign(record, { file: draft.file, audioFile: draft.audioFile, photoPath, audioPath })
  // The DB row is committed before old assets are removed. Cleanup failure must
  // never turn a successful save into a retry that uploads duplicate assets.
  if (obsolete.length) await client.storage.from(BUCKET).remove(obsolete).catch(() => {})
  return saved
}
