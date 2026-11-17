# ADR-0324: The host declares what it can do, and features reach it through ports chosen at the entry point

> Status: Accepted · Decided: 2026-11-16 · Implemented: `refactor/host-profile-in-bridges` (step 0),
> `refactor/host-ports-frame` (step 1), `feat/host-checkout-port` (step 2), `feat/virtual-shell-checkout`
> (§ 5, for `checkout`), `feat/host-media-port` (step 3, `media`), `feat/host-files-port` (step 3, `files`),
> `feat/host-ports-rest` (steps 4–7, together)
> · The profile is documented in [libs/bridges § The host profile](../../libs/bridges/README.md#the-host-profile),
> the ports and the lint rule in [libs/host](../../libs/host/README.md)
> · Scope (step 0): removed `libs/device-utils`; `libs/bridges` (`src/host/`), `libs/bridge-messages`,
> `libs/runtime-web`, `libs/shared`; the config adapters of `apps/web`, `apps/desktop-web` and
> `apps/admin`; `apps/web` (the device store, the runtime offer)
> · Scope (all steps): new `libs/host`, the phone and desktop shells' boot globals, `apps/shell-adapter`,
> `libs/fake-shell`, `tools/eslint-rules`, and the features of `apps/web` and `apps/desktop-web`

## Context

The web runs in four hosts: the phone app's WebView, the desktop app's window, a plain browser tab,
and, for development, the virtual shell (`yarn local`) and the e2e suite's fake shell. What the page
may do differs between them — pick a photo, sell through a store, hand a buyer to the website's
checkout, open a URL in the OS browser, keep a vault, own the session.

Almost all of it is decided by one function. `isNative()` in `@chatic/bridges` reports whether a
message handler global is on `window`, and screens branch on that answer directly. At the time of
writing, 67 non-test files in `apps/web` and `libs` call it, 15 more in `apps/desktop-web`, and 17
files there name `window.CHATIC_APP_PLATFORM`, most of them to tell iOS from Android on their own.
To recount:

```bash
grep -rl "isNative()" apps/web/src apps/desktop-web/src libs --include='*.ts' --include='*.tsx' \
  | grep -v -E '\.(test|spec)\.|/dist/' | wc -l
```

That one boolean answers three different questions, and it is right about only the first:

| Question                               | Example                                                                    | Answered today by          |
| -------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| Is there a bridge to talk to?          | Can a message be posted at all                                             | `isNative()` — correctly   |
| What can this host do?                 | Pick photos, sell through a store, keep a vault, own a session             | `isNative()` — by guessing |
| Which product rule applies to it here? | No website checkout inside a store app; pairing approval on the phone only | `isNative()` — by guessing |

The guesses hold only while every host that has a bridge can do everything the phone can. They
already fail in places. The desktop shell has a bridge, so `isNative()` is true there, and a
store-platform guess written as "iOS, otherwise Google" names Google on a desktop. The virtual shell
has a bridge too, so the subscription screens take the store path, and the store path has no
answer there: a person checking the website's checkout in the shell cannot reach it, and a person
checking the store path cannot complete it. Neither can be chosen from outside; the only lever is
which host the page happens to run in.

Two parts of the app have already moved off the guess, and they show the shape that works:

- **Storage media** (ADR-0293): the shell lists the media it keeps in
  `window.CHATIC_APP_STORAGE_MEDIA` before the page runs, and the web reads that list and nothing
  else. Its reader says in its own comment that `isNative()` cannot answer the question, because it
  is true in every shell, including ones that keep no vault.
- **Session ownership** (ADR-0309): a shell that can own the session says so in
  `window.CHATIC_APP_RUNTIME`.

The runtime itself has gone further. ADR-0301 split it into contracts (`RuntimePorts`, every field
required), one assembly, and a platform adapter per host, held by lint. What differs between hosts
comes into the core as a port, and nothing in the core asks which host it is in.

The rest of the app — the screens and their hooks — never got that treatment.

## Decision

**A host declares what it can do. One object built at boot holds that declaration. The entry point
uses it to choose one implementation for each capability port, and features reach the host only
through those ports.**

### 1. The host profile

`HostProfile` is one typed, frozen object, built **once, synchronously, before the first render**,
from exactly two inputs:

1. **The shell's declaration** — boot globals the shell sets before the page's own scripts run.
   A declaration names capabilities and their parameters (which store sells, which media are kept).
   It does not name a host kind for features to branch on.
2. **The legacy rule** — for a shell that declares nothing, because it was built before this
   decision. The rule reproduces today's `isNative()` and `CHATIC_APP_PLATFORM` behaviour exactly, so
   an installed app keeps behaving as it does now while the web deploys ahead of it.

There is no third input. A developer who wants another host changes what the host declares — the
virtual shell's preset (§ 5), or a development build of the app — rather than overriding the
profile from inside the page. Every profile therefore traces back to one statement a host made.

**The declaration is one object**, `window.CHATIC_APP_CAPABILITIES`, versioned:

```ts
window.CHATIC_APP_CAPABILITIES = {
    version: 4,
    checkout: ['apple'],
    media: 'app',
    files: 'app',
    links: 'app' /* … appShell, signIn, diagnostics, push */,
};
```

One object rather than one global per capability, because it is the only shape in which absence
means one thing. With separate globals, a missing global reads the same whether the shell predates
the capability or knows it and cannot provide it, and a new shell that forgets to inject an empty
list is silently given the legacy guess. With one object:

- **No object** — a shell built before this decision. The legacy rule answers every capability.
- **An object, and a key its version requires is missing** — a bug in the shell. It is logged, and
  the capability is answered as unavailable, never guessed.
- **An object with a version newer than the web knows** — the keys the web knows are read; the
  rest are ignored.
- **An object whose version predates a key** — that shell never knew the key, so its silence is not a
  bug: the legacy rule answers that key. Each key records the declaration version that introduced it.

So every capability has a legacy rule, including one added long after the first shells declared.
Where nothing the page did before declarations existed can be reproduced — the capability is new —
its legacy rule answers "unavailable", so a new key never needs a guess written for it. The first key,
`checkout`, is version 1 and arrived with step 2: a list of `'apple' | 'google' | 'web'`, preferred
first, of which the page takes the first it knows; `[]` sells nothing. Its legacy rule is the one the
screens used: a bridge means a store, Apple's on `ios`, and no bridge means the website.

`media` is version 2 and arrived with step 3: `'app'` or `'page'`. A version-1 declaration — the first
builds that declared `checkout` — never knew it, so its legacy rule answers: a bridge means the app
picks. The `media` port carries that choice and nothing more. The picker and photo library it chooses
between take their types from the data layer and the runtime, which `layer:host` keeps out of reach, so
they stay in `apps/web` and read the port — a narrower port than § 2 describes, for a domain only one app
has.

`files` is version 3, the rest of step 3: `'app'` or `'page'`, for uploads, downloads and a video's first
frame. It is not version 2 because version-2 declarations were already being built without it: had the
key joined version 2, those builds would read as declaring it missing and move files through the page.
Declarations of version 1 or 2 get the legacy rule — a bridge means the app — and the port is as narrow
as `media`'s, for the same reason.

`links`, `appShell`, `signIn`, `diagnostics` and `push` are version 4, all five together, and arrived
with steps 4–7 in one change. Each is `'app'` or `'page'` like `media` and `files`; the ports for
`appShell` and `signIn` add `os`, the phone platform where the app does the work, because the badge and
Apple's sign-in differ by platform. They share one version so that no build can declare some without
the others: had the steps landed apart with a version each, a build cut between two merges would have
declared a version whose earlier key was missing, and been answered "the page" for it. Declarations of
version 1 to 3 get the legacy rule for all five.

`CHATIC_APP_STORAGE_MEDIA` and `CHATIC_APP_RUNTIME` stay where they are. Shipped shells inject them,
and the profile reads them alongside the new object; they are not moved into it.

The handshake (`OnWebAppReadyPayload`) is **not** an input. It arrives after the first render, and a
profile that changes after the first paint is a screen that flickers between two hosts. The
handshake's `supportedWebMessages` keeps its current job: falling back per message when a shell
predates a request (`NOT_FOUND`).

**The profile lives in `@chatic/bridges`**, beside `isNative()` and `shellKeepsStorageMedium()`, which
already read what the shell injected. `HostProfile`, its declaration reader, `resolveCapability`
(which says, per capability, whether the declaration or the legacy rule answers) and
`buildHostProfile` are plain functions and a frozen object — no React,
no store — so `@chatic/bridges` stays free of both. It sits low enough for every reader:
`@chatic/runtime-web` (storage media, session owner), each app's config adapters (the stage and the
platform `@chatic/config`'s `env` port answers, which the adapters used to read off `window`, and
whether the shell lane is wired at all) and `@chatic/host`. Apart from the entry-point file (§ 3) and
the debug overlay (§ 4), `@chatic/bridges` becomes the only code that reads a `CHATIC_APP_*` global,
as the lint rule's allow-list empties. For the readers that must see a value after boot it offers two
live reads — `liveShellGlobals()` for the boot globals as they stand now, and `liveShellValue()` for the
values a shell writes while the page runs — so they too go through it.

The profile holds what a shell states once per page load: the bridge channel, by kind; the identity
and version globals, exactly as injected; the storage media; the session-owner offer; and the
declaration. Globals a shell writes again while the page runs — the log upload hold, the theme, the
config bag — are not host facts and stay out of it. The phone also runs its boot script a second time
after load, which can rewrite the device ids and the version check; the profile keeps the first
values, and the device store in `apps/web`, which changes while the app runs anyway, reads them live.

`@chatic/device-utils` is removed, because it claimed that role without holding it — the bridge
library and the config adapter read those globals too. Its pieces go where their readers are: the
global reading into `@chatic/bridges`; the user-agent prefixes the phone app stamps into
`@chatic/bridge-messages`, the vocabulary the shell and the web both compile against; and the device
and version store with its `useDeviceInfo` hook, which is React and changes while the app runs (a
shell announcing a newer version), into `apps/web`. The live version stays out of the profile,
which never changes after boot.

### 2. Capability ports

What the host does for a feature is a **port**: an interface the feature calls, with an
implementation per host. Ports are grouped by domain, not by call site:

| Port          | Covers                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| `checkout`    | the sellable catalog and prices, purchase, restore, opening subscription management |
| `media`       | photo library, camera, file picking, the permission state behind them               |
| `files`       | upload, download, video frames                                                      |
| `links`       | opening a URL outside the app, clipboard, share intake, SMS and contact invites     |
| `signIn`      | social sign-in providers and account linking                                        |
| `appShell`    | app icon, badge, haptics, back handling, keyboard, theme and language sync, update  |
| `diagnostics` | the log sink, the telemetry entry point, issue reports, boot metrics                |
| `push`        | device registration and notification preferences                                    |

Each port has the implementations its hosts need: **native bridge** (phone), **browser**,
**desktop** where the desktop shell differs, and **fake** (the virtual shell, tests and stories).
Storage and the session are not on this list. They are `RuntimePorts` already, and stay there:
`RuntimePorts` belongs to the React-free core (ADR-0301), and these ports serve screens.

**The ports live in a new library, `@chatic/host`**, created in step 1 rather than when a
port is first shared: both `apps/web` and `apps/desktop-web` take their ports from it from that
step on. It holds:

- the port interfaces;
- the browser and native-bridge implementations, which both apps share.

It reads the profile from `@chatic/bridges` (§ 1) and does not define it, so a runtime adapter never
has to depend on a library of screen ports.

Implementations only one app uses stay in that app: the desktop ones in `apps/desktop-web`, the fakes
beside the virtual shell and the e2e suite. The library is tagged `layer:host`. It may depend on
`@chatic/bridges` and `@chatic/bridge-messages`. It may not depend on React,
the React surface (`@chatic/app-runtime`) or `@chatic/runtime-core`. The data layer is out of reach
on purpose: a port talks to its host, not to the relay.

Rules every port follows:

- **Every field is required**, as in `RuntimePorts`. A host that cannot do something gets an
  implementation that says so (`checkout.kind === 'none'`, a picker that reports `unavailable`), not
  a missing field that a feature then fills with a browser's answer.
- **A result says what actually happened.** A store purchase completes in place and returns the
  store's receipt. A website checkout leaves the app and completes elsewhere. The checkout port's
  result is therefore a union that can say "handed off", not a promise that the website
  implementation would have to fake. Validating a receipt with the relay is not the port's job: it
  stays in the subscription feature, which already refuses before the store opens and validates
  after it closes.
- **Product rules stay pure and take the port's facts as input.** The membership states, the tier
  adjacency rule and the cloud allowance do not move into ports. "Who bills this membership" comes
  from `membership.platform`, not from the host. Only "what this host can do" comes from a port.
- **A rule that belongs to the binary is enforced by the binary.** "A store-distributed app does not
  point a buyer at another way to pay" is a condition of the store's review of the app. So the
  production phone app does not declare a website checkout, and the web does not re-check the stage.

### 3. One entry point chooses

Each app chooses its implementations in one file, called from `main.tsx`, next to the config and
runtime wiring that already live there. The chosen ports are published once, as a module facade in
the shape of `config` and `runtime`. A second publish is refused. Non-React callers such as logging
need the ports too, so they are not a React context. Consumers read a port at the point of use,
never at module scope — the same rule `config.get()` follows, for the same reason.

That file is also the only place outside the profile reader where `isNative()` and the `CHATIC_APP_*`
globals may be read.

### 4. Lint holds the boundary

A workspace rule in `tools/eslint-rules/` reports a call to `isNative()` or a read of
`window.CHATIC_APP_*` outside the allowed files. The rule starts with an **allow-list of every file
that does it today**. Moving a domain onto its port removes its files from the list, so the list is
the progress report and cannot grow without a reviewed change to the rule's options. The debug
overlay stays on the list for good: it shows the raw host facts, which is what it is for.

### 5. The virtual shell declares like any other host

`@lemoncloud/hybrid-shell` accepts an app's own preset object in place of a preset name, and exports
its built-in presets. `hybrid-shell.config.ts` therefore wraps the `app-bridge-host` preset: its
`globals()` script runs first, and the wrapper appends `CHATIC_APP_CAPABILITIES`. The shell needs no
change.

`globals()` receives the shell's handler store (`HandlerContext.store`), which survives a relaunch.
What the virtual shell declares is read from that store, so a handler or a scenario that changes it —
`checkout: ['web']` to check the website hand-off, a store to check the purchase path against the
fake implementation — takes effect at the next relaunch, the way a real host's declaration does.

As built for `checkout`: a person picks the method with `DOU_SHELL_CHECKOUT` when starting the shell,
and a choice under `dou.checkout` in the store wins over it (the shell offers no tool to write the store
yet, so nothing does). Unset, the shell declares nothing and the web takes the legacy store path, as
before; the shell itself now refuses the store's calls at once rather than leaving them to its panel. The fake store is the shell's, not the web's: its handlers answer the store's bridge messages
with a fake catalog and a fake receipt, on dev only, and the web's real store port drives them — so the
web's own purchase code runs, up to the dev server refusing the receipt. Two things the decision
assumed did not hold: Vite's `define` does not reach the shell page in dev (a transform plugin writes
the values in instead), and the shell's handler context does not say which backend it runs against
(the wrapped preset's `globals` records it, since it is told).

## Migration

One domain per pull request, each with no change in behaviour on a shell that declares nothing:

0. **The profile.** `@chatic/device-utils` removed and split as § 1 says; `HostProfile`, the
   declaration reader and `resolveCapability` in `@chatic/bridges`, with no capability defined yet,
   so no legacy rule either — the profile's `bridge` reproduces `isNative()` for the readers that moved;
   the config adapters and `@chatic/runtime-web` reading the profile instead of `window`. This
   decision lands with this step.
1. **The ports' frame.** `@chatic/host`, the facade and the lint rule with its full allow-list. No
   feature moves yet.
2. **`checkout`**, the first feature. It has the clearest host split, and its fake implementation is what makes
   both purchase paths checkable in the virtual shell.
3. `media` and `files`.
4. `links`.
5. `appShell`.
6. `signIn`.
7. `diagnostics` and `push`.

Steps 4–7 landed as one change, for the declaration's sake (§ 1: one version for all five keys). Two
things were decided there that this section did not foresee:

- **Libraries read the profile, not the ports.** `@chatic/app-runtime` and `@chatic/theme` are rendered
  by apps that publish no ports (`apps/admin`, `apps/landing`), so their few host questions — is there a
  bridge, which platform — read `hostProfile()` from `@chatic/bridges`, which answers what the ports'
  legacy rule answers.
- **Domains the port list does not name went to the nearest port**: device pairing to `signIn` (the
  device that holds the account approves), the app's return to the foreground to `appShell`, who held
  the session (stamped on logs) to `diagnostics`, and notification-driven recovery to `push`.

With that, the allow-list holds only its permanent entries: the reader, the two entry points and the
debug overlay.

`apps/desktop-web` adopts each port as its domain moves. The phone and desktop shells start
declaring capabilities in their next releases (`feat/shells-declare-checkout`: the phone its store,
the desktop `checkout: []`). The legacy rule is deleted when the version floor
([ADR-0292](./0292-a-phone-app-below-the-version-floor-sees-only-the-update-screen.md)) is raised past the first builds that declare.

## Alternatives

- **Keep `isNative()` and add helpers** (`isStoreApp()`, `canPickPhotos()`). Cheaper, but each helper
  is still a guess derived from the same boolean, and nothing outside the page can change its
  answer. That is the problem this decision exists to solve.
- **Use `@chatic/config`'s `shell` lane as the declaration.** The lane holds what the web saved
  through the bridge, which the app stores without reading and injects again at every launch
  (`CHATIC_APP_CONFIG_BAG`). It is a persisted choice the web made, not a statement the host makes.
  A value written once would outlive the host that justified it.
- **One global per capability**, as `CHATIC_APP_STORAGE_MEDIA` is. It matches that precedent and lets
  a shell adopt capabilities one at a time, but an absent global cannot tell an old shell from a new
  one that cannot provide the capability (§ 1).
- **A developer override in `@chatic/config`'s `local` lane.** It would let a page swap its own
  host, which is a third source the profile has to explain, and the one a production device must
  never use. Changing what the host declares gives the same control from outside the page.
- **Use the handshake as the declaration.** It already carries `capabilities`, but it arrives after
  the first render. Every screen would need a "host not known yet" state, or would paint once and
  then change.
- **User-agent sniffing.** The shells stamp a prefix on the user agent, but a prefix says which shell
  is speaking, not what it can do, and it brings back the host-kind branching that ports remove.
- **One port per call site.** It would mirror the 67 files rather than the eight domains, and give
  every screen its own interface to keep in step with the bridge.
- **React context instead of a module facade.** Natural for screens, but unreachable from logging,
  the boot sequence and other non-React callers. It would also be a second way to reach the host
  beside the facade those callers would still need.
- **A dependency-injection container.** One object of ports, passed once by the entry point, is
  all the app needs. A container adds lookup by name where a missing field should be a compile error.

## Consequences

- The virtual shell, the e2e fake shell and component harnesses choose a host by what they
  declare, so the website checkout and the store path become separately checkable without a device.
  The wrapped preset (§ 5) rests on the shell's published types; it has not been run yet, and step 2
  is where it is.
- Switching a real device to another host needs another build. If that turns out to be too slow, a
  native debug setting that changes the app's declaration keeps the rule that only a host declares;
  a page-side override would not.
- A new library, `@chatic/host`, and a new layer tag join the workspace, with the constraint in the
  root lint config beside the ones ADR-0301 added.
- The phone and desktop shells each need a release to declare. Until the floor passes those
  releases, two sources describe the same host — the declaration and the legacy rule — and both are
  tested.
- A new capability costs three things: a field on a port, an implementation per host, and a line
  in the declaration. A capability a host cannot provide still needs its explicit "unavailable"
  implementation.
- `isNative()` stays exported from `@chatic/bridges`, with its meaning narrowed to "a message handler
  is present". The lint rule keeps it out of features.
- The profile is taken at boot. A shell that put its channel on `window` only after the page's scripts
  started would read as no shell. The storage choice made at the same moment already assumed the
  channel was there, so the profile adds no assumption — it makes that one moment the source for every
  reader that moved onto it. `isNative()` keeps reading live for the bridge client's own readiness.
- A host that learns a capability only after boot cannot change the profile in place. It has to
  reload the page with the new declaration. This matches what ADR-0301 accepted for storage media.
