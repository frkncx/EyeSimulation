# Eye Simulation

Pick an eye type, look at it in 3D, change a few settings, and see a scene the way that eye would.

- **Top:** eye type buttons (Human, Octopus, Jumping spider, Wasp, Scallop, Cat, Eagle, Whale) and Reset.
- **Center:** one eye in 3D. Drag to rotate, scroll to zoom, "Cut open" slider, "Labels" toggle.
- **Left:** settings for the selected eye.
- **Right:** sample scenes (or your own image) as seen through that eye, with a day-to-night Light slider.

PC only, 1366×768 to 1920×1080. The 3D eye uses Three.js, loaded from a CDN, so the page needs internet.

## Running it

ES modules and `fetch()` don't work from `file://`. Start the bundled zero-dependency server:

```bash
node serve.js
```

Then open <http://localhost:5173>.

## Files

```
index.html             page: eye buttons on top; settings | 3D eye | how it sees
serve.js               tiny static server (no npm install needed)
css/styles.css         layout and look (selected = thick outline + ✓, never color alone)
data/eyes.json         the eight eye types (name, shape, hint, defaults) and the part names/hover tips
js/
  main.js              loads data, keeps one store, wires the page
  state.js             tiny observable store
  eye3d/eyeStage.js    Three.js view: rotate/zoom, cut-open plane, labels, hover tips
  eye3d/cameraEye.js   the camera eye's parts, built in millimeters (human first)
  ui/eyeIcons.js       line icons for the eye buttons
  ui/settingsPanel.js  left panel: sliders and buttons built from eyes.json, only the ones that fit the eye
  ui/tips.js           hover/focus tooltip for anything with a plain-word tip
  ui/sightPanel.js     right panel: scene buttons, own image, the view, Light slider
  ui/glossary.js       hover explanations for words
  model/optics.js      focus blur math
  scenes/scenes.js     the six scenes, painted in layers at different distances
  scenes/paint.js      small painting helpers
  sight/sightPipeline.js  scene as the eye sees it: blur, light, colors, glare, blind spot
  sight/colorVision.js 1 to 5 colors (red-green colorblindness from Machado et al. 2009)
  sight/imageOps.js    blur and color helpers
```

## Build order

1. Remove the old features and set up the layout. ✓
2. Human eye in 3D with cut-open and labels. ✓
3. Settings working on the human eye. ✓
4. Scene view working for the human eye. ✓
5. Add the other seven eyes one at a time.
