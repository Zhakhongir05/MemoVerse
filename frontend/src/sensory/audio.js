/**
 * Small, asset-free ambience synthesizer for sensory cues.
 *
 * Everything is generated with Web Audio: no files, no network, no autoplay.
 * The context is created on the first user gesture, one voice plays at a time,
 * and stop() fades out before releasing its nodes. Engines that are described
 * rather than heard (scent, temperature, texture, light) use 'none'.
 */
const FADE_IN_SECONDS = 1.5
const FADE_OUT_SECONDS = 1.2

function makeNoise(context, seconds = 2) {
  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
  return buffer
}

function makeBrownNoise(context, seconds = 2) {
  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[index] = last * 3.5
  }
  return buffer
}

export function createSensoryEngine() {
  let context = null
  let voice = null
  let active = new Set()
  let timers = []

  function schedule(callback, delay) {
    const timer = setTimeout(callback, delay)
    timers.push(timer)
    return timer
  }

  function track(node) {
    active.add(node)
    return node
  }

  function gainNode(value = 1) {
    const node = context.createGain()
    node.gain.value = value
    return node
  }

  function biquad(type, frequency, quality = 1) {
    const node = context.createBiquadFilter()
    node.type = type
    node.frequency.value = frequency
    node.Q.value = quality
    return node
  }

  function lfo(frequency, depth, target) {
    const osc = track(context.createOscillator())
    const amp = gainNode(depth)
    osc.frequency.value = frequency
    osc.connect(amp)
    amp.connect(target)
    osc.start()
  }

  function startSource(buffer, { loop = true, playbackRate = 1 } = {}) {
    const source = track(context.createBufferSource())
    source.buffer = buffer
    source.loop = loop
    source.playbackRate.value = playbackRate
    source.start()
    return source
  }

  function buildRain() {
    startSource(makeNoise(context)).connect(biquad('bandpass', 1200, 0.7)).connect(gainNode(0.45)).connect(voice)
  }

  function buildWaves() {
    const wash = gainNode(0.24)
    startSource(makeNoise(context)).connect(biquad('lowpass', 600, 0.5)).connect(wash).connect(voice)
    lfo(0.15, 0.18, wash.gain)
  }

  function buildWind() {
    const band = biquad('bandpass', 500, 0.6)
    startSource(makeNoise(context)).connect(band).connect(gainNode(0.4)).connect(voice)
    lfo(0.07, 180, band.frequency)
  }

  function buildHum() {
    const tone = biquad('lowpass', 300, 0.7)
    tone.connect(voice)
    for (const [frequency, level] of [[60, 0.32], [120, 0.07]]) {
      const osc = track(context.createOscillator())
      osc.type = 'sine'
      osc.frequency.value = frequency
      osc.connect(gainNode(level)).connect(tone)
      osc.start()
    }
  }

  function buildMusic() {
    const chord = gainNode(0.9)
    chord.connect(voice)
    for (const [frequency, level] of [[261.63, 0.05], [329.63, 0.04], [392.0, 0.035]]) {
      const osc = track(context.createOscillator())
      osc.type = 'sine'
      osc.frequency.value = frequency
      osc.detune.value = (Math.random() - 0.5) * 6
      osc.connect(gainNode(level)).connect(chord)
      osc.start()
    }
    lfo(0.12, 0.25, chord.gain)
  }

  function crackle() {
    if (!voice || !context) return
    const burst = context.createBufferSource()
    burst.buffer = makeNoise(context, 0.04)
    const envelope = gainNode(0)
    const now = context.currentTime
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(0.09, now + 0.004)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
    burst.connect(biquad('highpass', 900, 0.7)).connect(envelope).connect(voice)
    burst.start(now)
    burst.stop(now + 0.05)
  }

  function buildFire() {
    startSource(makeBrownNoise(context)).connect(biquad('lowpass', 400, 0.6)).connect(gainNode(0.5)).connect(voice)
    const pop = () => {
      if (!voice) return
      crackle()
      schedule(pop, 120 + Math.random() * 580)
    }
    schedule(pop, 400)
  }

  function chirp() {
    if (!voice || !context) return
    const osc = context.createOscillator()
    const envelope = gainNode(0)
    const now = context.currentTime
    const start = 2100 + Math.random() * 1200
    osc.type = 'sine'
    osc.frequency.setValueAtTime(start, now)
    osc.frequency.exponentialRampToValueAtTime(start + 500 + Math.random() * 700, now + 0.12)
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(0.07, now + 0.02)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    osc.connect(envelope).connect(voice)
    osc.start(now)
    osc.stop(now + 0.2)
  }

  function buildBirds() {
    const sing = () => {
      if (!voice) return
      chirp()
      schedule(sing, 1500 + Math.random() * 2500)
    }
    schedule(sing, 250)
  }

  const BUILDERS = {
    rain: buildRain,
    waves: buildWaves,
    wind: buildWind,
    hum: buildHum,
    music: buildMusic,
    fire: buildFire,
    birds: buildBirds,
  }

  function ensureContext() {
    if (context) return context
    const Context = typeof window === 'undefined' ? null : (window.AudioContext || window.webkitAudioContext)
    if (!Context) return null
    context = new Context()
    return context
  }

  function stop() {
    timers.forEach(clearTimeout)
    timers = []
    if (!context || !voice) return
    const dying = voice
    const now = context.currentTime
    try {
      dying.gain.cancelScheduledValues(now)
      dying.gain.setValueAtTime(dying.gain.value, now)
      dying.gain.linearRampToValueAtTime(0, now + FADE_OUT_SECONDS)
    } catch { /* A closed context has nothing left to fade. */ }
    voice = null
    const sources = [...active]
    active = new Set()
    setTimeout(() => {
      sources.forEach((node) => {
        try { node.stop() } catch { /* already stopped */ }
        try { node.disconnect() } catch { /* already disconnected */ }
      })
      try { dying.disconnect() } catch { /* already disconnected */ }
    }, (FADE_OUT_SECONDS + 0.1) * 1000)
  }

  function play(engine, intensity = 0.5) {
    const builder = BUILDERS[engine]
    if (!builder) return false
    if (!ensureContext()) return false
    try {
      if (context.state === 'suspended') context.resume().catch(() => {})
      stop()
      const level = 0.03 + 0.05 * Math.min(1, Math.max(0, Number(intensity) || 0.5))
      voice = context.createGain()
      voice.gain.setValueAtTime(0, context.currentTime)
      voice.gain.linearRampToValueAtTime(level, context.currentTime + FADE_IN_SECONDS)
      voice.connect(context.destination)
      builder()
      return true
    } catch {
      // Audio is an enhancement; a failure must never break the room.
      stop()
      return false
    }
  }

  function dispose() {
    stop()
    if (context) {
      const closing = context
      context = null
      closing.close().catch(() => {})
    }
  }

  return { play, stop, dispose }
}
