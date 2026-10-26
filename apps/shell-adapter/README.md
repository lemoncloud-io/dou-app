# shell-adapter — this app on the virtual mobile shell

`yarn local` runs the web inside a virtual mobile shell, in one browser tab, with no simulator: the web
boots in its native mode, inside the app's bridge, and the shell's tools make the app's situations — a
push tapped, a link opened, the app sent to the background, the network dropping. The shell is the
`@lemoncloud/hybrid-shell` package; this folder and `hybrid-shell.config.ts` at the repository root are
this app's side of it. Why it is a package: ADR-0214.

## Run it

```bash
yarn local                          # the shell, dev: http://localhost:5007/__shell/ (web on 5003)
yarn local --env prod               # the shell, prod: http://localhost:5017/__shell/ (web on 5013)
yarn local --mode web               # the web dev server alone, dev, as a plain browser page
yarn local --mode native            # the simulator run, unchanged (yarn mobile:ios:local)
yarn local --mode native --platform android
yarn local --check                  # what it would do, and what is missing; starts nothing
```

An unnamed backend is dev. Before it starts anything it checks what it needs; a missing env file is
named with where it comes from (ONBOARDING.md § Env and Firebase files), and nothing is started.
`apps/web/.env` and `apps/web/.env.<env>` are handed to the web dev server as its process environment,
the backend's file last — the web's Vite plugins read `process.env`, so this is what moves its
endpoints. `apps/mobile/.env.<env>` is read for one value, the Google sign-in client.

prod runs in the shell mode only, where the page carries a PROD band. While `yarn local` runs, the
shell's DEV | PROD switch starts the other backend's pair on its own ports — its own origin, so its own
sign-in — after asking first; only a person switches.

The agent procedure is [`dou-shell-verify`](../../docs/config/skills/dou-shell-verify/SKILL.md).

## What is here

| File                                                     | What it is                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`hybrid-shell.config.ts`](../../hybrid-shell.config.ts) | The ports, the web command, the env files, and the shell's events and requests under this app's message names                 |
| `src/types.ts`                                           | The bridge contract as the shell's method and event tables, so a renamed message fails the config and the handlers to compile |
| `src/handlers.ts`                                        | The answers to app-only messages: `libs/fake-shell`'s boot answers and cache, the preference store, sign-in                   |
| `src/routes.ts`, `src/mobile.d.ts`                       | The mobile app's `resolvePushTapPath` and `resolveDeepLink`, as the push-tap and link events call them                        |
| `vite.shell.config.mts`, `src/stubs/`                    | The alias that reaches those functions, and the stub for the one native module they import — read by the shell server only    |
| `scenarios/`                                             | Scenario files the shell lists and runs                                                                                       |

The routing functions are the mobile app's own, not copies: reached through an alias (an import would
make `@chatic/mobile` a dependency of this project, and its typecheck would build the mobile app), with
their types written by hand in `src/mobile.d.ts`. `src/routes.spec.ts` calls the real functions through
the same alias, so a change in what the app returns fails it. The config is read in Node by the CLI as
well as by the shell page, and those functions only load in the page, so the handler module — which only
the page loads, before the shell starts — hands them to the config's event maps.

## What it imitates and what it does not

This table is the reference. Adding an imitation changes it in the same commit.

| Area                                                                                     | The virtual shell                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handshake, device info, safe area, theme                                                 | Imitated, per device preset                                                                                                                                               |
| Local cache (`FetchCacheData` and the rest)                                              | Answered from memory (`MemoryCache`). Kept across a relaunch, as the app's SQLite is; emptied by reloading the shell page                                                 |
| Settings: `SaveConfigValue`, `ClearConfigValue`                                          | Kept and injected again at every launch as `CHATIC_APP_CONFIG_BAG`, as the app does; emptied by reloading the shell page                                                  |
| Preferences: `Save/Delete/FetchPreference`                                               | Kept across relaunches; keys follow the app's allowlist and values its checks. A saved theme is not injected at the next launch — the device preset's theme is            |
| Push received / tapped, links, background and resume, Android back, network off and back | Made with the tools. A tap routes where `resolvePushTapPath` sends it; a link where `resolveDeepLink` does — a native-screen or rejected link fails the tool call instead |
| Network status                                                                           | Requests fail while offline, as on a device. The app's bridge has no network-status message, so the web hears no event for it                                             |
| Google sign-in                                                                           | Real — a Google popup (below)                                                                                                                                             |
| Apple sign-in                                                                            | **Not imitated.** Answered as the app answers a failed sign-in (`OAUTH_LOGIN_ERROR`), so the web shows its failure toast, and logged as unsupported                       |
| Push token (`FetchFcmToken`)                                                             | **Refused.** Named as `push.token`, which the shell never answers, so the web registers no device: a fake token would put a fake device on the server                     |
| App badge (`SetBadgeCount`)                                                              | **Recorded and shown** beside the phone and in `status().badge`. There is no OS badge                                                                                     |
| Photos, camera, file save, contacts, SMS, app icon, app update, haptics, file transfer   | **Not imitated.** No handler answers them: the panel asks for 5 seconds, then the request fails, which the web reads as an older app and falls back where it has one      |
| In-app purchase                                                                          | **Not imitated** — on prod a receipt check would reach the real server                                                                                                    |
| Input: user agent, pointer, touch                                                        | **Not imitated.** The frame keeps the desktop browser's: Enter sends instead of adding a line, and focus does not scroll into view. Check those in the native mode        |

Every request the shell does not answer is logged as `unsupported` and shown as a notice beside the
phone. What the shell cannot show is not a pass; check it on a simulator
([dou-device-verify](../../docs/config/skills/dou-device-verify/SKILL.md)). Also not imitated: the OS
handing a link to the app, real backgrounding (sockets and timers keep running), OS notification
banners and sounds, and the room-open trace a native tap hands over.

A fresh browser profile starts on the app's onboarding, which holds a link until it is done; skip it
once and the settings above keep it done.

The web dev server sets no Content-Security-Policy, so nothing is stripped for the shell's frame.

## Sign-in

The app signs in with the native Google SDK and hands the ID token to the web. The shell gets the same
kind of token from Google Identity Services, for the same client (`VITE_GOOGLE_WEB_CLIENT_ID` from
`apps/mobile/.env.<env>`, the one the native SDK is configured with), so the server verifies it the same
way. When the web asks to sign in with Google, a sheet rises over the phone with Google's own button;
Cancel answers the web as a cancelled sign-in (`result: null`).

Outside this repository each client must list its shell's origin as an authorised JavaScript origin:
`http://localhost:5007` on the dev client, `http://localhost:5017` on the prod one.

A person signs in, in the browser the agent drives — the session lives in that browser profile's
storage for the shell's origin and survives relaunches. An agent never picks an account or types a
password.

## Scenarios

| File                   | What it checks                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `push-opens-room.yaml` | A room message tapped from the background opens its room (`vars.room`: a room the session is in) |
| `invite-link.yaml`     | An invite link opens the app on its invite screen — run past onboarding                          |
| `offline-socket.yaml`  | Offline, the chat socket fails, and it reconnects once back online                               |

Run one in the shell page with `virtualShell.scenario.run('/__shell/scenarios/<file>')`, or from a
terminal against a running shell with `npx hybrid-shell run apps/shell-adapter/scenarios/<file>`.
