// Dev only: drive the warp without tapping.
//   1 vertical · 2 horizontal · 3 radial (live) · l live · s scan: open and
//   start, or clear · d down / across
// window.__warp shows the mode, the buffers (frame history depth and size, the
// frozen picture, their GPU memory), the scan's progress and the frame rate,
// plus these actions for tests. Scene.tsx lazy-imports this behind an inline
// NODE_ENV check, so it never reaches production.
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import type { Shape } from "./history.sim";
import {
  buffers,
  getView,
  pickShape,
  quickScan,
  scan,
  setMode,
  setScanDir,
} from "./state";

const SHAPE_KEYS: Record<string, Shape> = {
  "1": "vertical",
  "2": "horizontal",
  "3": "radial",
};

const MB = 1024 * 1024;

const DevKeys = () => {
  const fps = useRef({ value: 0, frames: 0, since: performance.now() });

  useFrame(() => {
    const f = fps.current;
    f.frames += 1;
    const now = performance.now();
    if (now - f.since >= 1000) {
      f.value = (f.frames * 1000) / (now - f.since);
      f.frames = 0;
      f.since = now;
    }
  });

  useEffect(() => {
    const api = {
      get mode() {
        return getView().mode;
      },
      get liveShape() {
        return getView().shape;
      },
      get dir() {
        return scan.dir;
      },
      get phase() {
        return scan.phase;
      },
      get progress() {
        return scan.progress;
      },
      get scans() {
        return scan.count;
      },
      get fps() {
        return Math.round(fps.current.value * 10) / 10;
      },
      get history() {
        const h = buffers.history;
        return h
          ? {
              depth: h.layers,
              width: h.width,
              height: h.height,
              fps: h.fps,
              seconds: h.layers / h.fps,
              mb: Math.round((h.bytes / MB) * 10) / 10,
            }
          : null;
      },
      get frozen() {
        const z = buffers.frozen;
        return z ? { ...z, mb: Math.round((z.bytes / MB) * 10) / 10 } : null;
      },
      shape: pickShape,
      setMode,
      scan: quickScan,
      direction: setScanDir,
    };
    (window as unknown as Record<string, unknown>).__warp = api;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (SHAPE_KEYS[e.key]) pickShape(SHAPE_KEYS[e.key]);
      else if (e.key === "s") quickScan();
      else if (e.key === "l") setMode("live");
      else if (e.key === "d")
        setScanDir(scan.dir === "down" ? "across" : "down");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
};

export default DevKeys;
