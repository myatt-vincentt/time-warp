# Time Warp

Your camera picture bent through time. In Live, every part of the screen shows a different moment
of the last three seconds: top to bottom, left to right, or from the centre out, so anything that
moves smears and bends. In Scan, a glowing line sweeps down (or across) the screen and freezes
everything it passes while the rest stays live: move with the line to stretch your face, clone
your hands or make funny shapes, and the finished picture holds until you tap to clear. The
picture fills the whole screen.

- Thumbnail: `public/images/time-warp-thumbnail.jpg` (the share image).
- The picture: `src/warp/WarpLayers.tsx`. A ring of the last ~3 s of frames, kept small in a
  texture array (90 frames on a computer, 72 on a phone), and the frozen picture for the scan.
- The timing: `history.sim.ts` (which stored frame is "n frames ago"), `scan.sim.ts` (the scan's
  timeline), `tween.sim.ts` (eased shape changes), all unit-tested.
- The controls (`Controls.tsx`), on Night glass in the bottom band: a Live | Scan switch; in Live,
  the three shape chips with a short caption; in Scan, the big scan button with the direction
  chips (down / across) beside it.
- `src/App.tsx` uses a full-window container instead of the 9:16 frame; re-apply after a template
  upgrade.
- Dev preview without a camera: the media switcher starts on the SDK's sample video. Dev keys: 1–3
  pick a live shape, L live, S scan (start / clear), D direction.

---

# v2-template

The Vincentt starter app: a real React + R3F + Vincentt XR SDK (`@vincentt-xr/sdk`)
WebXR app, bundled by esbuild.

## Shape

```
src/
  main.tsx            mount — never edited
  App.tsx             protected shell: XRProvider + AspectRatioContainer +
                      XRScene + media-source binding, camera, lighting,
                      VideoBackground, PreviewAnchors — never edited
  Scene.tsx           the agent's surface: add SDK components and R3F
                      primitives here
  PreviewAnchors.tsx  editor-preview integration — never edited
```

See `AGENTS.md` and `GROUNDING.md` for the API reference and how to author scenes.

## Develop

```
pnpm install
pnpm dev          # esbuild dev server on localhost:5173 (output in .dev/)
pnpm preview      # on-device preview over a secure tunnel (needs `vincentt login`)
pnpm typecheck
pnpm build        # production bundle to dist/
```

## Release

`vincentt init` scaffolds from the **`latest` tag**, not from `main`. Merging to `main` does
not ship a template to creators — cutting a release does.

```
git tag 1.1.0 <sha>      # bare semver, no `v` prefix
git push origin 1.1.0    # the Release workflow verifies the tag, then moves `latest`
```

The Release workflow (`.github/workflows/release.yml`) installs from the frozen lockfile,
builds, and typechecks **the tagged tree** before force-updating `latest` to it. A tag that
fails leaves `latest` where it was, so a broken release cannot reach a new creator.

The job runs in the `release` environment, which accepts bare-semver tags only. To re-run it by
hand, dispatch it from the tag itself ("Use workflow from: 1.1.0"); a dispatch from `main` is
refused.

**Never move `latest` by hand.** It is force-updated by that workflow and nowhere else; moving
it manually decouples the pointer from the version it claims to be.

Creators can pin a specific version — `vincentt init --template 1.0.0` — which is the escape
hatch when a release turns out to be bad. That is why the version tags are immutable and only
`latest` moves.

### `MIGRATION.md` and the platform release row

Root `MIGRATION.md` carries one entry per released tag, newest first, authored in the same
PR as the change: `required: true|false`, a one-line summary, and optional notes bullets.
`required: false` means no consumer action is needed, never that the entry was skipped. The
Release workflow refuses to move `latest` for a tag with no valid entry, then — once `latest`
has moved — posts that entry as this release's row to the platform (`POST
/platform/releases`, component `template`), via `scripts/release-row.mjs`. Both steps read
`MIGRATION.md` from `main`, not from the tagged tree: the note is reviewed via PR into `main`
and is append-only per version, so `main`'s copy is the reviewed source for any tag, including
one cut before this file existed. That row is what `vincentt outdated` reads back to tell a
creator's agent what changed and what to do about it.
