// Mirrors backend/schemas.py. It preserves the scene; it does not invent renderer mappings.
const TYPES = new Set(['desk', 'bed', 'chair', 'window', 'bookshelf', 'lamp', 'photo-frame']);
const MOODS = new Set(['nostalgic', 'joyful', 'melancholic']);
const REASONS = new Set(['demo_mode', 'missing_credentials', 'provider_timeout', 'provider_failure', 'invalid_model_output']);
function fail() { throw new Error('The backend returned an unsupported scene response.'); }
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(k => !Object.hasOwn(value, k))) fail();
}
function text(value, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || Array.from(value).length > max) fail();
}
function vector(value, check) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(v => typeof v === 'number' && Number.isFinite(v) && check(v))) fail();
}
export function parseSceneResponse(payload) {
  keys(payload, ['scene', 'source', 'fallback', 'reason']);
  if (payload.source === 'ai') {
    if (payload.fallback !== false || payload.reason !== null) fail();
  } else if (payload.source === 'mock') {
    if (payload.fallback !== true || !REASONS.has(payload.reason)) fail();
  } else fail();
  validateScene(payload.scene);
  return structuredClone(payload);
}
export function validateScene(scene) {
  keys(scene, ['title', 'environment', 'mood', 'objects']);
  text(scene.title, 1, 100);
  if (scene.environment !== 'bedroom' || !MOODS.has(scene.mood) || !Array.isArray(scene.objects) || scene.objects.length < 1 || scene.objects.length > 7) fail();
  const ids = new Set();
  for (const object of scene.objects) {
    keys(object, ['id', 'type', 'position', 'scale', 'memory', 'audioUrl']);
    if (typeof object.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(object.id) || ids.has(object.id) || !TYPES.has(object.type)) fail();
    ids.add(object.id);
    vector(object.position, n => n >= -10 && n <= 10);
    vector(object.scale, n => n > 0 && n <= 5);
    text(object.memory, 0, 500);
    if (object.audioUrl !== null) fail();
  }
  return structuredClone(scene);
}
export function sceneStatus(response) {
  return response.source === 'ai' ? 'AI-generated scene' : `Prepared demo scene (${response.reason}); not generated from your upload.`;
}
