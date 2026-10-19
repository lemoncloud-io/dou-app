# ADR-0208: Local runs default to a virtual mobile shell

> Status: Accepted · Decided: 2026-10-16 · Implemented: `feat/virtual-mobile-shell`
> · Superseded in part: the shell is now a package — [ADR-0214](./0214-the-virtual-shell-is-a-package.md)
> · Scope: `apps/virtual-shell` (new), `libs/fake-shell` (new, out of `apps/web-e2e`), `scripts/local/`
> (`yarn local`), `docs/config/skills/dou-shell-verify/`
> · Extends [ADR-0114](./0114-agent-procedures-in-docs-and-a-general-language-rule.md) (a sixth
> procedure, `dou-shell-verify`)
> · Related: [ADR-0180](./0180-the-web-is-end-to-end-tested-inside-a-fake-native-shell.md) (the fake
> shell this reuses) · [ADR-0084](./0084-app-local-run-and-shell-stage-vocabulary.md) (the native
> local run, wrapped unchanged) · [ADR-0186](./0186-the-handshake-lists-what-the-shell-answers.md)
> · The module doc was `apps/virtual-shell/README.md`, removed with that app; its successor is
> [apps/shell-adapter/README.md](../../apps/shell-adapter/README.md)

## Context

The app is a native shell holding the web in a WebView, the two talking over a message bridge. Seeing
a web change as the app shows it meant three processes — the web dev server, Metro, a simulator — and
the mobile toolchain to build the simulator app. That is heavy for checking one screen, and an agent
that has just written a feature can rarely afford it at all. Running the web alone in a browser is
cheap but different: every branch behind `isNative()` takes the browser path, so the cache, the
handshake, push and link landing, back handling and the pickers' fallbacks are not what a phone runs.

The e2e suite already had the missing piece. Its fake shell (ADR-0180) is the app's own
`AppBridgeHost` with typed fake handlers, the app's own boot script, and an in-memory cache — enough
for the web to boot in its native mode against fixtures. It only lived inside Playwright.

## Decision

1. **`yarn local` is the one entry, and its default is the virtual mobile shell.** Three modes:
   `shell` (default) — the web inside the shell; `web` — the web dev server alone; `native` — the
   existing `mobile:<platform>:local` scripts, called unchanged. The backend is `--env dev|prod`;
   unnamed, a terminal is asked (Enter is dev) and anything without one gets dev.
2. **The fake shell's core moves to `libs/fake-shell` and both callers use it.** The e2e suite keeps
   only its Playwright transport; the virtual shell brings an iframe transport. The library is never
   imported by product code and is not in the `@chatic/bridges` barrel.
3. **The shell is its own app, `apps/virtual-shell`, on one origin with the web.** Its Vite server
   proxies every path but `/__shell/` to the web dev server (HMR socket included) and puts an
   injection script first in every HTML response. The web loads in an iframe of that origin and boots
   believing it is inside the app. `apps/web` is not changed and the deployed bundle carries none of it.
4. **The shell answers what it can answer as the app does, and says what it does not.** The e2e
   handler table, plus the settings lane re-injected at every launch, the app state, and sign-in. What
   it does not imitate answers `NOT_FOUND`, which the web already treats as an older app, and is logged
   and shown as unsupported. The push token is deliberately not answered.
5. **Tools are one function each, on screen and on `window.virtualShell`.** Status, log, push
   received and tapped, deep link, background and foreground, Android back, relaunch, device, wait,
   the keyboard, the app badge and a read-only view of the stored state. Push taps and links go
   through the mobile app's own `resolvePushTapPath` and `resolveDeepLink`, and the keyboard through
   its `getSafeAreaScript`, loaded through a Vite alias and checked by a unit test that calls them
   through it. One advanced tool sends any app → web event unchecked against the contract; it says so
   in every result, refuses through the API on prod, and is never a pass on its own.
6. **The environment is switched by handing `apps/web/.env.<env>` to the web dev server as its
   process environment**, and **each backend gets its own pair of ports** (dev 5003 · 5007, prod
   5013 · 5017), so its own origin and its own sign-in. prod is accepted in the shell mode only, where
   the page carries a PROD band. While `yarn local` runs, the shell's header switches backends by
   running the other pair; going to prod asks first, and only a person switches — there is no API for it.
7. **Google sign-in is real**: Google Identity Services in a popup, for the client the native SDK
   uses, the ID token handed back as the native sign-in hands it. Apple is not supported.
8. **Agents follow a sixth procedure, `dou-shell-verify`.** The device procedure stays for what only a
   device shows.

## Alternatives

- **The web alone stays the default.** Cheapest, and wrong for anything behind `isNative()` — the
  thing people most need to see.
- **The simulator stays the default.** Faithful, and the cost this decision exists to remove. It stays
  the final check (`--mode native`).
- **Debug tools inside the web instead of a shell page around it.** One page fewer, but the tools would
  be web code next to product code, one flag away from shipping. The shell page keeps them out of the
  bundle entirely.
- **A second fake shell written for the browser.** Free of Playwright from the start, but two fakes
  follow a message contract separately, and one of them will lag. One core with two transports does not.
- **A section in the device procedure rather than its own.** Fewer files, but "needs a simulator" and
  "needs none" in one document blurs which to reach for first.
- **dev only.** Simpler and safer, but reproducing a prod problem would then need a simulator again.
  Accepted with a terminal warning and a band that cannot be hidden instead.
- **Switching backends on one origin.** One shell, one address, the backend swapped underneath: the
  web's session lives in that origin's storage, so a dev sign-in would be found by the prod page (and
  the other way round). A pair of ports per backend costs a second set of servers and a second sign-in,
  and is what keeps the two apart.
- **No unchecked event sender at all.** Every event would then be one the contract describes, but a
  web reaction to an event no tool makes could only be explored by editing the shell. Keeping it, marked
  unchecked and blocked through the API on prod, buys the exploring without letting it stand as proof.
- **A switch an agent can call.** Convenient for scenarios, but prod would then be one call away from
  any script on the page; prod stays something a person picks.
- **Always ask which backend.** Explicit, but it forces a question on someone who just wants to look,
  and an agent cannot answer one.
- **Vite `--mode` for the backend.** The values Nx loads from `apps/web/.env` first would still win, so
  the endpoints would not move. Measured: the process environment does move them, `window.*` and
  `import.meta.env` alike.
- **No sign-in in the shell, test accounts only.** Leaves prod with no way in. **Carrying a session over
  from a browser tab** enters the app by a path the app never takes. A real popup goes the app's way.
- **A static import of the mobile routing functions.** Type-checked, but it makes `@chatic/mobile` a
  dependency, and typecheck would then build the mobile app (red, outside CI). A relative import also
  breaks the module-boundary rule. **Copying them** drifts. The alias plus a unit test that calls the
  real functions keeps one copy and fails when the app's shapes change.
- **Answering the push token with a fake one.** Push would look complete, and every run would register
  a fake device with the server — junk on dev, a real account's device on prod.
- **Overriding the user agent to look like a phone.** The socket's auth signature is computed over
  `navigator.userAgent` and checked against the header the server received; a JavaScript-only change
  gets every socket refused. Enter-to-send is decided by the pointer anyway.

## Consequences

- One command shows the web as the app shows it, with no mobile toolchain, and an agent can make and
  judge app situations from a browser tool.
- What the shell cannot show — photos, camera, files, keyboard, purchases, real backgrounding, the OS
  handing a link over, the WebView's own quirks, touch input — is named on screen and in the log, and
  still needs a device. A green run in the shell is not a device check.
- The mobile functions' types are written by hand in the shell. Their unit test is what holds them to
  the app; the compiler does not.
- The order of a warm push tap (navigation, then the foreground event) is the order the app's code
  produces, not one measured on a device: the app sets none between the two. Scenarios judge by where
  the page lands, not by that order.
- Google sign-in depends on settings outside the repository: the OAuth clients must list the shell's
  origins (`http://localhost` and each backend's shell origin, `:5007` and `:5017`), and the server must accept the popup's token
  as it accepts the native one (same client, same audience).
- `libs/fake-shell` changes now affect both the e2e suite and the shell; the handler table's types are
  what keep both honest when a message changes.
