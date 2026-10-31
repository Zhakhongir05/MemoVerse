export function isLegacyPodcast(script) {
  if (!script || !Array.isArray(script.chapters)) return false
  return (script.version ?? 1) < 2 || script.chapters.some(chapter => /take (?:a |a deep )breath|there is no need to hurry|let your attention|stay with this moment/i.test(chapter.narration || ''))
}
