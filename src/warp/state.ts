// What the controls show and the picture follows: the live shape or the scan,
// the scan's direction and phase. A tiny store the controls read with
// useSyncExternalStore; the picture reads it every frame.
import { useSyncExternalStore } from "react";

import type { HistoryPlan, Shape } from "./history.sim";
import {
  clearScan,
  createScan,
  startScan,
  toggleScan,
  type ScanDir,
  type ScanPhase,
} from "./scan.sim";

/** Live: the whole picture warps in a shape. Scan: a line freezes you as it passes. */
export type Mode = "live" | "scan";

export type View = {
  mode: Mode;
  /** The live shape (kept while in the scan). */
  shape: Shape;
  dir: ScanDir;
  phase: ScanPhase;
  /** The scan mode has been opened at least once. */
  visitedScan: boolean;
  /** A scan has been started at least once (the hint is gone). */
  scanned: boolean;
};

/** The scan's timeline, stepped by the picture each frame. */
export const scan = createScan();

/** Sizes of the GPU buffers, filled in by the picture (for the dev hook). */
export const buffers: {
  history: HistoryPlan | null;
  frozen: { width: number; height: number; bytes: number } | null;
} = { history: null, frozen: null };

let view: View = {
  mode: "live",
  shape: "vertical",
  dir: scan.dir,
  phase: scan.phase,
  visitedScan: false,
  scanned: false,
};
const listeners = new Set<() => void>();

const publish = (patch: Partial<View> = {}) => {
  view = { ...view, ...patch, dir: scan.dir, phase: scan.phase };
  listeners.forEach((fn) => fn());
};

export const getView = () => view;

/** Switch between the live warp and the scan (leaving the scan clears it). */
export const setMode = (mode: Mode) => {
  if (mode === view.mode) return;
  clearScan(scan);
  publish({ mode, visitedScan: view.visitedScan || mode === "scan" });
};

/** Pick a live shape (this switches to the live warp). */
export const pickShape = (shape: Shape) => {
  clearScan(scan);
  publish({ mode: "live", shape });
};

/** The scan button: starts a scan when ready, otherwise clears it. */
export const pressScan = () => {
  if (view.mode !== "scan") return;
  toggleScan(scan);
  publish({ scanned: view.scanned || scan.phase === "running" });
};

/** Open the scan and start one straight away (dev keys and tests). */
export const quickScan = () => {
  if (view.mode !== "scan") {
    setMode("scan");
    startScan(scan);
    publish({ scanned: true });
  } else pressScan();
};

/** Pick the sweep direction (not while the line is sweeping); a held scan is cleared. */
export const setScanDir = (dir: ScanDir) => {
  if (dir === scan.dir || scan.phase === "running") return;
  clearScan(scan);
  scan.dir = dir;
  publish();
};

/** Drop the scan (the picture changed size, so the frozen part is gone). */
export const cancelScan = () => {
  if (scan.phase === "idle") return;
  clearScan(scan);
  publish();
};

/** The picture calls this when the line reaches the end. */
export const scanFinished = () => publish();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const useView = () => useSyncExternalStore(subscribe, getView, getView);
