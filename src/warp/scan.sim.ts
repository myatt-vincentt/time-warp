// The scan's timeline: ready → sweeping → done, and back to ready on clear.
// Each step hands back the band of the screen the line passed this frame, so
// the picture there can be frozen. Pure, so it is tested without a GPU.

export type ScanPhase = "idle" | "running" | "done";
export type ScanDir = "down" | "across";

export type Scan = {
  phase: ScanPhase;
  dir: ScanDir;
  /** Where the line is: 0 at the top (or left) to 1 at the bottom (or right). */
  progress: number;
  /** Scans started so far. */
  count: number;
};

export const createScan = (): Scan => ({
  phase: "idle",
  dir: "down",
  progress: 0,
  count: 0,
});

export const startScan = (scan: Scan) => {
  scan.phase = "running";
  scan.progress = 0;
  scan.count += 1;
};

export const clearScan = (scan: Scan) => {
  scan.phase = "idle";
  scan.progress = 0;
};

/** The scan button: start when ready, otherwise clear. */
export const toggleScan = (scan: Scan) => {
  if (scan.phase === "idle") startScan(scan);
  else clearScan(scan);
};

/** Longest step (s): after a stall the line keeps its pace instead of jumping. */
const MAX_STEP = 0.1;

/**
 * Move the line on by `dt` seconds of a `duration`-second sweep. Returns the
 * band it passed, [from, to] (0..1 along the sweep), or null when not sweeping.
 */
export const stepScan = (
  scan: Scan,
  dt: number,
  duration: number,
): [number, number] | null => {
  if (scan.phase !== "running") return null;
  const from = scan.progress;
  const to = Math.min(1, from + Math.min(dt, MAX_STEP) / duration);
  scan.progress = to;
  if (to >= 1) scan.phase = "done";
  return [from, to];
};
