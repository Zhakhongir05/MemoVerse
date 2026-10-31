# Relive generation flow

Memory Detail now has one main action: **Relive My Memory**. It opens a preparation
view, checks for a source photograph, and then:

- Reuses an existing world when a real viewer is provided.
- Calls the supplied `generateEnvironment` server adapter, with a real pending,
  error/retry, and abort state.
- Shows generation unavailable when that adapter or World Labs viewer is absent.
  It never runs a fake generation timer or labels the symbolic room realistic.

When ready, users choose Explore Freely or Take a Guided Journey. If realistic
generation is unavailable, **Use symbolic fallback** is an explicit choice; the
scene is labeled SYMBOLIC FALLBACK. The independent **Try a Demo** button on My
Journal opens a labeled symbolic demo, without claiming to use the user's photos.

## Team integration

Supply these props to Journal in App.jsx after coordinating with the team:

```jsx
<Journal
  generateEnvironment={generateMemoryOnServer}
  WorldViewer={ExistingWorldLabsViewer}
  JourneyController={ExistingJourneyController}
  // Keep the existing SceneRenderer for the symbolic fallback.
/>
```

The adapter receives `{ memory, photos, story, signal }` and must resolve only when
the real operation completes, returning `{ world, story?, scene?, tour? }`. It owns
the World Labs job and OpenAI + DeepSeek story/tour orchestration. `world` must be a
nonempty object accepted by the real viewer. Provider keys remain on the server.
Generated metadata is saved via the existing IndexedDB/Supabase journal pipeline.
No backend API contract was invented or backend/3D internal files modified here.

The immersive wrapper has native browser Fullscreen/Exit fullscreen controls.
Anchor-selection callbacks/popups are removed and `showAnchors: false` /
`showMarkers: false` are passed to the renderer. Team viewers must honor those
visibility flags if they render internal markers; their internals are unchanged.

Audio upload, playback, and toolbar options are removed from the frontend, including
the original studio. Previously saved audio is preserved in private storage for
compatibility; this UI change does not silently delete historical files.
