import { describe, expect, it } from "vitest";

import { HISTORY } from "./config";
import {
  createRing,
  delayShare,
  layerAgo,
  nextLayer,
  planHistory,
} from "./history.sim";
import { createScan, stepScan, toggleScan } from "./scan.sim";
import { retarget, stepTween, tween } from "./tween.sim";

describe("history plan", () => {
  it("keeps the long side and the screen's shape", () => {
    const p = planHistory(1280, 720, HISTORY.desktop);
    expect(p.width).toBe(480);
    expect(p.height).toBe(270);
    expect(p.layers).toBe(90);
    expect(p.bytes).toBe(480 * 270 * 4 * 90);
  });

  it("reaches about 3 s back on both tiers", () => {
    expect(HISTORY.desktop.layers / HISTORY.desktop.fps).toBeCloseTo(3, 1);
    expect(HISTORY.phone.layers / HISTORY.phone.fps).toBeCloseTo(3, 1);
  });

  it("fits a portrait phone in under 20 MB", () => {
    const p = planHistory(390, 844, HISTORY.phone);
    expect(p.height).toBe(360);
    expect(p.bytes / (1024 * 1024)).toBeLessThan(20);
  });

  it("never asks for more layers than the GPU has", () => {
    expect(planHistory(100, 100, HISTORY.desktop, 64).layers).toBe(64);
  });
});

describe("ring", () => {
  it("keeps frames at a steady rate", () => {
    const ring = createRing(4);
    const fps = 10;
    let stored = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      if (nextLayer(ring, t, fps) >= 0) stored += 1;
    }
    expect(stored).toBeGreaterThanOrEqual(9);
    expect(stored).toBeLessThanOrEqual(11);
    expect(ring.filled).toBe(4);
  });

  it("finds older frames behind the newest and clamps to what is filled", () => {
    const ring = createRing(4);
    for (let i = 0; i < 6; i += 1) nextLayer(ring, i, 1);
    // Written 0,1,2,3,0,1: the newest is layer 1.
    expect(ring.newest).toBe(1);
    expect(layerAgo(ring, 0)).toBe(1);
    expect(layerAgo(ring, 1)).toBe(0);
    expect(layerAgo(ring, 2)).toBe(3);
    expect(layerAgo(ring, 9)).toBe(2);

    const young = createRing(8);
    nextLayer(young, 0, 1);
    nextLayer(young, 1, 1);
    expect(layerAgo(young, 5)).toBe(0);
  });
});

describe("delay across the picture", () => {
  it("vertical: top is now, bottom the past", () => {
    expect(delayShare("vertical", 0.3, 0, 1)).toBe(0);
    expect(delayShare("vertical", 0.3, 1, 1)).toBe(1);
  });
  it("horizontal: left is now, right the past", () => {
    expect(delayShare("horizontal", 0, 0.5, 1)).toBe(0);
    expect(delayShare("horizontal", 1, 0.5, 1)).toBe(1);
  });
  it("radial: centre is now, corners the past", () => {
    expect(delayShare("radial", 0.5, 0.5, 0.5)).toBe(0);
    expect(delayShare("radial", 0, 0, 0.5)).toBeCloseTo(1);
    expect(delayShare("radial", 1, 0.5, 0.5)).toBeLessThan(1);
  });
});

describe("scan", () => {
  it("sweeps in the set time, handing back touching bands", () => {
    const scan = createScan();
    toggleScan(scan);
    expect(scan.phase).toBe("running");
    let last = 0;
    let steps = 0;
    while (scan.phase === "running") {
      const band = stepScan(scan, 1 / 30, 7);
      expect(band).not.toBeNull();
      expect(band![0]).toBe(last);
      [, last] = band!;
      steps += 1;
    }
    expect(scan.phase).toBe("done");
    expect(scan.progress).toBe(1);
    expect(steps).toBeGreaterThanOrEqual(209);
    expect(steps).toBeLessThanOrEqual(211);
  });

  it("keeps its pace after a stall", () => {
    const scan = createScan();
    toggleScan(scan);
    stepScan(scan, 5, 7);
    expect(scan.progress).toBeCloseTo(0.1 / 7);
  });

  it("the button clears a running or finished scan", () => {
    const scan = createScan();
    toggleScan(scan);
    toggleScan(scan);
    expect(scan.phase).toBe("idle");
    toggleScan(scan);
    while (scan.phase === "running") stepScan(scan, 0.1, 1);
    toggleScan(scan);
    expect(scan.phase).toBe("idle");
    expect(stepScan(scan, 0.1, 1)).toBeNull();
  });
});

describe("tween", () => {
  it("eases out to the target without overshoot", () => {
    const tw = tween(0, 1);
    retarget(tw, 1);
    let prev = 0;
    for (let i = 0; i < 20; i += 1) {
      const v = stepTween(tw, 0.1);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(prev).toBe(1);
  });
});
