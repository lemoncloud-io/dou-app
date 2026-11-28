# dou-cli

**DoU in a Node process, with no screen.** It boots [`@chatic/runtime-node`](../../libs/runtime-node/README.md) on a profile folder, signs in by device pairing and keeps the session and sockets alive. It is the runtime behind the desktop harness and, later, the MCP server.

Tags: `layer:app` · `platform:node` · `formfactor:any`.

```sh
yarn nx build dou-cli
node dist/apps/dou-cli/main.mjs --profile <dir> <command>
```

| Command  | Does                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pair`   | requests a device pairing, prints `pairing code: <code>`, waits for an approval on another device, then prints `{"paired":true,"target":…}`. Exits 1 when denied, expired, lost or failed      |
| `whoami` | prints `{signedIn, userId, delegatorId, activeServer}` as one JSON line                                                                                                                        |
| `clouds` | prints `{active, clouds:[{cloudId, name}]}` for the clouds the pairing entered                                                                                                                 |
| `serve`  | keeps the session and sockets, serves MCP on `<dir>/mcp.sock` ([docs/mcp](./docs/mcp/README.md)), re-checks paired clouds every `PAIRED_CLOUD_CHECK_INTERVAL_MS`, exits 0 on SIGINT or SIGTERM |

## Sidecar

`--parent-pipe` makes dou-cli exit when its standard input closes: a parent that starts it with a pipe on stdin and keeps the write end open (the desktop shell does) ends it by dying, so no orphan keeps `mcp.sock`. `yarn nx run dou-cli:build-sidecar` bundles the CLI again as CommonJS (a Node 22 single executable cannot load an ES module main) and turns that into a Node single executable named `dou-cli-<target triple>` in `apps/desktop-tauri/src-tauri/binaries` (override with a folder argument). It needs a Node build with single-executable support (the official builds; Homebrew's lacks it), `rustc` for the triple, and fetches `postject` through `npx` on first use. On macOS it re-signs ad hoc.

## Push

`serve` receives FCM for the shell when `VITE_FCM_API_KEY`, `VITE_FCM_PROJECT_ID`, `VITE_FCM_SENDER_ID`, `VITE_FCM_APP_ID` and `VITE_FCM_PACKAGE` all have a value. Each comes from the runtime environment (or `--env-file`) first, then from the bundle: `yarn nx build dou-cli` and `build-sidecar` bake the five in when the build environment has all of them, and bake nothing otherwise. It runs [`@chatic/push-desktop`](../../libs/push/desktop/README.md) with a Node host: credentials in `<dir>/node/fcm.json`, and a 30 s timer that reconnects when a tick comes more than 60 s late (the machine slept). It forwards over `shell.sock`:

| Method         | Params                                             | Sent                                                                                                                                        |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `push_token`   | `{token}`, `null` when FCM is not configured       | at start when not configured, then on every new token; retried every 2 s up to 30 tries until the shell answers, a newer token replacing it |
| `push_message` | `{title?, body?, deeplink?, data}` (one `FcmPush`) | on each push; dropped when the shell does not answer                                                                                        |

The log (stderr) carries the token length and error codes, never a value. Both builds inline the `.proto` files that `@liamcottle/push-receiver` loads from its own folder (`scripts/bundle-options.cjs`): neither an ES module bundle nor a single executable has that folder.

## Profile

`--profile <dir>` is one instance; without it `~/.dou/default`. The Node session files live in `<dir>/node` ([`storageFile`](../../libs/storage/file/README.md)); nothing else is written outside it. The stage and endpoints come from `VITE_*` variables: `--env-file <file>` loads them from a dotenv file (for dev, the team's `apps/web/.env.dev`), over the process environment. `VITE_ENV` is `dev` when unset.

## Code layout

- `src/cli.ts` parses arguments and runs a command against a booted runtime (`runCli`, with `boot` injected so tests use a fake).
- `src/boot.ts` declares the runtime (`headlessModules`, file storage, memory cache).
- `src/mcp/` is MCP only: `server.ts` (protocol), `socket.ts` (`mcp.sock`), `shellLink.ts` + `harnessTools.ts` (`shell.sock`), `settingsFile.ts`, `serveMcp.ts` (wiring). Nothing outside `src/mcp/` imports it except `main.ts`.
- `src/commands/` holds one file per command. Code that MCP and the human CLI will share (boot, sign-in, tool execution) stays outside any MCP-only file.
- `src/push/` is push only: `sidecarPush.ts` (FCM config, forwarding to the shell) and `nodeHost.ts` (the Node `PushHost`). It takes the shell call as an argument, so it imports nothing from `src/mcp/`.
- `ServeHooks.onReady(booted, profile, env)` in `src/commands/serve.ts` is where `main.ts` starts the MCP server and push; it may return a function that `serve` calls on shutdown. `env` is the map the boot read (the process environment, under `--env-file` values).

## Limits

- Nothing approves a pairing here: approve the code from the web or the mobile app.
- The cache is memory only; there is no persistent db yet.
- One process per profile: `storage.file` overwrites when two processes share a folder.
- `serve` starts the session and the socket slots; `Booted.stop` ends them, and the other commands start neither.
