# MemoVerse demo script — "sensation"

**2 minutes 30 seconds, one browser tab, no account.** Rehearse it twice; the
clicks are timed and nothing needs typing until the optional last step.

Live app: <https://memoverse05.vercel.app>

## Pre-flight (5 minutes before)

- On the venue network, open the live URL and run it through to the sensory
  pass once, so you know the real room load time and that cues arrive.
- Then reload and leave the tab on the landing screen. Close other tabs;
  notifications off.
- Sound up. Audio starts only after *Senses on*, so the room stays quiet until
  you ask for it.
- The sample room streams from World Labs, so give it a few seconds. If the
  network dies mid-demo, the room already open keeps working; new cues need the
  network.

## Run of show

| Time | Do | Say (one version that works) |
| --- | --- | --- |
| 0:00 | — | "Journal apps keep what you wrote. MemoVerse gives the memory back as a place — and today, as a sensation." |
| 0:15 | Click **Explore Memories** → **Continue exploring without signing in** | "No account, no upload. This is the whole journal, running as a guest." |
| 0:35 | Click the gear (**Journal options**) → **Try a Demo** | "A real room from a real memory. One click." |
| 0:45 | Let the sample room finish opening (usually 2–4 s) | "This is a Gaussian splat reconstruction of a room — not a panorama, not a drawing. The label *Sample* is there on purpose: we never pass a demo off as your memory." |
| 1:05 | Click **Sensory pass** three or four times, one beat each | "Here is what this room remembers. *(read the card)* Rain against the glass. And underneath it, the exact sentence it came from: *'Rain taps at the window and a fire is crackling in the grate.'* Nothing here is invented — every card quotes the writer." |
| 1:40 | Click **Senses on** | "Sound is synthesized live in the browser — no audio files, no streaming, seven engines: rain, fire, wind, birds, waves, hum, music." |
| 1:55 | Keep clicking **Sensory pass** to the cold cue | "Temperature isn't audio, so we don't pretend it is: the room tints cool and the card says *Temperature remembered*." |
| 2:10 | — | "Under the hood it's deterministic: a lexicon reads the entry and its placed memory anchors, and each cue is returned with its quote. No model call, no cost, no external service." |
| 2:25 | — | "So: write a memory, walk back into it, and let it tell you what it remembers. That's sensation, grounded in your own words." |

## If something goes wrong

| Symptom | Do | Say |
| --- | --- | --- |
| Room still loading | Keep talking about the splat; it opens within a few seconds | "It's streaming the room." |
| **Sensory pass** is disabled | The entry has no sensory keywords — skip to *Senses on*, then continue | "This story doesn't name a sense, so we don't invent one." |
| No sound | Click **Senses off → Senses on** once (browsers require a gesture) | "Browsers want a click before audio — that's the click." |
| Backend unreachable | The cards stay empty and the room still works | "Senses are additive; the room never depends on them." |

## Questions judges ask

- **Is this AI generating smells?** No. Extraction is a deterministic lexicon;
  the card always shows the sentence it came from. That is the product claim:
  evidence, not invention.
- **Why not an LLM?** Cost, latency and honesty. A model would happily invent a
  smell the writer never wrote.
- **What is synthesized?** Only sound, in Web Audio, with seven small engines.
  Scent, touch, temperature and light are described and tinted, and labelled as
  remembered.
- **Does it work for any entry?** For entries that name a sense, yes; the
  lexicon is English and keyword-based, and the docs say so plainly.

## Don't claim

- Don't say the room *replays* a recorded soundscape — it is synthesized ambience.
- Don't say the demo room is the visitor's own memory — it is labelled *Sample*.
- Don't show a signed-in flow unless you have already generated a world; the
  guest demo is the reliable path.

Deeper detail, contract and limitations: [SENSORY_MEMORY.md](SENSORY_MEMORY.md).
