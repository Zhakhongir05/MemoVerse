# Immersive memory controls

`ImmersiveMemory.jsx` reorganizes Relive without changing the R3F scene or World
Labs renderer. Explore fills the viewport; the journal header, sync banners, and
technical badges are hidden. The bottom toolbar opens one right dock at a time.

- SenseShift previews the three atmospheres supported by the existing R3F demo.
- Audio plays the real uploaded recording with native controls.
- Guided journey moves the existing paragraph/photo reader into the right dock.
- Reset camera remounts the viewer at its original camera position. The wrapper
  also passes `cameraResetKey` so a team viewer can implement its own reset later.
- Edit memory and Add Memory use the exact same form as the journal creation page.
  Add Memory retains the current scene/world context but creates a new journal ID.
  Saving returns to Explore, closing the dock; cancel/Escape/back warns if dirty.
- Memory info contains a collapsed Technical details section for debug information
  and a link to the preserved original studio controls.

Desktop panels dock beside the scene and resize it rather than cover it. Mobile
uses a right drawer; the scene remains full screen when the drawer is closed.
Camera and tour details are not active in Explore unless the user opens them.

## Team renderer interface

Both renderers receive the existing `scene`, `memory`, `mood` props plus:

```jsx
mode                 // 'explore' | 'edit'
activeStep           // step index while journey panel is open, otherwise null
cameraResetKey       // incremented when Reset camera is requested
onObjectSelect(obj)  // expects { id, name, ... }; opens the edit dock in Edit mode
onMarkersChange(arr) // array of serializable memory anchors emitted in Edit mode
```

World Labs additionally receives its original `world` prop. No replacement viewer
or custom splat implementation is introduced. The optional JourneyController still
receives memory/steps/activeStep/onStepChange while the journey dock is open.

The existing R3F demo does not emit object-selection or marker-edit callbacks.
These interactions require team wiring in the renderer; the UI does not claim
they are implemented. Marker arrays emitted by the integrated viewer are staged in
`scene.memoryAnchors` and persisted through the existing Save journal entry action.
No backend or 3D internal files were changed to add this interface.
