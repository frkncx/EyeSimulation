// Numbers with no published source, chosen for how the simulation looks. Each one says what it does.

export const TUNING = {
  // How the eye's own light adaptation cancels the daylight pupil's effect on brightness as the light falls.
  // The share cancelled is light ** DAY_ADAPTATION_POWER: all of it in full daylight (light 1), none at full
  // night (light 0). At 1 it fades evenly along the Light slider, which is a log scale of the light.
  DAY_ADAPTATION_POWER: 1,
};
