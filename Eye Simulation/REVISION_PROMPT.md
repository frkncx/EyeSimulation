# Eye Simulation — Revision Prompt

Revise the project in this folder. Keep it small and simple. Do not add anything that isn't listed here.

## Delete

The creature/skull view, radar chart, cost bars, habitat strip, body and lifespan pickers, the rule banner, the notes list, and any mobile layout.

## What the app does

1. Pick an eye type from big buttons at the top.
2. One eye appears in 3D in the center. Rotate it, zoom it, cut it open.
3. Change a few settings on the left and watch the eye change.
4. Pick a scene on the right and see it the way that eye would.

That's all. No scores, no charts, no extra panels.

## Platform

Web page, PC only (works at 1920×1080 down to 1366×768). Three.js for the 3D eye.

## Layout

```
┌──────────────────────────────────────────────────────┐
│  EYE TYPE BUTTONS                                     │
├────────────┬──────────────────────────┬──────────────┤
│  SETTINGS  │      3D EYE (center)     │  HOW IT SEES │
└────────────┴──────────────────────────┴──────────────┘
```

### Top: eye type buttons
Big buttons (about 140×100 px) with a simple icon and name: Human, Octopus, Jumping spider, Wasp, Scallop, Cat, Eagle, Whale. All working. The selected one has a thick outline and a check mark. A "Reset" button restores the selected eye's defaults.

### Center: the 3D eye
- Only one eye on screen. No head, no body.
- Drag to rotate, scroll to zoom.
- A "Cut open" slider slices the eye to show the inside.
- A "Labels" toggle names each part with plain words (e.g. "lens", "retina", "blind spot"). Hover a part for a one-sentence explanation in everyday language.
- Model each eye type's real shape: camera eye (human, cat, eagle, whale, octopus), long tube eye (jumping spider), dome of many tiny facets (wasp), mirror at the back (scallop).

### Left: settings
Plain names, big buttons and sliders, current value shown. Only show settings that make sense for the selected eye.
- **Eye size** (slider)
- **Retina facing:** Away from light / Toward light (changes whether there's a blind spot)
- **Focus:** near ↔ far (slider)
- **Pupil shape:** Round / Slit / Horizontal
- **Pupil size** (slider)
- **Night reflector (tapetum):** On / Off
- **Number of facets** (wasp only, slider)
- **Color vision:** five big buttons, 1 to 5 color channels, labeled "1 color" through "5 colors". For 3 colors, an extra choice: Normal / Red-green colorblind, with a mild-to-strong slider.

### Right: how it sees
- Thumbnail buttons for sample scenes: flower garden, forest, beach, underwater, night street, fruit bowl. Plus "Load your own image".
- The scene shows large, as seen through the current eye.
- A "Light" slider: day to night.
- The view reflects the settings: blur from size, focus and pupil; a facet mosaic for the wasp; a gap for the blind spot; brighter but glarier at night with the tapetum; colors changed by the color vision setting.
- 4 and 5 color channels can't be shown on a normal screen. Show them with clearly labeled made-up colors for the extra channels, and say so in one short line.

## Look and feel

- Dark background behind the eye, light panels around it.
- Buttons at least 40 px tall, text at least 15 px, high contrast.
- No paragraphs on screen. No technical words without a plain explanation on hover.
- Selected states never rely on color alone.

## Build order

1. Delete the old features and set up the layout.
2. Human eye in 3D with cut-open and labels.
3. Settings working on the human eye.
4. Scene view working for the human eye.
5. Add the other seven eyes one at a time.

Check the page at 1920×1080 and 1366×768 after each step.
