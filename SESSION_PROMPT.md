# Eye Simulation: working rules and next fixes

## Source of truth
- The code in this repo, data/eyes.json, and this file. Do not rely on memory of earlier sessions or earlier prompts. If something here conflicts with the code, ask before changing either.
- The app is an educational eye simulation: pick an eye type and example, see one eye in 3D, change its settings, and see a scene the way that eye would. Keep it that.

## Rules for every change
1. No new limits, caps or clamps unless they are either:
   a) a measured value for a real animal, with the source in a code comment, or
   b) physically required (e.g. a pupil can't be wider than the eye's opening).
   If you think a limit is needed and it is neither, stop and ask. Do not add it.
2. Do not change any measured animal value in data/eyes.json without giving the source and telling me in your reply.
3. Every number in the sight pipeline is either MEASURED (with source) or DISPLAY/TUNING (chosen to make something visible). Move all of them into one file, js/model/constants.js, grouped under those two headings, each with a one-line comment.
4. One fix per commit. Don't refactor or "improve" code unrelated to the task.
5. After each fix, open the app and check: Human, Cat, Owl, Fly at default settings look as before unless the fix is meant to change them.
6. Never push unless I ask: every push to main uploads the page to itch.io (.github/workflows/itch.yml).

## Phones
- Below 1280 px wide the page is the phone layout (tabs: Compare, How it sees, Settings). At 1280 px and wider the desktop layout must stay exactly as it is.
- No sideways scrolling. Buttons and sliders at least 44 px tall (40 px for chips), text at least 14 px.
- After a change that shows on screen, check 375×667, 440×956 (iPhone 16 Pro Max), 956×440 sideways and 1920×1080 desktop.

## Fix 1: Pupil range
**Status (2026-10-29): open.** The code still scales the pupil range with Eye size (pupilRefEyeMm in main.js, rangeFor() in settingsPanel.js, widestPupilMm() in cameraEye.js). The "Bigger eye, finer detail" note is done. Decide before changing.
- Each animal's pupil range is its measured range: data/eyes.json "allowed.pupilMm" for the slider, "darkPupilMm" for the widest in the dark. Human: 2–8 mm.
- These do NOT scale with Eye size. Remove pupilRefEyeMm and the scaling in rangeFor() and sightParams().
- The pupil slider's own max in the settings list = the largest measured pupil among the examples (12.4 mm, cat), not 14.
- Eye size changes how fine a detail the eye resolves and the 3D model's size. It does not widen the pupil.
- Change the note "Bigger eye, more light: …" to "Bigger eye, finer detail: but it takes up more of the head." Night-vision differences between animals come from their measured pupils, rods and tapetum.

## Fix 2: Sharper Enlarge
**Status (2026-10-29): partly done, conflicts with the code.** The view already draws at its shown pixel size (714e509, made before this file), but it also has 1×/2×/4× zoom buttons, which "No zoom buttons" below rules out. Decide which stays.
- Problem: the scene is rendered at 640×400 over 60°, so one pixel is about 5.6 arcminutes, and Enlarge only stretches that small image.
- Enlarge must render the scene at the enlarged view's actual pixel size, showing the same 60° field (no zoom, no cropping). The image is the same, just with more pixels, so detail and blur differences show more clearly.
- Compute all blur (acuity, focus, astigmatism, amblyopia, facets) from angles, not pixels, so it is correct at any render size.
- No zoom buttons.
- Keep DEFOCUS_DISPLAY_GAIN and the other display multipliers as they are for now. Even enlarged, one pixel is about 2 arcminutes, so human-level detail (1 arcminute) still needs them to show.
- Use scene images with enough resolution for the enlarged view.

## Fix 3: Constants file
- Do rule 3 above as its own commit. No behavior change in that commit.
- **Status: done** (fae624f).

## Next, after the fixes
Build the 3D models for Mirror, Pinhole and Cup eyes, one per commit, following the existing type/example data structure. Don't change Camera or Compound while doing it.
- **Status:** Mirror done (e7d46af; its settings and scene view are not built yet). Next: Pinhole (nautilus), then Cup (flatworm).
- Proposed, not approved: the bird pecten (a comb-like part over the blind spot) for the eagle and owl.
