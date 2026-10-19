# ADR-0214: The virtual shell is a package

> Status: Accepted · Decided: 2026-10-19 · Implemented: `feat/hybrid-shell`
> · Scope: `apps/virtual-shell` and `scripts/local/` (removed), `apps/shell-adapter` (new),
> `hybrid-shell.config.ts` (new), `docs/config/skills/dou-shell-verify/`
> · Supersedes decisions 1, 3 and 5 of [ADR-0208](./0208-local-runs-default-to-a-virtual-mobile-shell.md)
> in how they are built; the rest of that ADR stands
> · The module doc is [apps/shell-adapter/README.md](../../apps/shell-adapter/README.md)

## Context

ADR-0208 put a virtual mobile shell in this repository: its own app (`apps/virtual-shell`, about eight
thousand lines with its tests), a `yarn local` script that started the web and the shell, and the
tools an agent drives. Nothing in that code was about this app except a thin layer — the bridge's
message names, the answers to app-only messages, the routing functions, the sign-in client. The rest
(the phone frame, the proxy, the log, the tools, the backend switch) is what any WebView app needs.

The same shell is now published as `@lemoncloud/hybrid-shell`, generalised from this one: the shell,
its server and the `local` command are the package, and an app supplies a config and a handler module.

## Decision

1. **`yarn local` is `hybrid-shell local`.** The modes, ports and backends of ADR-0208 stay: `shell`
   (default), `web`, `native`; dev 5003 · 5007, prod 5013 · 5017; prod in the shell mode only, with its
   band; the header's DEV | PROD switch running the other pair. An unnamed backend is dev without
   asking.
2. **The app's side is `hybrid-shell.config.ts` plus `apps/shell-adapter`.** The config maps the
   shell's events and requests to this app's message names, typed against `@chatic/app-messages`, so a
   renamed message fails to compile there. The adapter holds the handler module — the e2e suite's
   boot answers and cache from `libs/fake-shell`, the preference store, sign-in — the routing functions'
   alias and stubs, and the scenarios.
3. **The routing functions stay the mobile app's own**, reached through the same alias as before, now
   in a Vite config of the adapter that only the shell server reads, and held to the app by a unit test
   that calls them through it.
4. **`apps/virtual-shell` and `scripts/local/` are removed.** `libs/fake-shell` and the e2e suite are
   unchanged; the shell no longer shares their transport, only their answers.
5. **Agents keep `dou-shell-verify`**, rewritten for the package's tools and its scenario files.

## Alternatives

- **Keep the in-repo shell.** No dependency, and every fix to the general parts made here only — while
  the other WebView apps that need the same shell copy it. One copy, versioned, is the point.
- **Replace the e2e suite's fake shell with the package's.** One fake fewer, but the suite runs in CI on
  every PR and is green; swapping its transport is its own change with its own risk, and it is deferred
  rather than dropped.
- **Map the native-only messages too.** The shell would look more complete, and answer for things it
  cannot do (pickers, purchases, files). They stay unanswered, which the web reads as an older app, and
  each one is named as unsupported on screen and in the log.

## Consequences

- The shell's own behaviour — tools, log, scenarios, the switch — changes with the package version in
  `package.json`, not with this repository's code. Bumping it is a reviewed change like any dependency.
- A Google sign-in still needs the OAuth client to list the shell's origins, as ADR-0208 says.
- The network-status event the package can send has no message in this app's bridge yet, so a network
  change reaches the web only as failing requests, as on a device whose app does not report it. The
  offline scenario judges by those requests.
- The config bag the web saves is kept by the package's `app-bridge-host` preset and injected at every
  launch, as the app does; a reload of the shell page empties it, as reinstalling the app would.
