# Tauri vs Electron desktop shell, 2026-11-27

One line: on the same dev web page the Tauri shell is about a tenth of the size (25 MB against 245 MB), starts the first window about 2.5 times sooner, and idles at about two thirds of the memory; idle CPU is the same.

## Setup

- Machine: Apple M3 Max, 48 GB, macOS 27.0.1, nothing else heavy running.
- Tauri: the dev bundle `DoU Tauri.app` (release profile, stage dev, loads `https://dou-dev.chatic.io`).
- Electron: `DoU Dev.app` 0.0.13 (loads `http://localhost:5006`, which `scripts/bench-proxy.mjs` served from `https://dou-dev.chatic.io`). Without the proxy the Electron dev build shows a connection error page and its memory is not comparable.
- Both on the sign-in screen, no account, empty profile per run. Method and limits: [README](./README.md).
- Repeats: 5 cold starts per shell, memory and CPU from the fifth run (20 s settle, 60 s idle).

## Results

| Metric                              | Tauri       | Electron    | Ratio | Repeats |
| ----------------------------------- | ----------- | ----------- | ----- | ------- |
| Bundle size                         | 25.1 MB     | 245.3 MB    | 0.10  | 1       |
| Cold start to first window (median) | 1064 ms     | 2710 ms     | 0.39  | 5       |
| Idle memory, whole tree (footprint) | 193 MB      | 301 MB      | 0.64  | 1       |
| Idle CPU, 60 s                      | 0.27 %      | 0.32 %      | 0.84  | 1       |
| Engine memory (`dou-mcp`)           | not started | not started |       |         |
| Profile on disk after one run       | 5.1 MB      | 4.8 MB      |       | 1       |

Cold start runs, Tauri: 1064, 1066, 1762, 757, 675 ms. Electron: 9143, 2659, 2462, 2896, 2710 ms (the first run is a cold disk cache).

Idle memory by process:

| Tauri                      | MB  | Electron          | MB  |
| -------------------------- | --- | ----------------- | --- |
| dou-tauri                  | 28  | DoU Dev (main)    | 74  |
| WebKit WebContent          | 121 | Helper (Renderer) | 82  |
| WebKit GPU                 | 25  | Helper (GPU)      | 130 |
| WebKit Networking          | 11  | Helper (network)  | 15  |
| WebKit WebContent (second) | 8   |                   |     |

## Reading it

- Size is the solid result. Electron ships Chromium; Tauri uses the system WebKit.
- Memory depends on the page. WebKit's content process is the largest Tauri entry, and Electron's GPU helper is the largest Electron entry. One sample per shell: treat the 36 % as a range, not a number.
- Cold start compares different moments (see README). Even against a late Tauri moment the gap is not small.
- Not measured: a signed-in session, the Agent window and engine, the production web (the Electron production copy showed no window within 30 s in this setup, so only the dev pair is reported).
- A production size check without running anything: `DoU Tauri Prod.app` 25 MB against `DoU.app` 253 MB (`du -sh`).

## Reproduce

```sh
node apps/desktop-tauri/scripts/bench-proxy.mjs &
bash apps/desktop-tauri/scripts/bench-desktop.sh --tauri-app "<path to DoU Tauri.app>"
```

`--runs`, `--settle` and `--idle` change the repeats and waits; `--only tauri|electron` measures one side; `--dry-run` lists the commands.
