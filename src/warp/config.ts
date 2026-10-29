// Tuning for Time Warp.

/**
 * The frame history the live warp reads from: the last few seconds of the
 * camera, kept small. Phones keep fewer, smaller frames to save GPU memory;
 * both reach about 3 s back.
 */
export const HISTORY = {
  desktop: {
    /** Frames kept. */
    layers: 90,
    /**
     * Capture rate (fps): layers / fps is how far back the warp reaches. At
     * most the camera's own rate, so few frames are stored twice.
     */
    fps: 30,
    /** The long side of a stored frame (px); the short side follows the screen. */
    longSide: 480,
  },
  phone: {
    layers: 72,
    fps: 24,
    longSide: 360,
  },
};

/** The live warp: where on screen shows "now" and where the past. */
export const WARP = {
  /**
   * How the delay grows across the picture: delay = t^curve, with t from 0
   * (now) to 1 (the oldest frame). A little above 1 keeps more of the picture
   * close to now, so the far edge stretches the most.
   */
  curve: 1.3,
  /** Radial: the centre of "now", as a share of the width and height from the top left. */
  radialCentre: [0.5, 0.42] as const,
  /** Switching shapes morphs one into the next over this long (s, ease-out). */
  morph: 0.45,
  /** Leaving or entering the scan fades the warp out or in over this long (s). */
  fade: 0.35,
};

/** The scan: a glowing line sweeps the screen and freezes what it passes. */
export const SCAN = {
  /** One sweep, top to bottom or left to right (s). */
  duration: 7,
  /** The line's colour (Arles), its core width and its glow reach (CSS px). */
  color: "#f4d968",
  width: 3,
  glow: 26,
  /** How strong the glow is next to the core (0..1). */
  glowStrength: 0.75,
  /** At the end the line fades out over this long (s, ease-out). */
  lineFade: 0.6,
  /** Clearing fades the frozen picture back to live over this long (s). */
  clearFade: 0.3,
  /** The frozen picture is kept at most this many px on its long side. */
  frozenLongSide: 1440,
};
