# Eye Simulation

Pick an eye type, look at it in 3D, change a few settings, and see a scene the way that eye would.

Play it at <https://furkancx.itch.io/eye-simulation>.

- **Top:** eye type buttons (Cup, Pinhole, Camera, Compound, Mirror), an Example dropdown with the animals
  for that type (Human, Cat, Eagle, Octopus, Whale, Owl, Owl monkey, Jumping spider; Fly, Bee, Moth, Ant; Scallop; Nautilus;
  Flatworm), the light spectrum bar (drag its ends to change what the eye sees), and Reset.
- **Center:** one eye in 3D. Drag to rotate, scroll to zoom, "Cut open" slider, "Labels" toggle,
  and UV/IR buttons that show light rays entering the eye. Hover a part to learn what it does.
- **Left:** settings for the selected eye.
- **Right:** sample scenes (or your own image) as seen through that eye, with Light and Focus sliders
  and a sharpness readout.

On phones the sections become tabs: Compare (the 3D eye with a small live view and one setting at a time,
in a sheet you can pull down for a full 3D view), How it sees, and Settings. Tap a name or part for its tip.

The 3D eye uses Three.js, loaded from a CDN, so the page needs internet.

## Running it

Every push to `main` uploads the page to itch.io (`.github/workflows/itch.yml`).

To run it locally: ES modules and `fetch()` don't work from `file://`, so start the bundled zero-dependency server:

```bash
node serve.js
```

Then open <http://localhost:5173>.

## Files

```
index.html             page: eye types and spectrum on top; settings | 3D eye | how it sees; phone tab bar
serve.js               tiny static server (no npm install needed)
css/styles.css         layout and look (selected = thick outline + ✓, never color alone); phone layout below 1280px
data/eyes.json         the settings, the five eye types (model, settings, allowed values), the example
                       animals (type, defaults, narrower allowed values) and the part names/hover tips.
                       A new animal is a few lines in "examples"; only a new eye shape needs code.
js/
  main.js              loads data, keeps one store, wires the page
  state.js             tiny observable store
  eye3d/eyeStage.js    Three.js view: rotate/zoom, cut-open plane, labels, hover and tap tips
  eye3d/cameraEye.js   the camera eye's parts, built in millimeters (human first)
  eye3d/compoundEye.js the compound eye: facets, light guides and sensors (fly first)
  eye3d/mirrorEye.js   the mirror eye: a curved mirror behind two retinas (bay scallop)
  model/constants.js   every number the sight pipeline uses, marked MEASURED (with source) or TUNING
  model/optics.js      focus blur math
  model/spectrum.js    the light range an eye sees, from its color sensors
  ui/eyeIcons.js       line icons for the eye buttons
  ui/settingsPanel.js  left panel: sliders and buttons built from eyes.json, only the ones that fit the eye
  ui/sightPanel.js     right panel: scene buttons, own image, the view, Light slider, sharpness
  ui/spectrumBar.js    the spectrum bar in the header, with draggable ends
  ui/phoneMenus.js     phone layout: tab bar, eye type list, Compare sheet with setting chips
  ui/tips.js           hover/focus/tap tooltip for anything with a plain-word tip
  ui/glossary.js       safe text for HTML built from data
  scenes/scenes.js     the six scenes, painted in layers at different distances
  scenes/earthOutlines.js  coastlines for "Earth from orbit", traced from NASA Earth Observatory's Blue Marble
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
5. Compound eye (fly, bee, moth) in 3D, with settings and scene view. ✓
6. Mirror eye (scallop) in 3D. ✓ Its settings and scene view come later.
7. Phone layout. ✓
8. Pinhole eye (nautilus) and cup eye (flatworm).
