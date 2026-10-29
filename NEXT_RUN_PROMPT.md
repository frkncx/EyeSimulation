# Eye Simulation — Next Run: Eye Types Instead of Animals

> **Status (2026-10-29): built.** Kept as a record of the plan. SESSION_PROMPT.md holds the current rules and next steps. Where this file and the code differ, the code is current (for example: Owl, Owl monkey and Moth were added as examples, and the spectrum bar sits in the header, not in the Color vision section).

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

## 7. Light spectrum bar

A horizontal bar inside the Color vision section, under the color buttons. It is both a readout and a control: it always shows what the current eye can see, and dragging it changes the eye. The spectrum bar and the color buttons are two views of the same thing and must always agree.

### What it shows
- A scale from **300 nm (UV)** through the visible rainbow to **800 nm (IR)**, labeled "UV", "Visible to humans" (about 400–700 nm) and "IR" in plain words.
- The range this eye can see is highlighted, with a handle at each end.
- One small marker per color sensor at the wavelength where it is most sensitive, with its sensitivity curve drawn faintly above the bar.
- Beyond 800 nm: shaded, labeled "No eye sees here", because longer light is too weak to tell apart from the eye's own body heat. Animals that sense heat, like some snakes, use separate pit organs, not eyes. Below 300 nm: shaded, labeled "Mostly blocked by the air, and damaging". Handles cannot enter these zones.

### The science behind the link (implement as these rules)
Every color sensor responds to a band of light, not one wavelength. Its curve is roughly 150 nm wide at the base. So:
- **The visible range comes from the sensors:** it runs from about 75 nm below the bluest sensor's peak to about 75 nm above the reddest sensor's peak.
- **Sensors can't be too close:** peaks closer than about 25 nm give nearly the same signal, so the colors between them can barely be told apart. This is what red-green colorblindness is: the green and red sensors squeezed together.
- **Sensors can't be too far apart:** peaks more than about 130 nm apart leave a dim gap in the middle where neither sensor responds well.

That gives each number of sensors a range of possible widths:

| Color sensors | Possible visible width |
|---|---|
| 1 | about 150 nm (sees light across that band, but no colors) |
| 2 | 175–280 nm |
| 3 | 200–410 nm |
| 4 | 225–500 nm |
| 5 | 250–500 nm (the full 300–800 nm bar) |

### Two-way behavior
- **Clicking a color button** resizes the highlighted range to a typical width for that many sensors, keeping it centered where it was, and spreads the markers evenly inside it.
- **Dragging a handle** keeps the same number of sensors and spreads them across the new range. If the range gets too narrow for that many sensors, the number drops; if it gets too wide, the number rises. When this happens, the matching color button switches automatically and a short note appears, for example: "Too narrow for 3 sensors, so this eye now has 2."
- **Spacing is visible in the scene:** spreading sensors wider shows more of the spectrum but blurs the colors between them; squeezing them shows fewer wavelengths but finer differences there.
- **Red-green colorblind** is the same mechanism: turning it on slides the two reddest markers toward each other, and the strength slider sets how close they get. Mild = close, strong = merged into one.
- **UV:** when the lower end goes below 400 nm, the eye's UV-blocking lens is switched off automatically (and back on when it returns above 400). UV in the scene shows in made-up colors with the "Made-up colors" label.
- **UV shows in the 3D eye:** with the UV-blocking lens on, the lens has a faint yellow tint and a few violet "UV" arrows stop at the lens. When the range goes below 400 nm, the lens turns clear, the UV arrows pass through to the back of the eye, and the retina gets a soft violet highlight with the label: "Seeing UV: the retina is exposed to light that damages it over a lifetime." This is how many short-lived UV-seeing animals live; long-lived humans keep the yellow filter. Applies to eyes with a lens (camera, compound, mirror); cup and pinhole eyes show the arrows reaching the retina at all times.
- **IR:** when the upper end goes past 700 nm, near-infrared in the scene shows in made-up colors with the same label.
- **IR has its own costs, shown in the eye and the scene:** when the upper end goes past 700 nm:
  - 3D eye: a few red "IR" arrows reach the retina, and the reddest sensor marker is relabeled "Red-shifted pigment" (real eyes reach further red by changing their light-catching molecule, as some fish do).
  - Scene: grainy noise grows the further the range extends into IR. Label: "Body heat sets off red-tuned sensors by mistake, adding noise." Cold-blooded examples (fish-like settings) get less noise than warm-blooded ones; for simplicity, all current examples count as warm-blooded except Octopus, Scallop, Nautilus, Flatworm, Fly and Bee.
  - Scene: IR parts of the image are slightly blurrier than the rest, because longer light spreads more through the same size pupil. Label: "Longer light blurs more. A bigger pupil helps."
- **Locked examples:** following the single-option rule, if an example's range is fixed, the handles are locked and only the readout shows.

### Example values (sensor peaks in nm)
- Human: 420, 530, 560
- Cat: 450, 555
- Eagle: 405, 450, 510, 570 (sees violet, not much UV)
- Octopus: 475
- Whale: about 485 (single dim-light sensor)
- Fly: 330, 440, 480, 530
- Bee: 345, 435, 545
- Scallop, Nautilus, Flatworm: single sensor near 480–500

### Scenes
Normal photos only record red, green and blue, so they contain nothing beyond the visible range. Give each sample scene hand-painted UV and IR layers: nectar guides on flowers and markings on some butterflies in UV; leaves and grass bright in near-infrared. For the user's own images, show a short note that UV and IR can't be shown because the photo doesn't contain them.

## 8. Keep as is

The 3D view, cut-open slider, labels, scene panel, light slider and color vision all stay as they work now. Build the Camera eye first with all examples and vision problems working, then add Compound, Mirror, Pinhole and Cup one at a time. Only the Camera eye has a 3D model today; the other four are new.
