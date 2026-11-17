# @chatic/host

**How a feature reaches the host it runs in.** The phone app, the desktop app, a browser tab and the
development shells can each do different things: pick photos, sell through a store, open a URL outside,
keep a vault. A feature does not ask which host it is in. It asks a **port** — an interface with one
implementation per host — and the app's entry point chooses those implementations once, from what the
host declared before the page ran. Only that entry point and `@chatic/bridges`' host profile ask the
host what it is; lint holds the rest of the code to the ports.

The decision and its reasoning are ADR-0324. Ports arrive one domain at a time, each with the step that
moves its domain's features onto it. `checkout` is the first.

## Ports

### `checkout`

How this host sells a subscription. A union, so a result says what actually happens:

| `kind`  | Means                                                             | Offers                                                                                     |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `store` | An app store sells, inside the app (`store`: `apple` or `google`) | `products()`, `purchase()`, `finish()`, `currentPurchases()`, `openManagement()`           |
| `web`   | The website sells; the buyer is handed over                       | `open(url)` — the purchase completes there, and this page learns of it from the membership |
| `none`  | Nothing is sold here                                              | —                                                                                          |

`resolveCheckoutMethod(profile)` is what the entry point chooses from. It reads the declaration key
`checkout`, introduced in declaration version 1: a list of `'apple' | 'google' | 'web'`, preferred first.
The first entry the page knows is taken, so a method added later is skipped by an older page rather
than misread; `[]` sells nothing. A key missing from a version-1 declaration, or a value that is not a
list, is a bug in the shell and sells nothing, and so does a declaration that cannot be read at all.
A shell that declares nothing gets the legacy rule, which is what the screens did before the port: a bridge means a store, Apple's
when `CHATIC_APP_PLATFORM` is `ios` (any case) and Google's otherwise, and no bridge means the website.
A desktop shell has a bridge too and so reads as Google's store under that rule; nothing in the desktop
app sells, and it publishes `none`.

The implementations live in the one app that sells, `apps/web` (`src/app/host/checkout/`); see its
`docs/bridge/host-ports.md`. Product rules — which tiers may be sold, who bills a membership, whether
the website may take a buyer (`canCheckoutOnWeb`) — stay in the subscription feature and take the
port's `kind` as input.

### `media`

Who picks the photos, videos and documents a person attaches: `{ kind: 'app' }` — the app's own picker,
photo library, video conversion and the permission prompts behind them — or `{ kind: 'page' }`, the
page's own file input.

**The port carries the choice only.** The app-side picker and photo library take their types from the
data layer (`ChatAttachmentSource`, `ShellFileRef`) and the runtime (`PrepareVideoPort`), which
`layer:host` keeps this package away from. So they stay in `apps/web` (`bridge/attachmentPicker.ts`,
`bridge/photoLibrary.ts`) and read this port to know whether they apply, as do the screens around them
— the camera input's permission wait, the recent-photos strip, video conversion before a send and the
permission banner's settings link (`apps/web/docs/bridge/host-ports.md`).

`resolveMediaMethod(profile)` reads the key `media`, introduced in declaration version 2: `'app'` or
`'page'`. A shell declaring version 1 — the first builds that declared `checkout` — never knew the key,
so the legacy rule answers for it: a bridge means the app picks, as the screens assumed. A
declaration of version 2 or later without the key, or with another value, is a bug in the shell and gets the page's input,
the one picker every host has. Message by message, an older app's missing request (`NOT_FOUND`) still
falls back the way it did; the declaration says who picks, not which of the app's messages exist.

### `files`

Who moves a message's files: `{ kind: 'app' }` — the app's transfer module uploads and downloads in the
background, keeps a downloaded file to open, save or share, and reads a video's first frame from the
device — or `{ kind: 'page' }`, the page's own requests: a PUT for an upload, a fetch saved under the
file's name for a download, a frame drawn from the bucket's copy.

It carries the choice only, for the reason `media` does: the transfer modules take their types from the
data layer and the runtime. They stay in `apps/web` (`bridge/shellUpload.ts`, `bridge/shellDownload.ts`,
`runtime/upload/`, `runtime/transfer/`) and read this port, as do `useFileDownloads` and the video-frame
maker (`useVideoFrames`).

`resolveFilesMethod(profile)` reads the key `files`, introduced in declaration **version 3**. Version 2
shipped with `media` alone, so a build declaring 1 or 2 never knew the key and the legacy rule answers:
a bridge means the app moves files. A declaration of version 3 or later without the key, or with another value,
gets the page's requests, the ones every host can make, and a warning.

## Who imports it

`apps/web` and `apps/desktop-web`, each from one file: `src/app/host/publishHostPorts.ts`, which
`main.tsx` calls right after `config.init()`, before the first render. Features import `host` to read a
port — `apps/web`'s subscription feature reads `checkout`, its attach flow `media`, and its file
transfers `files`.

```bash
git grep -n "@chatic/host" -- apps libs ':!*.md'
```

## The facade

```ts
import { host } from '@chatic/host';

host.publish({
    /* one implementation per port */
}); // the entry point, once
host.ports.checkout; // a feature, at the point of use (once the port exists)
```

- **Published once.** A second `publish` throws rather than replacing the first: every caller that had
  already read a port would keep the old one, with nothing to show it.
- **Read at the point of use, never at module scope.** A module evaluated before `publish` would throw,
  and one evaluated after would keep what it read first. `config.get()` follows the same rule.
- **A module facade, not a React context.** Logging, the boot sequence and other plain modules need the
  host too, and a context cannot reach them.
- `host.isPublished` lets a caller that can do without the host — a crash screen — check first.
  `host.resetForTests()` is for tests only.

## Rules

1. **Every port field is required.** A host that cannot do something gets an implementation that says
   so (`checkout.kind === 'none'`, a picker that answers `unavailable`), never a missing field that a
   feature then fills with a browser's answer.
2. **A port talks to the host, not to the relay.** The package is tagged `layer:host`; the root lint
   config keeps it off the data layer, the runtime and its adapters, the React surface and React itself.
   It may use `@chatic/bridges` (the host profile, the bridge) and `@chatic/bridge-messages`.
3. **Product rules stay out.** What a membership allows, which tier sits next to which, who bills a
   membership — those stay pure, in the feature, and take a port's facts as input. Only "what this host
   can do" comes from a port.
4. **Implementations only one app uses stay in that app** — the desktop ones in `apps/desktop-web`, the
   fakes beside the virtual shell and the e2e suite. Implementations both apps use live here.

## The lint rule

`@nx/workspace-host-facts` ([`tools/eslint-rules/host-facts.js`](../../tools/eslint-rules/host-facts.js))
reports any use of `isNative()` (or of app-runtime's `isNativeApp()`, the same question asked
again) and any read of a `CHATIC_APP_*` global off `window` — directly, through a local name for
`window`, or through a function that returns it — outside the allowed files. Its allow-list,
[`tools/eslint-rules/host-facts-allowlist.js`](../../tools/eslint-rules/host-facts-allowlist.js),
started with every file that did either when the rule arrived. A domain that moves onto its port takes
its files off, so the list is the migration's progress. The debug overlay stays on it, because
showing the raw host facts is its job.

## How to verify

```bash
npx nx test @chatic/host
npx tsc -b libs/host/tsconfig.json
npx nx test eslint-rules
```
