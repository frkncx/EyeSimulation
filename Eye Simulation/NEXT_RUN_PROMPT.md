# Eye Simulation — Next Run: Eye Types Instead of Animals

Change the project in this folder from animal eyes to eye types. Keep everything else as it is. Do not add anything not listed here.

## 1. Top bar: eye types

Replace the eight animal buttons with five eye type buttons:

- **Cup eye**: a shallow pit lined with light sensors. No lens, no image: it only tells light from dark and roughly which direction light comes from.
- **Pinhole eye**: a deep cup with a tiny opening and no lens. Makes a dim, blurry image.
- **Camera eye**: one lens focuses light onto the back of the eye. Default selection.
- **Compound eye**: a dome of many tiny eyes, each seeing one dot of the picture.
- **Mirror eye**: a curved mirror at the back bounces light forward onto the seeing layer.

Same button style as now: large, icon plus name, thick outline and check mark when selected.

## 2. Example dropdown

Under the type buttons, a dropdown labeled "Example:" listing animals that have that eye type. Choosing one only loads different settings onto the same 3D model. No new models per animal.

- Camera eye: Human (default), Cat, Eagle, Octopus, Whale
- Compound eye: Fly (default), Bee
- Mirror eye: Scallop
- Pinhole eye: Nautilus
- Cup eye: Flatworm

The dropdown shows "Custom" only while some setting differs from that example's values; changing it back returns the dropdown to the animal's name. Reset restores the example's settings, the flower garden scene and daylight.

The jumping spider and its tube eye are dropped and not built. Wasp is replaced by Fly and Bee. Cat, Eagle, Octopus and Whale are examples under Camera eye.

## 3. Data structure

Split the data into two lists so adding an animal later is a few lines of data and no code:

- **types**: each has an id, label, its 3D model, the settings that apply to it, and which values each setting allows.
- **examples**: each has an id, label, which type it belongs to, its default settings, and optionally a narrower list of allowed values (for example, an animal that can only have 1 color).

Only a brand-new eye shape needs new code.

## 4. Settings: hide, and lock single options

- Settings that don't apply to the current type or example are hidden, not greyed out.
- If a setting has only one possible value for the current type or example, show just that one button, already selected, and nothing else. Example: an animal that only has 1 color shows a single "1 color" button. Cup and pinhole eyes have no lens, so focus is hidden.
- New type-specific settings:
  - Compound eye: Number of facets (new; build it in the compound eye step).
  - Pinhole eye: Hole size (smaller is sharper but darker).
  - Mirror eye: Mirror curve (deeper curve focuses closer).

## 5. New section: Vision problems

Add a "Vision problems" section in the left panel, directly above the Color vision section (so the red-green colorblind row stays inside Color vision, right below it). Camera eye only; hidden for other types. Each one shows in both the 3D eye and the scene where possible:

- **Nearsighted / Farsighted**: one slider, Nearsighted ← Normal → Farsighted, with strength. 3D: the eyeball gets slightly longer (nearsighted) or shorter (farsighted). Scene: far things blur (nearsighted) or near things blur (farsighted).
- **Astigmatism**: On / Off with a strength slider. 3D: the cornea becomes slightly oval instead of round. Scene: blur stretched in one direction.
- **Amblyopia (lazy eye)**: On / Off with a strength slider. 3D: the eye stays normal, with a short label: "The eye is healthy. The brain gives its signal less weight." Scene: lower sharpness and contrast that focus and glasses can't fix.

## 6. Bee and fly colors

Our color buttons assume a person's red, green and blue. Bees and flies see different colors, so:
- **Bee**: 3 colors, but ultraviolet, blue and green, not red, green and blue. Show it with its own made-up color shift (red looks dark, ultraviolet shown as a made-up color) and the same "Made-up colors" label used for 4 and 5 colors. Never show a bee seeing like a person.
- **Fly**: 4 colors, using the same made-up colors approach.

## 7. Keep as is

The 3D view, cut-open slider, labels, scene panel, light slider and color vision all stay as they work now. Build the Camera eye first with all examples and vision problems working, then add Compound, Mirror, Pinhole and Cup one at a time. Only the Camera eye has a 3D model today; the other four are new.
