// Time Warp's picture: one full-screen layer over the camera.
//
// Live warp: every frame (at a steady rate) the camera is stored, small, into
// one layer of a texture array, a ring of the last ~3 s. Each screen point
// looks back by an amount set by where it is (top / left / centre is now, the
// far edge is the oldest frame) and blends the two nearest stored frames, so
// the delay changes smoothly across the picture instead of in bands. Where the
// delay is under one frame it shows the full-sharpness live camera.
//
// Scan: a glowing line sweeps down (or across). Each frame the band the line
// just passed is copied from the live picture into a frozen picture; behind
// the line the screen shows that frozen picture, ahead of it the live camera.
// So whatever moved with the line is stretched, bent or cloned.
//
// Feed space equals screen UV (the SDK cover-crops and mirrors the camera to
// the render size), so one UV addresses the camera, the history and the
// frozen picture alike. The layer draws straight to clip space, after the
// video background.
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  Vector2,
  WebGLArrayRenderTarget,
  WebGLRenderTarget,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useXRCameraTexture } from "@vincentt-xr/sdk/low-level";

import { HISTORY, SCAN, WARP } from "./config";
import { createRing, nextLayer, planHistory, type Shape } from "./history.sim";
import { stepScan } from "./scan.sim";
import { retarget, stepTween, tween, tweenValue } from "./tween.sim";
import { buffers, cancelScan, getView, scan, scanFinished } from "./state";

const SHAPE_INDEX: Record<Shape, number> = {
  vertical: 0,
  horizontal: 1,
  radial: 2,
};

// Shaders run as GLSL ES 3.0 (three's default on WebGL2), so sampler2DArray
// and textureLod work without the GLSL3 flag.
const SRGB = /* glsl */ `
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 fromSrgb(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
`;

const passVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Store the camera, sRGB-encoded so 8 bits keep the shadows. */
const captureFrag = /* glsl */ `
  uniform sampler2D uCamera;
  uniform float uCameraLinear;
  varying vec2 vUv;
  ${SRGB}
  void main() {
    vec3 c = textureLod(uCamera, vUv, 0.0).rgb;
    if (uCameraLinear > 0.5) c = toSrgb(c);
    gl_FragColor = vec4(c, 1.0);
  }
`;

/**
 * The picture. Built twice: as the screen layer, and (WRITE) as the pass that
 * copies the band the scan line just passed into the frozen picture.
 */
const pictureFrag = /* glsl */ `
  precision highp sampler2DArray;
  uniform sampler2D uCamera;
  uniform float uCameraLinear;
  uniform sampler2DArray uHistory;
  uniform float uNewest;
  uniform float uFilled;
  uniform float uLayers;
  uniform float uShapeA;
  uniform float uShapeB;
  uniform float uMorph;
  uniform float uAmount;
  uniform float uCurve;
  uniform float uAspect;
  uniform vec2 uCentre;
  uniform float uScanDir;
  uniform vec2 uBand;
  uniform sampler2D uFrozen;
  uniform float uScanShow;
  uniform float uScanProgress;
  uniform float uLineAlpha;
  uniform vec3 uLineColor;
  uniform vec2 uScreen;
  uniform float uLineWidth;
  uniform float uGlow;
  uniform float uGlowStrength;
  varying vec2 vUv;
  ${SRGB}

  vec3 camera(vec2 uv) {
    vec3 c = textureLod(uCamera, uv, 0.0).rgb;
    return uCameraLinear > 0.5 ? c : fromSrgb(c);
  }
  // The stored frame k captures before the newest.
  vec3 stored(vec2 uv, float k) {
    float layer = mod(uNewest - k + uLayers, uLayers);
    return fromSrgb(textureLod(uHistory, vec3(uv, layer), 0.0).rgb);
  }
  // How far back this point looks, 0 (now) to 1 (oldest), for one shape.
  float share(float shape, vec2 uv) {
    if (shape < 0.5) return 1.0 - uv.y;
    if (shape < 1.5) return uv.x;
    vec2 d = vec2((uv.x - uCentre.x) * uAspect, uv.y - uCentre.y);
    vec2 far = vec2(max(uCentre.x, 1.0 - uCentre.x) * uAspect, max(uCentre.y, 1.0 - uCentre.y));
    return clamp(length(d) / length(far), 0.0, 1.0);
  }
  // Frame j of the history: 0 is the live camera, j ≥ 1 the stored frame
  // j − 1 captures before the newest (clamped to what is stored).
  vec3 frameAt(vec2 uv, float j) {
    j = clamp(j, 0.0, uFilled);
    return j < 0.5 ? camera(uv) : stored(uv, j - 1.0);
  }
  // The live picture, time-displaced: f frames ago. Blended over the two
  // nearest frames and softened over their neighbours (a 1-2-1 tent), so a
  // camera frame stored twice doesn't leave a step in the picture.
  vec3 warped(vec2 uv) {
    float t = clamp(mix(share(uShapeA, uv), share(uShapeB, uv), uMorph), 0.0, 1.0);
    float f = min(pow(t, uCurve) * uLayers * uAmount, uFilled);
    if (f <= 0.0) return camera(uv);
    float k = floor(f);
    float a = f - k;
    vec3 p = frameAt(uv, k - 1.0);
    vec3 q = frameAt(uv, k);
    vec3 r = frameAt(uv, k + 1.0);
    vec3 n = frameAt(uv, k + 2.0);
    return 0.25 * mix(p, q, a) + 0.5 * mix(q, r, a) + 0.25 * mix(r, n, a);
  }

  void main() {
    // Along the sweep: 0 at the top (or left) to 1 at the bottom (or right).
    float s = uScanDir < 0.5 ? 1.0 - vUv.y : vUv.x;
    vec3 col = warped(vUv);
  #ifdef WRITE
    if (s < uBand.x || s > uBand.y) discard;
    gl_FragColor = vec4(toSrgb(col), 1.0);
  #else
    if (uScanShow > 0.0 && s <= uScanProgress) {
      col = mix(col, fromSrgb(textureLod(uFrozen, vUv, 0.0).rgb), uScanShow);
    }
    if (uLineAlpha > 0.0) {
      float d = abs(s - uScanProgress) * (uScanDir < 0.5 ? uScreen.y : uScreen.x);
      float sigma = uGlow * 0.4;
      float glow = exp(-(d * d) / (2.0 * sigma * sigma)) * uGlowStrength;
      float core = 1.0 - smoothstep(uLineWidth * 0.5, uLineWidth * 0.5 + 1.0, d);
      col += uLineColor * glow * uLineAlpha;
      col = mix(col, mix(uLineColor, vec3(1.0), 0.45), core * uLineAlpha);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  #endif
  }
`;

/** An sRGB-tagged texture is decoded to linear when sampled. */
const samplesLinear = (tex: Texture | null | undefined) =>
  !!tex && tex.colorSpace === SRGBColorSpace;

/** Phones keep a smaller history (dev: `?history=phone` or `?history=desktop`). */
const historyTier = () => {
  if (process.env.NODE_ENV !== "production") {
    const forced = new URLSearchParams(window.location.search).get("history");
    if (forced === "phone" || forced === "desktop") return HISTORY[forced];
  }
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return coarse ? HISTORY.phone : HISTORY.desktop;
};

export const WarpLayers = () => {
  const { gl, size } = useThree();
  const cameraTexture = useXRCameraTexture();

  // The history: rebuilt only when the screen's shape changes noticeably.
  const aspectKey = Math.round((size.width / Math.max(1, size.height)) * 20);
  const { history, plan, ring } = useMemo(() => {
    const ctx = gl.getContext() as WebGL2RenderingContext;
    const maxLayers = Number(ctx.getParameter(ctx.MAX_ARRAY_TEXTURE_LAYERS));
    const p = planHistory(size.width, size.height, historyTier(), maxLayers);
    const rt = new WebGLArrayRenderTarget(p.width, p.height, p.layers, {
      depthBuffer: false,
    });
    // Stored sRGB-encoded by the capture pass; three must not convert it.
    rt.texture.colorSpace = NoColorSpace;
    return { history: rt, plan: p, ring: createRing(p.layers) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, aspectKey]);

  // The frozen picture: the screen's size, capped.
  const dpr = gl.getPixelRatio();
  const frozenSize = useMemo(() => {
    const w = size.width * dpr;
    const h = size.height * dpr;
    const scale = Math.min(1, SCAN.frozenLongSide / Math.max(w, h, 1));
    return {
      width: Math.max(2, Math.round(w * scale)),
      height: Math.max(2, Math.round(h * scale)),
    };
  }, [size.width, size.height, dpr]);
  const frozen = useMemo(() => {
    const rt = new WebGLRenderTarget(frozenSize.width, frozenSize.height, {
      depthBuffer: false,
    });
    rt.texture.colorSpace = NoColorSpace;
    return rt;
  }, [frozenSize]);

  const passes = useMemo(() => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new PlaneGeometry(2, 2);
    const capture = new ShaderMaterial({
      uniforms: { uCamera: { value: null }, uCameraLinear: { value: 0 } },
      vertexShader: passVert,
      fragmentShader: captureFrag,
      depthTest: false,
      depthWrite: false,
    });
    const captureScene = new Scene();
    const captureMesh = new Mesh(quad, capture);
    captureMesh.frustumCulled = false;
    captureScene.add(captureMesh);

    // One set of uniforms, shared by the screen layer and the write pass.
    const uniforms = {
      uCamera: { value: null as Texture | null },
      uCameraLinear: { value: 0 },
      uHistory: { value: null as Texture | null },
      uNewest: { value: 0 },
      uFilled: { value: 0 },
      uLayers: { value: 1 },
      uShapeA: { value: 0 },
      uShapeB: { value: 0 },
      uMorph: { value: 1 },
      uAmount: { value: 1 },
      uCurve: { value: WARP.curve },
      uAspect: { value: 1 },
      uCentre: {
        value: new Vector2(WARP.radialCentre[0], 1 - WARP.radialCentre[1]),
      },
      uScanDir: { value: 0 },
      uBand: { value: new Vector2() },
      uFrozen: { value: null as Texture | null },
      uScanShow: { value: 0 },
      uScanProgress: { value: 0 },
      uLineAlpha: { value: 0 },
      uLineColor: { value: new Color(SCAN.color) },
      uScreen: { value: new Vector2(1, 1) },
      uLineWidth: { value: SCAN.width },
      uGlow: { value: SCAN.glow },
      uGlowStrength: { value: SCAN.glowStrength },
    };
    const picture = new ShaderMaterial({
      uniforms,
      vertexShader: passVert,
      fragmentShader: pictureFrag,
      depthTest: false,
      depthWrite: false,
    });
    const write = new ShaderMaterial({
      uniforms,
      defines: { WRITE: 1 },
      vertexShader: passVert,
      fragmentShader: pictureFrag,
      depthTest: false,
      depthWrite: false,
    });
    const writeScene = new Scene();
    const writeMesh = new Mesh(quad, write);
    writeMesh.frustumCulled = false;
    writeScene.add(writeMesh);
    return {
      camera,
      quad,
      capture,
      captureScene,
      picture,
      write,
      writeScene,
      uniforms,
    };
  }, []);

  useEffect(() => {
    buffers.history = plan;
    return () => history.dispose();
  }, [history, plan]);
  useEffect(() => {
    buffers.frozen = {
      width: frozen.width,
      height: frozen.height,
      bytes: frozen.width * frozen.height * 4,
    };
    // A new frozen picture is empty: any scan on screen is dropped.
    cancelScan();
    return () => frozen.dispose();
  }, [frozen]);
  useEffect(
    () => () => {
      passes.capture.dispose();
      passes.picture.dispose();
      passes.write.dispose();
      passes.quad.dispose();
    },
    [passes],
  );

  // What is on screen, easing between states.
  const anim = useRef({
    shapeA: 0,
    shapeB: 0,
    morph: tween(1, WARP.morph),
    amount: tween(1, WARP.fade),
    scanShow: tween(0, SCAN.clearFade),
    line: tween(0, SCAN.lineFade),
    progress: 0,
    dir: 0,
  });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = state.clock.elapsedTime;
    const view = getView();
    const a = anim.current;
    const u = passes.uniforms;

    // 1. Store this frame in the history when one is due.
    if (cameraTexture) {
      const layer = nextLayer(ring, now, plan.fps);
      if (layer >= 0) {
        passes.capture.uniforms.uCamera.value = cameraTexture;
        passes.capture.uniforms.uCameraLinear.value = samplesLinear(
          cameraTexture,
        )
          ? 1
          : 0;
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(history, layer);
        gl.render(passes.captureScene, passes.camera);
        gl.setRenderTarget(prev);
      }
    }

    // 2. The live warp: morph to a newly picked shape, fade out for the scan.
    const target = SHAPE_INDEX[view.shape];
    if (target !== a.shapeB) {
      a.shapeA = tweenValue(a.morph) >= 0.5 ? a.shapeB : a.shapeA;
      a.shapeB = target;
      a.morph = { from: 0, to: 1, t: 0, dur: WARP.morph };
    }
    retarget(a.amount, view.mode === "scan" ? 0 : 1);

    u.uCamera.value = cameraTexture ?? null;
    u.uCameraLinear.value = samplesLinear(cameraTexture) ? 1 : 0;
    u.uHistory.value = history.texture;
    u.uNewest.value = Math.max(0, ring.newest);
    u.uFilled.value = ring.filled;
    u.uLayers.value = plan.layers;
    u.uShapeA.value = a.shapeA;
    u.uShapeB.value = a.shapeB;
    u.uMorph.value = stepTween(a.morph, dt);
    u.uAmount.value = stepTween(a.amount, dt);
    u.uAspect.value = size.width / Math.max(1, size.height);
    u.uScreen.value.set(size.width, size.height);

    // 3. The scan: move the line and freeze the band it passed.
    const wasRunning = scan.phase === "running";
    const band = cameraTexture ? stepScan(scan, dt, SCAN.duration) : null;
    if (scan.phase !== "idle") {
      a.dir = scan.dir === "down" ? 0 : 1;
      a.progress = scan.progress;
      retarget(a.scanShow, 1, 0.001);
    } else {
      retarget(a.scanShow, 0, SCAN.clearFade);
    }
    u.uScanDir.value = a.dir;
    if (band) {
      // Copy the band from the live picture into the frozen one.
      u.uBand.value.set(band[0], band[1]);
      const prev = gl.getRenderTarget();
      const { autoClear } = gl;
      gl.autoClear = false;
      gl.setRenderTarget(frozen);
      gl.render(passes.writeScene, passes.camera);
      gl.setRenderTarget(prev);
      gl.autoClear = autoClear;
    }
    if (wasRunning && scan.phase === "done") scanFinished();
    if (scan.phase === "running") retarget(a.line, 1, 0.001);
    else retarget(a.line, 0, SCAN.lineFade);

    u.uFrozen.value = frozen.texture;
    u.uScanShow.value = stepTween(a.scanShow, dt);
    u.uScanProgress.value = a.progress;
    u.uLineAlpha.value = stepTween(a.line, dt);
  }, -0.5);

  return (
    <mesh material={passes.picture} renderOrder={10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
};
