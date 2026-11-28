# perf

How the Tauri shell is measured against the Electron shell, and where the results are kept.

## Method

`scripts/bench-desktop.sh` copies each bundle for every run and starts the copy with an empty `HOME`, `CFFIXED_USER_HOME` and `TMPDIR`. Nothing is signed in, no running app is touched, and no profile of the person running it is read or written.

| Metric        | How it is taken                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundle size   | `du -sk` of the `.app`                                                                                                                                                                               |
| Cold start    | Time from `exec` to the first on-screen window larger than 300 x 300 that belongs to the process tree (`scripts/bench-window.swift`), median of the runs                                             |
| Idle memory   | `footprint -p` summed over the process tree plus the WebKit XPC services that appeared after launch, taken after a settle period. Footprint is used because RSS is distorted by compression and swap |
| Idle CPU      | CPU time of the same processes over the idle window, as a share of one core                                                                                                                          |
| Engine memory | The `dou-mcp` process and anything named `engine`, reported apart; it only exists once the Agent window has started the engine                                                                       |

`--dry-run` prints every command without running any. `scripts/bench-proxy.mjs` serves a remote web address on `localhost:5006`, which is the address the Electron dev build is baked with, so both shells load the same page.

## Known limits

- The Tauri copy gets a one-character-different bundle identifier and an ad-hoc signature, because the single-instance socket is a fixed path per identifier and the apps already open would swallow the launch.
- Cold start ends at the first window. In the 2026-11-27 run Tauri showed its loader window before the web page (the shell now loads the web directly); Electron shows its window after the first paint. That Tauri figure is therefore earlier than a "page visible" figure would be.
- WebKit XPC services are attributed by "new after launch", so another app starting WebKit during the run adds noise.
- The script leaves the WebKit services it started to exit with their app and never kills a process it did not launch.
- Launching an Electron copy registers its URL scheme with macOS. The script prints a warning when a default handler changed.

## Results

- [2026-11-27 Tauri vs Electron](./2026-11-27-tauri-vs-electron.md)
