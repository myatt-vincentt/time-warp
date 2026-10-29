// Time Warp: the camera picture, time-displaced. Live, each part of the screen
// shows a different moment of the last few seconds (WarpLayers.tsx); a scan
// sweeps a glowing line that freezes what it passes. The controls sit in the
// control band (Controls.tsx).
import { Controls } from "./Controls";
import { WarpLayers } from "./WarpLayers";

export const WarpScene = () => (
  <>
    <WarpLayers />
    <Controls />
  </>
);
