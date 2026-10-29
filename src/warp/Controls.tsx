// The controls, in the control band at the bottom, on Night glass. Top down:
//   hint      once, on first load: "Move while it scans" (gone after ~4 s or a tap)
//   mode      Live | Scan, the picked one filled in Arles
//   controls  Live: the three shapes, each a pictogram of what it does
//             Scan: the big scan button (centre) and the direction chips beside it
//   caption   Live: the shape's name for ~2 s after a change
//             Scan: what the button does now ("Tap to scan" / "Scanning…" / "Tap to clear")
// A picked shape or direction wears an Arles ring. While the line sweeps, the
// scan button's ring fills in Arles and the direction chips rest. Until it is
// first used, a soft Arles pulse marks the way to the scan. Nothing sits over
// the face.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

import type { Shape } from "./history.sim";
import type { ScanDir } from "./scan.sim";
import {
  pickShape,
  pressScan,
  scan,
  setMode,
  setScanDir,
  useView,
  type Mode,
} from "./state";

const ARLES = "#f4d968";
const CYPRESS = "#232528";

/** The shape caption shows this long after a change (ms). */
const CAPTION_MS = 2000;
/** The first-load hint shows this long, unless a tap comes first (ms). */
const HINT_MS = 4000;

/** The scan button's ring: radius and circumference (SVG units of a 76 box). */
const RING_R = 33.5;
const RING_C = 2 * Math.PI * RING_R;

const CSS = `
.tw-root { position: absolute; inset: 0; pointer-events: none; color: #fff;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
.tw-scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 260px;
  background: linear-gradient(rgb(35 37 40 / 0), rgb(35 37 40 / .6)); }
.tw-band { position: absolute; left: 50%; transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom) + 20px); width: min(calc(100% - 32px), 400px);
  display: flex; flex-direction: column; align-items: center; gap: 10px; }
.tw-glass { background: rgb(35 37 40 / .64);
  backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgb(235 246 253 / .18);
  box-shadow: inset 0 1px 1px rgb(255 255 255 / .22), 0 8px 24px rgb(0 0 0 / .22); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tw-glass { background: rgb(35 37 40 / .82); } }
.tw-fade { transition: opacity 160ms ease-out, transform 160ms ease-out; }
.tw-fade.out { opacity: 0; }
.tw-fade.out, .tw-fade.out * { pointer-events: none !important; }
.tw-fade.in { transition-duration: 220ms; }
.tw-caption { height: 28px; padding: 0 12px; border-radius: 999px; display: flex;
  align-items: center; font-size: 14px; font-weight: 600; line-height: 1; white-space: nowrap; }
.tw-hint { height: 32px; padding: 0 14px; font-size: 15px; }
.tw-btn { pointer-events: auto; border: 0; padding: 0; margin: 0; color: inherit; font: inherit;
  display: grid; place-items: center; cursor: pointer; outline: none; touch-action: manipulation;
  transition: transform 160ms ease-out, background-color 160ms ease-out, color 160ms ease-out,
    box-shadow 160ms ease-out, opacity 160ms ease-out; }
.tw-btn:active { transform: scale(0.96); }
.tw-btn:focus-visible { box-shadow: 0 0 0 2px ${ARLES}; }
.tw-btn:disabled { opacity: .4; cursor: default; }
.tw-btn:disabled:active { transform: none; }
.tw-modes { pointer-events: auto; position: relative; display: flex; gap: 2px; padding: 2px;
  border-radius: 999px; }
.tw-modes .tw-btn { position: relative; height: 44px; min-width: 84px; padding: 0 18px;
  border-radius: 999px; background: transparent; font-size: 15px; font-weight: 600; }
.tw-modes .tw-btn.on { background: ${ARLES}; color: ${CYPRESS}; }
.tw-row { position: relative; width: 100%; height: 76px; }
.tw-row > * { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; gap: 12px; }
.tw-chip { position: relative; width: 52px; height: 52px; border-radius: 50%; flex: none; }
.tw-chip.sm { width: 44px; height: 44px; }
.tw-chip.on { box-shadow: 0 0 0 2px ${ARLES}, inset 0 1px 1px rgb(255 255 255 / .22),
  0 8px 24px rgb(0 0 0 / .22); color: ${ARLES}; }
.tw-scanrow { display: grid !important; grid-template-columns: 1fr auto 1fr; }
.tw-dirs { justify-self: start; display: flex; gap: 8px; }
.tw-scan { position: relative; width: 76px; height: 76px; border-radius: 50%; }
.tw-scan svg.tw-ring { position: absolute; inset: 0; transform: rotate(-90deg); }
.tw-scan .tw-disc { position: absolute; inset: 13px; border-radius: 50%; background: ${ARLES};
  color: ${CYPRESS}; display: grid; place-items: center; }
.tw-pulse { position: absolute; inset: -2px; border-radius: 999px; pointer-events: none;
  box-shadow: 0 0 0 2px ${ARLES}, 0 0 18px 4px rgb(244 217 104 / .55);
  animation: tw-pulse 2.4s ease-out infinite; }
@keyframes tw-pulse {
  0% { opacity: .9; transform: scale(1); }
  60% { opacity: 0; transform: scale(1.18); }
  100% { opacity: 0; transform: scale(1.18); } }
@media (prefers-reduced-motion: reduce) {
  .tw-btn:active { transform: none; }
  @keyframes tw-pulse { 0% { opacity: .9; } 60% { opacity: 0; } 100% { opacity: 0; } } }
`;

const Icon = ({
  children,
  size = 24,
}: {
  children: ReactNode;
  size?: number;
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/**
 * A face cut into bands that drift apart, the way the warp stretches a moving
 * face, with an arrow for where the past is.
 */
const SlicedFace = ({ across }: { across: boolean }) => {
  const id = across ? "tw-face-h" : "tw-face-v";
  const face = across
    ? { cx: 11, cy: 9.5, rx: 6.8, ry: 6.8 }
    : { cx: 8.5, cy: 12, rx: 6.3, ry: 7.8 };
  const eyeY = face.cy - 1.6;
  // Eyes sit inside the bands, never on a cut.
  const eyeX = across ? 3.9 : 2.5;
  // Three bands, each nudged a little further along the arrow.
  const bands = [0, 1, 2].map((b) => {
    const at = (across ? face.cx - face.rx : face.cy - face.ry) + b * 4.75;
    return {
      b,
      rect: across
        ? { x: at, y: 0, width: 4.0, height: 24 }
        : { x: 0, y: at, width: 24, height: 4.0 },
      shift: across ? `translate(0 ${b * 1.5})` : `translate(${b * 1.7} 0)`,
    };
  });
  return (
    <Icon>
      <defs>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse">
          <rect x="-4" y="-4" width="32" height="32" fill="#fff" />
          <circle cx={face.cx - eyeX} cy={eyeY} r="1.2" fill="#000" />
          <circle cx={face.cx + eyeX} cy={eyeY} r="1.2" fill="#000" />
          <path
            d={`M${face.cx - 2.6} ${face.cy + 2.4}q2.6 2.1 5.2 0`}
            stroke="#000"
            strokeWidth={1.4}
          />
        </mask>
        {bands.map(({ b, rect }) => (
          <clipPath id={`${id}${b}`} key={b}>
            <rect {...rect} />
          </clipPath>
        ))}
      </defs>
      {bands.map(({ b, shift }) => (
        <g key={b} clipPath={`url(#${id}${b})`}>
          <g transform={shift}>
            <ellipse
              {...face}
              fill="currentColor"
              stroke="none"
              mask={`url(#${id}-m)`}
            />
          </g>
        </g>
      ))}
      {across ? (
        <path d="M5 21.8h12.5M15.6 19.8l2 2-2 2" strokeWidth={1.6} />
      ) : (
        <path d="M21.6 6v12M19.6 16l2 2 2-2" strokeWidth={1.6} />
      )}
    </Icon>
  );
};

const SHAPE_ICON: Record<Shape, ReactNode> = {
  vertical: <SlicedFace across={false} />,
  horizontal: <SlicedFace across />,
  radial: (
    <Icon>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="5.8" />
      <circle cx="12" cy="12" r="9.4" opacity={0.6} />
    </Icon>
  ),
};

/** The scan line and the way it sweeps. */
const dirIcon = (dir: ScanDir, size = 22) =>
  dir === "down" ? (
    <Icon size={size}>
      <path d="M4 5h16" strokeWidth={2.4} />
      <path d="M12 9v10M8.5 15.5 12 19l3.5-3.5" strokeWidth={2} />
    </Icon>
  ) : (
    <Icon size={size}>
      <path d="M5 4v16" strokeWidth={2.4} />
      <path d="M9 12h10M15.5 8.5 19 12l-3.5 3.5" strokeWidth={2} />
    </Icon>
  );

const STOP = (
  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1" y="1" width="14" height="14" rx="3.5" fill="currentColor" />
  </svg>
);

const START_OVER = (
  <Icon size={22}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" strokeWidth={2.2} />
    <path d="M4 4v4.5h4.5" strokeWidth={2.2} />
  </Icon>
);

const SHAPE_CAPTION: Record<Shape, string> = {
  vertical: "Top → bottom",
  horizontal: "Left → right",
  radial: "Centre → edges",
};
const SHAPE_LABEL: Record<Shape, string> = {
  vertical: "Warp top to bottom: the top is now, the past runs down",
  horizontal: "Warp left to right: the left is now, the past runs right",
  radial: "Warp from the centre: the centre is now, the past runs out",
};
const DIR_LABEL: Record<ScanDir, string> = {
  down: "Scan from the top down",
  across: "Scan from left to right",
};

const SHAPES: Shape[] = ["vertical", "horizontal", "radial"];
const DIRS: ScanDir[] = ["down", "across"];
const MODES: { mode: Mode; label: string }[] = [
  { mode: "live", label: "Live" },
  { mode: "scan", label: "Scan" },
];

/** Shown or faded out (and not tappable while faded). */
const fade = (on: boolean) => `tw-fade ${on ? "in" : "out"}`;

export const Controls = () => {
  const view = useView();
  const inScan = view.mode === "scan";
  const running = view.phase === "running";
  const arc = useRef<SVGCircleElement>(null);

  // The shape caption: shown for a moment after the shape (or Live) is picked.
  const [caption, setCaption] = useState(true);
  useEffect(() => {
    if (inScan) return undefined;
    setCaption(true);
    const t = window.setTimeout(() => setCaption(false), CAPTION_MS);
    return () => window.clearTimeout(t);
  }, [view.shape, inScan]);

  // The first-load hint: gone after a few seconds or the first tap.
  const [hint, setHint] = useState(true);
  useEffect(() => {
    if (!hint) return undefined;
    const t = window.setTimeout(() => setHint(false), HINT_MS);
    const off = () => setHint(false);
    window.addEventListener("pointerdown", off);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", off);
    };
  }, [hint]);

  // The Arles arc follows the line (drei's Html is a separate React root,
  // so the frame loop lives out here and reaches in through the ref).
  useFrame(() => {
    const el = arc.current;
    if (!el) return;
    const p = scan.phase === "running" ? scan.progress : 0;
    el.style.strokeDashoffset = String(RING_C * (1 - p));
  });

  let disc: ReactNode = dirIcon(view.dir, 24);
  let scanLabel = "Tap to scan";
  if (running) {
    disc = STOP;
    scanLabel = "Scanning…";
  } else if (view.phase === "done") {
    disc = START_OVER;
    scanLabel = "Tap to clear";
  }

  return (
    <Html fullscreen zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div className="tw-root">
        <div className="tw-scrim" />
        <div className="tw-band">
          <div className={`tw-glass tw-caption tw-hint ${fade(hint)}`}>
            Move while it scans
          </div>

          <div
            className="tw-modes tw-glass"
            role="radiogroup"
            aria-label="Mode"
          >
            {MODES.map(({ mode, label }) => (
              <button
                type="button"
                key={mode}
                role="radio"
                aria-checked={view.mode === mode}
                className={`tw-btn ${view.mode === mode ? "on" : ""}`}
                onClick={() => setMode(mode)}
              >
                {mode === "scan" && !view.visitedScan ? (
                  <span className="tw-pulse" />
                ) : null}
                {label}
              </button>
            ))}
          </div>

          <div className="tw-row">
            <div
              className={fade(!inScan)}
              role="radiogroup"
              aria-label="Warp shape"
              aria-hidden={inScan}
            >
              {SHAPES.map((shape) => (
                <button
                  type="button"
                  key={shape}
                  role="radio"
                  aria-checked={view.shape === shape}
                  aria-label={SHAPE_LABEL[shape]}
                  title={SHAPE_CAPTION[shape]}
                  tabIndex={inScan ? -1 : 0}
                  className={`tw-btn tw-glass tw-chip ${view.shape === shape ? "on" : ""}`}
                  onClick={() => pickShape(shape)}
                >
                  {SHAPE_ICON[shape]}
                </button>
              ))}
            </div>

            <div className={`tw-scanrow ${fade(inScan)}`} aria-hidden={!inScan}>
              <span />
              <button
                type="button"
                aria-label={scanLabel}
                tabIndex={inScan ? 0 : -1}
                className="tw-btn tw-glass tw-scan"
                onClick={pressScan}
              >
                {inScan && view.visitedScan && !view.scanned ? (
                  <span className="tw-pulse" />
                ) : null}
                <svg
                  className="tw-ring"
                  width={76}
                  height={76}
                  viewBox="0 0 76 76"
                  aria-hidden="true"
                >
                  <circle
                    cx="38"
                    cy="38"
                    r={RING_R}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={3}
                    opacity={running ? 0.35 : 1}
                  />
                  <circle
                    ref={arc}
                    cx="38"
                    cy="38"
                    r={RING_R}
                    fill="none"
                    stroke={ARLES}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C}
                  />
                </svg>
                <span className="tw-disc">{disc}</span>
              </button>
              <div
                className="tw-dirs"
                role="radiogroup"
                aria-label="Scan direction"
              >
                {DIRS.map((dir) => (
                  <button
                    type="button"
                    key={dir}
                    role="radio"
                    aria-checked={view.dir === dir}
                    aria-label={DIR_LABEL[dir]}
                    title={DIR_LABEL[dir]}
                    disabled={running}
                    tabIndex={inScan ? 0 : -1}
                    className={`tw-btn tw-glass tw-chip sm ${view.dir === dir ? "on" : ""}`}
                    onClick={() => setScanDir(dir)}
                  >
                    {dirIcon(dir, 20)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tw-row" style={{ height: 28 }}>
            <div className={fade(!inScan && caption)}>
              <span className="tw-glass tw-caption">
                {SHAPE_CAPTION[view.shape]}
              </span>
            </div>
            <div className={fade(inScan)} aria-live="polite">
              <span className="tw-glass tw-caption">{scanLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </Html>
  );
};
