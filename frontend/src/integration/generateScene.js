export const MAX_SCENE_PHOTO_BYTES = import.meta.env?.PROD ? 4 * 1024 * 1024 : 5 * 1024 * 1024;
import { parseSceneResponse, sceneStatus } from './sceneResponse.js';

// The caller owns UI loading/error state and must preserve the previous valid scene.
export async function generateScene({ story, photo, signal, onStatus = () => {}, baseUrl = import.meta.env?.VITE_API_BASE_URL ?? '', fetchImpl = fetch }) {
  if (typeof story !== 'string' || !story.trim() || Array.from(story.trim()).length > 2000) throw new Error('Enter a memory of 1–2000 characters.');
  if (!(photo instanceof Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size === 0 || photo.size > MAX_SCENE_PHOTO_BYTES) throw new Error(`Choose a JPEG, PNG or WebP photo up to ${MAX_SCENE_PHOTO_BYTES / 1024 / 1024} MB.`);
  const origin = baseUrl ? new URL(baseUrl) : null;
  if (origin && (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash)) throw new Error('Invalid backend URL.');
  const form = new FormData();
  form.append('story', story.trim());
  // Fixed filename avoids transmitting the user's potentially identifying original filename.
  form.append('photo', photo, 'memory-photo');
  onStatus({ state: 'loading', message: 'Generating your memory scene…' });
  try {
    const timeout = AbortSignal.timeout(55000);
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/generate-scene`, {
      method: 'POST', body: form,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      // Do not inject raw upstream/provider strings into the UI.
      if (response.status === 413) throw new Error(`The photo is too large. Choose a file up to ${MAX_SCENE_PHOTO_BYTES / 1024 / 1024} MB.`);
      if (response.status === 422) throw new Error('The photo or memory was rejected. Check the file and try again.');
      if (response.status === 503) throw new Error('Scene generation is not configured on the server. Contact the project owner.');
      if (response.status === 504) throw new Error('The AI provider timed out. Please retry.');
      if (response.status === 502) throw new Error('Scene generation is unavailable: the AI provider failed or returned an invalid scene. Please retry.');
      throw new Error('Scene generation is unavailable. Please retry.');
    }
    const result = parseSceneResponse(await response.json());
    onStatus({ state: 'ready', message: sceneStatus(result), source: result.source, fallback: result.fallback });
    return result; // Pass result.scene (not the envelope) to the renderer.
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Generation cancelled.' : error.name === 'TimeoutError' ? 'Generation timed out. Please retry.' : error.message;
    onStatus({ state: 'error', message });
    throw error;
  }
}
