// The frame history: how big it is, when to keep a frame, and which stored
// frame shows "f frames ago". Pure, so it is tested without a GPU.

export type HistoryPlan = {
  /** Frame size (px) and how many frames are kept. */
  width: number;
  height: number;
  layers: number;
  /** Capture rate (fps). */
  fps: number;
  /** GPU memory of the whole history (bytes, 4 per pixel). */
  bytes: number;
};

/**
 * Size the history for a screen: the long side is `longSide`, the short side
 * follows the screen's shape, and no more layers than the GPU allows.
 */
export const planHistory = (
  screenWidth: number,
  screenHeight: number,
  tier: { layers: number; fps: number; longSide: number },
  maxLayers = 256,
): HistoryPlan => {
  const w = Math.max(1, screenWidth);
  const h = Math.max(1, screenHeight);
  const scale = tier.longSide / Math.max(w, h);
  const width = Math.max(2, Math.round(w * scale));
  const height = Math.max(2, Math.round(h * scale));
  const layers = Math.max(2, Math.min(tier.layers, maxLayers));
  return {
    width,
    height,
    layers,
    fps: tier.fps,
    bytes: width * height * 4 * layers,
  };
};

/** The ring of stored frames: which layer is newest and how many are filled. */
export type Ring = {
  layers: number;
  /** The layer written last (−1 before the first). */
  newest: number;
  /** Frames stored so far (up to `layers`). */
  filled: number;
  /** When the next frame is due (s). */
  nextAt: number;
};

export const createRing = (layers: number): Ring => ({
  layers,
  newest: -1,
  filled: 0,
  nextAt: 0,
});

/**
 * The layer to store this frame in, or −1 when no frame is due yet. Frames are
 * kept at a steady rate whatever the display's refresh; after a stall the
 * schedule restarts instead of catching up.
 */
export const nextLayer = (ring: Ring, now: number, fps: number): number => {
  if (now < ring.nextAt) return -1;
  const step = 1 / fps;
  ring.nextAt = now - ring.nextAt > step ? now + step : ring.nextAt + step;
  ring.newest = (ring.newest + 1) % ring.layers;
  ring.filled = Math.min(ring.layers, ring.filled + 1);
  return ring.newest;
};

/**
 * The stored layer holding the frame `k` captures before the newest
 * (k = 0 is the newest), clamped to what is filled. Mirrors the shader.
 */
export const layerAgo = (ring: Ring, k: number): number => {
  const kk = Math.max(0, Math.min(Math.floor(k), ring.filled - 1));
  return (((ring.newest - kk) % ring.layers) + ring.layers) % ring.layers;
};

export type Shape = "vertical" | "horizontal" | "radial";

/**
 * How far back a screen point looks, 0 (now) to 1 (the oldest frame), before
 * the curve. `u`, `v` run 0..1 from the top left. Mirrors the shader.
 *   vertical    top is now, the bottom is the past
 *   horizontal  left is now, the right is the past
 *   radial      the centre is now, the corners are the past
 */
export const delayShare = (
  shape: Shape,
  u: number,
  v: number,
  aspect: number,
  centre: readonly [number, number] = [0.5, 0.5],
): number => {
  if (shape === "vertical") return Math.min(1, Math.max(0, v));
  if (shape === "horizontal") return Math.min(1, Math.max(0, u));
  const [cu, cv] = centre;
  const far = Math.hypot(Math.max(cu, 1 - cu) * aspect, Math.max(cv, 1 - cv));
  return Math.min(1, Math.hypot((u - cu) * aspect, v - cv) / far);
};
