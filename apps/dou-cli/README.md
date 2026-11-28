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

## Profile

`--profile <dir>` is one instance; without it `~/.dou/default`. The Node session files live in `<dir>/node` ([`storageFile`](../../libs/storage/file/README.md)); nothing else is written outside it. The stage and endpoints come from `VITE_*` variables: `--env-file <file>` loads them from a dotenv file (for dev, the team's `apps/web/.env.dev`), over the process environment. `VITE_ENV` is `dev` when unset.

## Code layout

- `src/cli.ts` parses arguments and runs a command against a booted runtime (`runCli`, with `boot` injected so tests use a fake).
- `src/boot.ts` declares the runtime (`headlessModules`, file storage, memory cache).
- `src/mcp/` is MCP only: `server.ts` (protocol), `socket.ts` (`mcp.sock`), `shellLink.ts` + `harnessTools.ts` (`shell.sock`), `settingsFile.ts`, `serveMcp.ts` (wiring). Nothing outside `src/mcp/` imports it except `main.ts`.
- `src/commands/` holds one file per command. Code that MCP and the human CLI will share (boot, sign-in, tool execution) stays outside any MCP-only file.
- `ServeHooks.onReady(booted, profile)` in `src/commands/serve.ts` is where `main.ts` starts the MCP server; it may return a function that `serve` calls on shutdown.

## Limits

- Nothing approves a pairing here: approve the code from the web or the mobile app.
- The cache is memory only; there is no persistent db yet.
- One process per profile: `storage.file` overwrites when two processes share a folder.
- `serve` starts the session and the socket slots; `Booted.stop` ends them, and the other commands start neither.
