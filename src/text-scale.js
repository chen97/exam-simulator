// The user text-size factor — design-system v1.2, tokens.md § type scaling.
//
// Lives in its own module because both App.jsx (which writes --t-scale) and the
// lazily-loaded tweaks panel (which renders the control) need it, and importing
// one from the other would make the lazy chunk pull in the whole app.

// Five discrete steps, never a slider: a slider produces a setting nobody can
// reproduce in a bug report, lands type on arbitrary fractions, and invites a
// user to pick a size no screen was ever checked at. Five steps are five
// states to verify.
//
// 0.875 is the floor and the number that sets it is 24.5 — the icon button is
// 30x28 at factor 1, so at 0.875 it is 26.25x24.5, half a pixel clear of the
// 24x24 target floor. At 0.85 it would be 23.8 and fail.
// 1.5 is the ceiling because above it a 45px control row stops fitting the
// dense nav and palette layouts. A user who needs more wants browser zoom,
// which is a different and better tool — it scales layout too.
export const TEXT_SCALE_STEPS = [
  { value: 0.875, label: "Compact" },
  { value: 1, label: "Default" },
  { value: 1.125, label: "Large" },
  { value: 1.25, label: "Larger" },
  { value: 1.5, label: "Largest" },
];

// Snap an arbitrary number onto the nearest step. Anything unusable (NaN, a
// string, or a value persisted by the old 0.85..1.25 slider) resolves to a
// real step rather than reaching --t-scale as-is.
export function nearestTextScale(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return TEXT_SCALE_STEPS.reduce((best, step) =>
    Math.abs(step.value - n) < Math.abs(best.value - n) ? step : best,
  ).value;
}
