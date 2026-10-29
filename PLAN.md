# Plan — Time Warp

The camera picture time-displaced by position, full screen, with two modes.

## Design

- Live (default): each screen point shows a past moment set by where it is. Shapes: top to bottom,
  left to right, centre to edges (the centre slightly above the middle). About 3 s of history with
  a gentle curve; switching shapes eases over 0.45 s.
- Scan: a glowing Arles line sweeps down or across over 7 s. Behind the line the picture is frozen
  at the moment the line passed; ahead of it, live. At the end the frozen picture holds; a tap
  clears it.
- Controls: Live | Scan switch; Live shows three pictogram chips with a short caption; Scan shows a
  big scan button (its ring fills as the line moves; caption Tap to scan / Scanning… / Tap to
  clear) with down / across chips, disabled while scanning. A first-visit tip and a pulse on the
  scan control until the first scan.

## How it works

- History: frames are stored on a steady timer into a texture-array ring at reduced size; each
  pixel samples the frame for its delay, blending neighbours to avoid steps.
- Scan: an accumulation picture; each frame the band the line crossed is copied from the live
  camera.
- Phones use a shorter, smaller history (72 frames, 360 px long side, about 16 MB).
