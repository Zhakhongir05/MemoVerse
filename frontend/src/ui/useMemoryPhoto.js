import { useEffect, useState } from 'react'
import { memoryPhoto, photoUrl } from '../enhancements/photo.js'
export function useMemoryPhoto(memory) {
  const photo = memoryPhoto(memory)
  const [value, setValue] = useState({ photo: null, url: '', error: '' })
  useEffect(() => {
    let source
    try {
      source = photoUrl(photo)
      // Object URLs are external resources and must be released on replacement.
      // oxlint-disable-next-line react/set-state-in-effect
      setValue({ photo, url: source.url, error: source.url ? '' : 'This memory has no photograph. Add one to generate furniture.' })
    } catch (error) { setValue({ photo, url: '', error: error.message }) }
    return () => { if (source?.owned) URL.revokeObjectURL(source.url) }
  }, [photo])
  return value.photo === photo ? value : { url: '', error: '' }
}
