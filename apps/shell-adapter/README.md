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
yarn local --env localhost          # the shell, a backend on this machine: http://localhost:5027/__shell/ (web on 5023)
yarn local --mode web               # the web dev server alone, dev, as a plain browser page
yarn local --mode native            # the simulator run, unchanged (yarn mobile:ios:local)
yarn local --mode native --platform android
yarn local --check                  # what it would do, and what is missing; starts nothing
yarn local:pair                     # the dev shell in its own window, signed in from a phone (below)
DOU_SHELL_CHECKOUT=web yarn local   # the shell declares how it sells (§ Checkout): store, web, none
```

An unnamed backend is dev. Before it starts anything it checks what it needs; a missing env file is
named with where it comes from (ONBOARDING.md § Env and Firebase files), and nothing is started.
The shared root `.env.<env>`, then `apps/web/.env` and `apps/web/.env.<env>`, are handed to the web dev
server as its process environment, a later file winning — the same order Nx gives a build, so the web's
own files win over the shared one (ONBOARDING.md § Env and Firebase files). The web's Vite plugins read
`process.env`, so this is what moves its endpoints. `apps/mobile/.env.<env>` is read for one value, the
Google sign-in client.

prod runs in the shell mode only, where the page carries a PROD band. While `yarn local` runs, the
shell's DEV | PROD switch starts the other backend's pair on its own ports — its own origin, so its own
sign-in — after asking first; only a person switches.

The agent procedure is [`dou-verify` § in-app shell](../../docs/config/skills/dou-verify/references/shell.md).

## A backend on this machine

`yarn local --env localhost` runs the web against services served from this machine, on its own
ports — the web on 5023, the shell on 5027 — so it never meets a dev or prod run. The page shows
LOCALHOST and offers no DEV | PROD switch.

It reads the shared root `.env.localhost`, `apps/web/.env.localhost` and `apps/mobile/.env.localhost`.
None is in the secrets repository, because the endpoints are whatever this machine serves, so make them
from dev's:

```bash
cp .env.dev .env.localhost
cp apps/web/.env.dev apps/web/.env.localhost
cp apps/mobile/.env.dev apps/mobile/.env.localhost
```

Then, in the root `.env.localhost`, change the endpoint of each service you run locally to the address
it listens on — `VITE_BACKEND_ENDPOINT`, `VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT` (a `ws://` address)
and the rest. The endpoints you leave alone keep going to dev, so one local service can run beside
dev's others, as long as they accept each other's sessions. `VITE_ENV` stays as copied: it picks the
stage rules the web applies, not where the backend runs. An endpoint still in
`apps/web/.env.localhost` wins over the root file, so delete it there (`yarn check:env` names one).

From the mobile file the shell reads one value, the Google sign-in client. Google sign-in works only
when that client lists `http://localhost:5027` as an authorised JavaScript origin; otherwise stay a
guest — the guest sign-in goes to the backend in the web's file, so it reaches the local one.
`yarn local:pair` drives the dev shell on 5007, not this one. `yarn local --env localhost --check`
names what is missing without starting anything.

What the shell imitates is the same on every backend (the table below). Two of its limits matter most
here: the web always holds the session itself, and keeps it in the page's own storage. A server change
that only shows when the app's runtime holds the session — its own socket and the user agent it sends,
its vault — is checked on a simulator ([a device check](../../docs/config/skills/dou-verify/references/device.md)).

## What is here

| File                                                     | What it is                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`hybrid-shell.config.ts`](../../hybrid-shell.config.ts) | The ports, the web command, the env files, and the shell's events and requests under this app's message names                 |
| `src/types.ts`                                           | The bridge contract as the shell's method and event tables, so a renamed message fails the config and the handlers to compile |
| `src/handlers.ts`                                        | The answers to app-only messages: `libs/fake-shell`'s boot answers and cache, preferences, sign-in, opening a URL             |
| `src/routes.ts`, `src/mobile.d.ts`                       | The mobile app's `resolvePushTapPath` and `resolveDeepLink`, as the push-tap and link events call them                        |
| `vite.shell.config.mts`, `src/stubs/`                    | The alias that reaches those functions, and the stub for the one native module they import — read by the shell server only    |
| `scenarios/`                                             | Scenario files the shell lists and runs                                                                                       |

The routing functions are the mobile app's own, not copies: reached through an alias (an import would
make `@chatic/mobile` a dependency of this project, and its typecheck would build the mobile app), with
their types written by hand in `src/mobile.d.ts`. `src/routes.spec.ts` calls the real functions through
the same alias, so a change in what the app returns fails it. The handlers' `OpenURL` checks a URL with
the app's own `isOpenableUrl`, reached and declared the same way, so the shell refuses exactly what a
device refuses. The config is read in Node by the CLI as well as by the shell page, and those
functions only load in the page, so the handler module — which only the page loads, before the shell
starts — hands them to the config's event maps.

Smaller constraints that hold the pieces together:

- `deeplinkUtils.ts` takes its invite-link decoder and sub WebView link readers from the `@chatic/shared`
  barrel, which also carries React components, image assets and the web's config. Only that one importer
  is pointed at a virtual module re-exporting `libs/shared/src/utils` (`SHARED_FOR_DEEPLINKS` in
  `vite.shell.config.mts`): the same code without the rest of the barrel. A new import from there needs no
  change here; one from elsewhere in `@chatic/shared` fails `deeplinkSharedImports.spec.ts` by name.
- The choice values (`DOU_SHELL_CHECKOUT` and the rest) and the store SKUs are written into
  `src/checkout.ts` by a Vite transform, not `define`: in dev `define` sets globals through Vite's client
  script, which the shell page never loads. The CLI reads that file in Node too, where the names stay
  undefined and the module answers "no choice".
- The store SKUs come from `apps/mobile/.env.dev` only. Falling back to another file could mix in
  production SKUs.

## What it imitates and what it does not

This table is the reference. Adding an imitation changes it in the same commit.

| Area                                                                                     | The virtual shell                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handshake, device info, safe area, theme                                                 | Imitated, per device preset                                                                                                                                               |
| Local cache (`FetchCacheData` and the rest)                                              | Answered from memory (`MemoryCache`). Kept across a relaunch, as the app's SQLite is; emptied by reloading the shell page                                                 |
| Settings: `SaveConfigValue`, `ClearConfigValue`                                          | Kept and injected again at every launch as `CHATIC_APP_CONFIG_BAG`, as the app does; emptied by reloading the shell page                                                  |
| Preferences: `Save/Delete/FetchPreference`                                               | Kept across relaunches; keys follow the app's allowlist and values its checks. A saved theme is not injected at the next launch — the device preset's theme is            |
| Push received / tapped, links, background and resume, Android back, network off and back | Made with the tools. A tap routes where `resolvePushTapPath` sends it; a link where `resolveDeepLink` does — a native-screen or rejected link fails the tool call instead |
| Opening a URL (`OpenURL`)                                                                | A new browser tab for the OS browser. What the app refuses fails with its code; the app's own scheme is a deep link, logged as unsupported                                |
| Network status                                                                           | Requests fail while offline, as on a device. The app's bridge has no network-status message, so the web hears no event for it                                             |
| Google sign-in                                                                           | Real — a Google popup (below)                                                                                                                                             |
| Apple sign-in                                                                            | **Not imitated.** Answered as the app answers a failed sign-in (`OAUTH_LOGIN_ERROR`), so the web shows its failure toast, and logged as unsupported                       |
| Push token (`FetchFcmToken`)                                                             | **Refused.** Named as `push.token`, which the shell never answers, so the web registers no device: a fake token would put a fake device on the server                     |
| App badge (`SetBadgeCount`)                                                              | **Recorded and shown** beside the phone and in `status().badge`. There is no OS badge                                                                                     |
| Photos, camera, file save, contacts, SMS, app icon, app update, haptics, file transfer   | **Not imitated.** No handler answers them: the shell refuses the request at once with a notice, which the web reads as an older app and falls back where it has one       |
| In-app purchase                                                                          | **Imitated on dev only, when picked** (§ Checkout): a virtual store with a fake price and a fake receipt the dev server refuses. Otherwise refused at once and logged     |
| Session held by the app's runtime (`RuntimeHello`)                                       | **Not imitated.** The shell offers no runtime, so the web settles on holding the session itself, over its own socket. The app-held path is checked on a simulator         |
| Device vault (`nativeSecure` storage)                                                    | **Not imitated.** The shell declares no storage medium, so the web keeps its session in the page's own storage, as a browser does                                         |
| Input: user agent, pointer, touch                                                        | **Not imitated.** The frame keeps the desktop browser's: Enter sends instead of adding a line, and focus does not scroll into view. Check those in the native mode        |

Details that are easy to get wrong:

- **Opening a URL** opens a blank tab first and sets its address after. With `noopener` in the features,
  `window.open` returns `null` whether or not a tab opened, so a blocked popup could not be told apart,
  and the opener can only be cut while the tab is still same-origin, before it navigates. The app's own
  refusal comes first and in its words, so a link the device would not open does not open here either.
- **A failed Apple sign-in** is answered with the shape the app fails with (`OAUTH_LOGIN_ERROR`), not
  `NOT_FOUND`: a `NOT_FOUND` would never reach the sign-in listener and would leave the button waiting.
- **The per-channel chat preview** is answered `NOT_FOUND`, as the app's memory cache does, which sends
  the web to a window per channel as an older app does; without it the home list waits on the panel's
  card.
- **The shell draws the badge the app sets but keeps no count to read back.**

Every request the shell does not answer is logged as `unsupported` and shown as a notice beside the
phone. What the shell cannot show is not a pass; check it on a simulator
([a device check](../../docs/config/skills/dou-verify/references/device.md)). Also not imitated: the OS
handing a link to the app, real backgrounding (sockets and timers keep running), OS notification
banners and sounds, and the room-open trace a native tap hands over.

A fresh browser profile starts on the app's onboarding, which holds a link until it is done; skip it
once and the settings above keep it done.

The web dev server sets no Content-Security-Policy, so nothing is stripped for the shell's frame.

## Checkout

The shell declares how it sells, in `CHATIC_APP_CAPABILITIES.checkout`, the way an app declares what it
can do, and the web's `checkout` port follows it (`apps/web/docs/bridge/host-ports.md`). It picks three
things, each kept in the shell's store and applied from the next launch:

| Choice   | Values                           | Start with                                                   | Kept under     |
| -------- | -------------------------------- | ------------------------------------------------------------ | -------------- |
| Backend  | `dev`, `prod`, `localhost`       | `yarn local --env <env>`                                     | the shell core |
| Checkout | `store` (default), `web`, `none` | `DOU_SHELL_CHECKOUT`; `apple`, `google`, `legacy` still read | `dou.checkout` |
| Sandbox  | on, off (default)                | `virtualShell.sandbox.set(true)`                             | `dou.sandbox`  |

`store` is the device preset's store: Apple's on an iPhone, Google's on Android, as the mobile app sets it
up. A picked `apple` or `google` is declared as it is, and `status().checkout.display` says when it differs
from the device. `legacy` declares nothing, so the web answers as for an app built before declarations.

**What the shell declares** — the table `src/checkout.ts` (`checkoutPlan`) holds and its tests pin:

| Backend   | Checkout | Sandbox | Declares `checkout` | Harness values (`CHATIC_SHELL_HARNESS`) | The shell shows                                                     |
| --------- | -------- | ------- | ------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| dev       | store    | off     | `[device store]`    | `sandbox: false`                        | — the virtual store answers                                         |
| dev       | store    | on      | `[device store]`    | `sandbox: true`                         | `SANDBOX (in-app: imitated)` and the in-app sandbox notice          |
| dev       | web      | off, on | `['web']`           | `sandbox`, `subscriptionWeb`            | `SANDBOX` when on                                                   |
| prod      | store    | —       | `[device store]`    | `sandbox: false`                        | on a refused catalog: "cannot be loaded — switch to web"            |
| prod      | web      | —       | `['web']`           | `sandbox: false`                        | `Real payment — pressing pay charges for real`                      |
| localhost | store    | —       | `[device store]`    | none                                    | on a refused catalog: "cannot be checked against the local backend" |
| localhost | web      | —       | `[]`                | none                                    | `The local backend has no payment server`                           |
| any       | none     | —       | `[]`                | none                                    | —                                                                   |

The sandbox cannot be switched on against prod or localhost; a sandbox kept from dev is dropped there.
Payments against a backend on this machine are not possible yet: the local backend harness runs no
payment server, and the subscription website has no local sign-in.

**Harness values.** Beside the declaration the shell injects `window.CHATIC_SHELL_HARNESS =
{ version: 1, sandbox, subscriptionWeb? }`. The web reads it only in a dev or local build, inside the
app's bridge; a production build ignores it, and the mobile app injects none (`src/mobileHarness.spec.ts`
pins that). With a declared `['web']` the web sells in its own checkout screen inside the app
(`/subscription/checkout`), as a browser tab does, signed in as the app is (ADR-0373). The harness values add
the sandbox: the calls carry `?sandbox=1` and the card window is a stand-in (the payment server's mock
provider: no real card, no charge). The account must be signed in with Google; a guest or a paired device is
refused by the server.

**From the app's debug settings.** Without the shell, a dev or local build of the web switches the same two
things in its debug overlay, Config: `port.checkout` is a list of the runtime's candidate adapters (those the
host does not offer are disabled) and `checkout.sandbox` is a switch, both applied at the next start. Inside
the shell the shell's sandbox wins, and Config says so.

**Which subscription website.** What still leaves for the subscription website — managing a subscription —
goes to this one. `DOU_SHELL_SUBSCRIPTION_WEB=<origin>` names a subscription website running
on this machine (`dou-landing` on dev, `dou-landing-prod` on prod). The shell asks it once when it starts
and puts it in `subscriptionWeb` only when it answered; otherwise the web uses the deployed one. A kept
`dou.subscriptionWeb` wins once it has answered. `status().checkout.subscriptionWeb` says which.

**When the store is not imitated.** Where the virtual store does not answer (prod, localhost, `legacy`),
the first refused catalog or purchase puts a notice on the shell page — never in the app's screen, whose
confirm screen keeps showing that it cannot sell. It says the in-app catalog cannot be loaded here and
offers **Switch to web**, which keeps `web` and relaunches the app; on localhost it says payments cannot be
checked and offers nothing. It shows once per shell page, and the log gets a `checkout.notice` line beside
the refusal.

**In-app sandbox notice.** Switching the sandbox on with a store checkout (or picking a store with the
sandbox on) shows a notice: the real in-app sandbox is set on the device and the store (a store test
account in the device's settings, a test build), not here; the sandbox here imitates the virtual store and
is checked up to the purchase only. A web checkout shows none — its sandbox carries on to the subscription
website.

**From an agent.** `window.virtualShell` carries the same choices, each relaunching the app:
`checkout.set('store' | 'web' | 'none')`, `sandbox.set(boolean)`, and `status()` with
`checkout: { chosen, declared, storeImitated, notice?, subscriptionWeb, display }` and
`sandbox: { on, chosen, available, inAppNotice }`. A refusal comes back as `{ ok: false, error: 'refused' }`.
The shell core has no picker for these on its panel yet, so the choices are made here or at start.

A declaration has to carry every key its version requires: a missing one reads in the web as a bug, not
as "the legacy answer". So the shell takes the lowest version that holds what was picked and declares each
key not picked as what the web would answer anyway for a shell that has a bridge (the device preset's
store for `checkout`).

`DOU_SHELL_MEDIA=browser` (or `shell`) declares who picks what a person attaches, in `media` — `browser` gives
the page's own file input, as a browser has, where the shell otherwise answers with the app's picker
messages. Declaring it takes declaration version 2, which has to carry `checkout` too; with `legacy` picked, the
shell declares the device preset's store, the answer the web would give anyway.
`dou.media` in the store wins over the variable, as for checkout. The old spellings `page` and `app`
are not read as `browser` and `shell`: the shell warns that the choice is ignored and declares nothing
for it.

`DOU_SHELL_FILES=browser` (or `shell`) declares who moves a message's files, in `files` — `browser` has the page
PUT uploads, fetch downloads and draw video frames from the bucket, as a browser does, rather than
asking the shell's transfer messages. It takes declaration version 3, which has to carry `checkout` and
`media` too: with `legacy`, `checkout` is declared as the device's store; unpicked, `media` is the same as `files`.
`dou.files` in the store wins over the variable. Picking `DOU_SHELL_MEDIA=shell` with
`DOU_SHELL_FILES=browser` is a pair no real host declares: the app's picker hands back videos and documents
as files in its own folder, which only its transfer module can send, so sending them fails. `src/checkout.ts` holds the choices, the declaration and the harness
values; the wrapped preset in `hybrid-shell.config.ts` appends both to the preset's own globals.

**The virtual store answers on dev only, and only for a store checkout.** A fake receipt must never
reach the production server. Its catalog has one product
per SKU the mobile app sells on dev — read from `apps/mobile/.env.dev` and no other file, as the app's
dev build reads it, so the server's plans join it as they join the real store's — each priced
`₩0 (virtual store)`. Without that file the catalog is empty, the plan cards show no price, and the
shell logs why. A purchase succeeds at once with a
`virtual-receipt-…` token; the web then asks the dev server to validate it, which refuses, and the web
shows that refusal. So the store path can be followed from the price to that refusal, never further.
Finishing and listing held purchases work on what the virtual store sold since the page loaded; opening
the store's subscription management is not imitated. On prod, on localhost, or with `legacy`, every store call
is refused at once as unsupported — a purchase also gets `OnPurchaseError`, so the web does not wait a
minute for a sheet that is not there.

## Sign-in

The app signs in with the native Google SDK and hands the ID token to the web. The shell gets the same
kind of token from Google Identity Services, for the same client (`VITE_GOOGLE_WEB_CLIENT_ID` from
`apps/mobile/.env.<env>`, the one the native SDK is configured with), so the server verifies it the same
way. When the web asks to sign in with Google, a sheet rises over the phone with Google's own button;
Cancel answers the web as a cancelled sign-in (`result: null`).

Outside this repository each client must list its shell's origin as an authorised JavaScript origin:
`http://localhost:5007` on the dev client, `http://localhost:5017` on the prod one, and
`http://localhost:5027` on whichever client `apps/mobile/.env.localhost` names (§ A backend on this
machine).

The web is also ready for the shell's relay sign-in (the core package's `oauth-relay` preset), which
this config does not use yet. That preset sends the popup to the organisation's OAuth relay, as the
desktop app does, and the handler hands its answer to the web as it is: a relay code
(`{ provider, platform, code }`) instead of an ID token. The web's login screen exchanges the code
with `verify-oauth-code`, signed with the guest session the shell's web already holds, so the guest is
linked to the account the way a native sign-in links it; the account hub's Link Google sends the code
to `auth.link-account`.

A person signs in, in the browser the agent drives — the session lives in that browser profile's
storage for the shell's origin and survives relaunches. An agent never picks an account or types a
password.

### Signing in from a terminal: `yarn local:pair`

The way to a signed-in shell with no Google popup and no account typed anywhere: a phone that is
already signed in approves it (device pairing).
[`scripts/pair.mjs`](./scripts/pair.mjs):

1. reuses the dev shell when one answers on `5007`, or starts `hybrid-shell local` (and stops it on
   Ctrl-C);
2. opens the shell in a visible Chromium window whose profile lives in `~/.cache/dou-local-pair`
   (`DOU_SHELL_PROFILE` moves it), so a sign-in made once is still there on the next run;
3. signed in already — prints `Connected: signed in as …` and keeps the window;
4. a guest — opens "Sign in with another device" in the app, prints the code
   (`Code: 0734-4168`) and waits. On the phone: DoU › My page › Approve web sign-in, then the code (or
   scan the QR shown in the window). An expired code is replaced and printed again;
5. approved — prints `Connected: …` (the account, or the cloud entered as a guest when the phone
   approved one cloud only) and keeps the window until Ctrl-C or until it is closed.

It needs the device pairing flag, which is on in dev, and the env files `yarn local` needs. The
shell it signs in is a secondary device of the phone: signing out on the phone (or removing the
approval there) signs it out too.

## Scenarios

| File                   | What it checks                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `push-opens-room.yaml` | A room message tapped from the background opens its room (`vars.room`: a room the session is in) |
| `invite-link.yaml`     | An invite link opens the app on its invite screen — run past onboarding                          |
| `offline-socket.yaml`  | Offline, the chat socket fails, and it reconnects once back online                               |

Run one in the shell page with `virtualShell.scenario.run('/__shell/scenarios/<file>')`, or from a
terminal against a running shell with `npx hybrid-shell run apps/shell-adapter/scenarios/<file>`.
