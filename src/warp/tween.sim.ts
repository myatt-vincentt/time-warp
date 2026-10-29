// A value that eases out toward a target over a fixed time (strict ease-out,
// never an overshoot). Pure, so it is tested without a GPU.

export const easeOut = (x: number) =>
  1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

export type Tween = { from: number; to: number; t: number; dur: number };

/** A tween resting at `v`. */
export const tween = (v: number, dur: number): Tween => ({
  from: v,
  to: v,
  t: dur,
  dur,
});

export const tweenValue = (tw: Tween) =>
  tw.from + (tw.to - tw.from) * easeOut(tw.t / tw.dur);

/** Head for `to` from wherever the value is now, over `dur` seconds. */
export const retarget = (tw: Tween, to: number, dur = tw.dur) => {
  if (tw.to === to) return;
  tw.from = tweenValue(tw);
  tw.to = to;
  tw.t = 0;
  tw.dur = dur;
};

/** Advance by `dt` seconds and return the value. */
export const stepTween = (tw: Tween, dt: number) => {
  tw.t = Math.min(tw.dur, tw.t + dt);
  return tweenValue(tw);
};
