import { generateScene } from './generateScene.js';
// Deliberately omit audioFile: the backend accepts only story and photo.
export function createStudioGenerator(options = {}) {
 return ({file, description, signal, onStatus}) => generateScene({
  ...options, photo:file, story:description, signal, onStatus,
 });
}
export const generateStudioMemory = createStudioGenerator();
