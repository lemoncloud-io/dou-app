# dou-cli

**DoU in a Node process, with no screen.** It boots [`@chatic/runtime-node`](../../libs/runtime-node/README.md) on a profile folder, signs in by device pairing and keeps the session and sockets alive. It is the runtime behind the desktop harness and, later, the MCP server.

Tags: `layer:app` · `platform:node` · `formfactor:any`.

```sh
yarn nx build dou-cli
node dist/apps/dou-cli/main.mjs --profile <dir> <command>
```

| Command  | Does                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pair`   | requests a device pairing, prints `pairing code: <code>`, waits for an approval on another device, then prints `{"paired":true,"target":…}`. Exits 1 when denied, expired, lost or failed |
| `whoami` | prints `{signedIn, userId, delegatorId, activeServer}` as one JSON line                                                                                                                   |
| `clouds` | prints `{active, clouds:[{cloudId, name}]}` for the clouds the pairing entered                                                                                                            |
| `serve`  | keeps the session and sockets, re-checks paired clouds every `PAIRED_CLOUD_CHECK_INTERVAL_MS`, exits 0 on SIGINT or SIGTERM                                                               |

## Profile

`--profile <dir>` is one instance; without it `~/.dou/default`. The Node session files live in `<dir>/node` ([`storageFile`](../../libs/storage/file/README.md)); nothing else is written outside it. The stage comes from `VITE_ENV` and is `dev` when unset.

## Code layout

- `src/cli.ts` parses arguments and runs a command against a booted runtime (`runCli`, with `boot` injected so tests use a fake).
- `src/boot.ts` declares the runtime (`headlessModules`, file storage, memory cache).
- `src/commands/` holds one file per command. Code that MCP and the human CLI will share (boot, sign-in, tool execution) stays outside any MCP-only file.
- `ServeHooks.onReady(booted)` in `src/commands/serve.ts` is where the MCP server starts, in a later step.

## Limits

- Nothing approves a pairing here: approve the code from the web or the mobile app.
- The cache is memory only; there is no persistent db yet.
- One process per profile: `storage.file` overwrites when two processes share a folder.
- `Booted.stop` does nothing yet; the process exit closes the sockets.
