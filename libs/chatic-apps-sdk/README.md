# chatic-apps-sdk

Build pages that run inside the DoU app. A page on `https://<name>.apps.chatic.io` opens in the app
over everything else, and talks to the app through this library: close itself and hand back a result,
title the app's bar (when the page asks for one), play a haptic, share, copy, open a link outside, keep its own data on the device,
get a key to keep the user's data under on a server, take Android's back button, and ask before the
user closes it. Users reach it in the app only — a link to it never opens it in a browser — but the
same page runs in a plain browser tab too while you build it, where the library falls back to what the
browser can do.

Published as `@lemoncloud/chatic-apps-sdk`. No runtime dependencies. `GUIDE.md` in the package says how
to set up a project and what the bundle looks like; `AGENTS.md` holds the rules for an AI assistant
writing a page.

## Install

```bash
npm install @lemoncloud/chatic-apps-sdk
```

Or, with no bundler, one script that defines `window.ChaticAppsSDK` (pin the version; the mock below
is not in this file):

```html
<script src="https://unpkg.com/@lemoncloud/chatic-apps-sdk@0.2.0/chatic-apps-sdk.global.js"></script>
```

## Start

```ts
import { connect, ChaticAppsError } from '@lemoncloud/chatic-apps-sdk';

try {
    const apps = await connect();
    document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
} catch (error) {
    // `UNSUPPORTED_PROTOCOL`: the app is newer than this library — update the library, and tell the
    // user this page needs an update. `TIMEOUT`: the app did not answer (see "Rules worth knowing").
}
```

Call `connect()` when the page starts. In the app it waits for the app's answer (a few
milliseconds); in a browser it returns at once. Calling it again returns the same connection, so any
part of the page may call it. Everything below is a method on what it returns.

## A complete page

One file, no build step. Save it as `index.html`, open it in a browser, and it runs with the browser
stand-ins; deployed to your `apps.chatic.io` address, it runs in the app.

```html
<!doctype html>
<html lang="ko">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Quiz</title>
        <script src="https://unpkg.com/@lemoncloud/chatic-apps-sdk@0.2.0/chatic-apps-sdk.global.js"></script>
    </head>
    <body>
        <h1 id="score">0</h1>
        <button id="plus">+1</button>
        <button id="share" hidden>Share</button>
        <button id="done">Done</button>
        <script type="module">
            const { connect } = window.ChaticAppsSDK;
            const apps = await connect();
            let score = 0;

            document.documentElement.dataset.theme = apps.context?.theme ?? 'light';
            apps.onContextChange(context => (document.documentElement.dataset.theme = context.theme));

            document.getElementById('plus').onclick = () => {
                score += 1;
                document.getElementById('score').textContent = String(score);
                apps.haptic('selection');
            };

            // Offer only what this app can do here.
            const share = document.getElementById('share');
            share.hidden = !(apps.supports('share') || !apps.inApp);
            share.onclick = () => apps.share({ message: `I scored ${score}`, url: apps.link({ score }) });

            document.getElementById('done').onclick = async () => {
                if (apps.inApp) await apps.finish({ score });
            };
        </script>
    </body>
</html>
```

## What a page can do

| Call                                                          | In the app                                                                                     | In a browser                        | Needs permission                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `finish(result?)`                                             | Closes the view; `result` (JSON, ≤ 16 KiB) goes back to the opener                             | `NOT_IN_APP`                        | —                                                                          |
| `setTitle(title)`                                             | The app's bar shows it, if the page asked for the bar (1–100 characters)                       | `document.title`                    | —                                                                          |
| `haptic(kind)`                                                | `selection`, `impact`, `success`, `warning`, `error`                                           | a short vibration, if any           | —                                                                          |
| `onBack(handler \| null)`                                     | Android back calls `handler` and does nothing else                                             | never called                        | —                                                                          |
| `onCloseRequest(handler \| null)`                             | Asks before the user closes; return `true` to close                                            | never called                        | —                                                                          |
| `reportError(error)`                                          | Into DoU's log, under your origin (20 per page load)                                           | `console.error`                     | —                                                                          |
| `copy(text)`                                                  | The clipboard                                                                                  | the browser's clipboard             | `clipboard`                                                                |
| `share({ title, message, url })`                              | The share sheet; waits for the user (see below)                                                | Web Share, else copies (`'copied'`) | `share`                                                                    |
| `openUrl(url)`                                                | The browser, mail, phone, SMS or a store                                                       | a new tab                           | `openUrl`                                                                  |
| `getUserKey()`                                                | 64 hex characters, the same for this device and site                                           | `NOT_IN_APP`                        | `userKey`                                                                  |
| `link(params?)`                                               | A link that opens this page in the app (see below)                                             | the page's own root                 | —                                                                          |
| `storage.get(key)`, `.set(key, value)`, …                     | Your page's own storage on the device (see below)                                              | `localStorage`, same limits         | —                                                                          |
| `permissions.query(kind)`, `.request(kind)`, `openSettings()` | Where the app stands with the OS for `'camera'` or `'microphone'`, and asking it (see below)   | the browser's own permission        | —                                                                          |
| `runtime.connect()`, `.call(…)`, `.subscribe(…)`              | Reads the app's own data — the current cloud — as DoU's screens do; posts text with `chatSend` | `NOT_IN_APP`                        | `session`, `cloud`, `place`, `channel`, `chat`, `user`; `chatSend` to send |

Plus `apps.context` (the app's language, theme, platform — `ios`, `android` or `desktop` — and the
`params` you were opened with; DoU's own web opens a mini app with `MiniAppLaunchParams`, see below),
`apps.onContextChange(listener)` for a theme or language change, `apps.supports(capability)`,
`apps.inApp`, and `apps.disconnect()`.

- **`share`** resolves `'shared'` or `'dismissed'` on iOS. On Android it resolves `'shared'` as soon as
  the chooser opens, whatever the user then does. It needs a non-blank `message` or a `url`; `url` must
  be `http(s)`; `title`, `message` and `url` are at most 100, 4,000 and 2,048 characters.
- **`link(params)`** takes what the link should carry as an object and gives
  `https://app.chatic.io/apps/<app id>?level=3&seed=7` for `link({ level: 3, seed: 7 })`. A tap opens
  your page in the app **at its root** with that query — read it from `location.search`; a link carries
  no path and no fragment. Where the app is not installed, the tap offers the app's store page, never
  your page in the browser. The app id is the one your page was registered under, which need not be its
  subdomain, so never write the link by hand. In a browser, or an app before links to pages existed, it
  gives your page's own root with the same query.
- **`storage`** keeps JSON on the device for your site alone: `get(key)`, `getMany(keys)`,
  `set(key, value)`, `setMany(entries)` (all or none), `remove(key or keys)`, `keys()`, `clear()` and
  `usage()`. It survives relaunches and sign-outs and goes with an uninstall; it does not follow the user
  to another phone. Your site gets 1,048,576 characters in all (keys plus values as JSON) — past it a
  write fails with `QUOTA_EXCEEDED` and changes nothing — keys of 1–200 characters (not `__proto__`),
  and at most 64 KiB in one call (`TOO_LARGE`). A value is written in one call, so one value stays
  under 64 KiB; split anything bigger across keys.
- **`permissions`** is for the camera and the microphone, which a page uses with the browser's own
  `getUserMedia` — the OS asks the user the first time, under DoU's name, so the user's answer is for
  every page, not yours alone. `query(kind)` reports `'granted'`, `'prompt'` (not asked, or refused and
  may be asked again) or `'blocked'` (the OS will not ask again) without showing anything — on Android
  it can read `'prompt'` for one the OS will no longer ask for, so trust what `request` answers;
  `request(kind)` shows the prompt and resolves with the answer; `openSettings()` opens DoU's page in
  the OS settings, the way back for `'blocked'`. Ask when the user reaches for the feature, not at
  start, and do not time `request` out: it waits for the user. A page can skip all this and call
  `getUserMedia`; it then meets the prompt in the middle of the capture. In a browser the same calls
  read and ask the browser's own permission, and `openSettings()` is `NOT_IN_APP`.
- **Uncaught errors are reported for you.** `connect()` listens for `error` and `unhandledrejection` and
  sends them to DoU's log. An `Error` sends its message and stack, a string itself, anything else only
  its type. Pass `connect({ reportErrors: false })` to turn it off.

## Reading the app's data: `apps.runtime`

A page can read the cloud it was opened in — its places, rooms, messages, members — through the app's
own runtime, the same reads DoU's screens make, and hear them change:

```ts
const apps = await connect();
if (apps.supports('runtime')) {
    const { allowed } = await apps.runtime.connect(); // the app asks the user once, here
    const rooms = await apps.runtime.call('channel.cacheReadList', { sid: params.place.id });
    const stream = await apps.runtime.subscribe('channel.observeList', [{ sid: params.place.id }], result => {
        render(result);
    });
    apps.runtime.onCloudChanged(() => apps.finish());
}
```

- **Reads, and one write, only as your manifest asks.** Each of `session`, `cloud`, `place`, `channel`,
  `chat` and `user` opens a fixed set of the app's read methods; `connect()` answers the names this page
  may use (`allowed.calls`, `allowed.streams`), and `can(name)` checks one. Anything else is refused with
  `RUNTIME_NOT_ALLOWED`. Apart from the one message `chatSend` opens (below), nothing a page can call
  changes anything, switches the cloud or the place, or reads another cloud.
- **What comes back is the app's own data**, as its runtime holds it: method names, arguments and
  results are the app's runtime contract (`SDK_RUNTIME_CONTRACTS` lists the versions this library
  speaks). They are JSON, typed `unknown` here.
- **The user is asked once** whether your page may read this cloud. `connect()` waits for the answer
  however long the user takes, with no timeout. A refusal is `CONSENT_REFUSED`; `connect()` asks again
  the next time the page is opened.
- **Streams**: `subscribe(name, args, listener, onEnd)` hands `listener` each event's arguments. Put
  `LISTENER` where the method takes its callback, or leave it out to have it go last. `onEnd` hears a
  stream the app ended: `CLOUD_CHANGED`, a too-large event, or `DISCONNECTED` after the page came back
  from the back-forward cache (subscribe again). At most 16 at a time.
- **The cloud is fixed.** If the user's cloud changes under the view, every stream ends with
  `CLOUD_CHANGED`, `onCloudChanged` fires once, and nothing answers after.
- **Server reads are budgeted**: one per 250 ms and 60 a minute per view, `RATE_LIMITED` past it, with
  `error.details.retryAfterMs`.
- **Only some launches answer it**: the app's own runtime has to hold the session, the page has to be a
  reviewed one on the phone, and a cloud other than Home has to be selected when it opens.
  `supports('runtime')` is `false` everywhere else.
- **It reads what the app holds.** Nothing a page calls fetches into the app's cache, so it sees what
  DoU has already synced, plus the server's room list (`channel.fetchList`), the place's members
  (`user.listPlaceMembers`, for the place the user is in) and the cloud you are in. `session` is the
  current cloud's part of the session only.
- **The cloud you are in**: `call('cloud.getCloud', { id }, { cache: false })`, with `id` the session's
  `context.cloud.cloudId` (needs `session`), or `params.cloud.id` when DoU opened the page from the
  cloud's mini app list. It answers the relay's view of the cloud, unfiltered, as the app gets it: for
  a cloud the user owns, its name and status, its owner (`ownerId`, `owner$`), the verified email, the
  linked account (`accountId`, `account$`), the subscription id, the cloud server's AWS account id
  (`accountNo`) and its service endpoints (`$envs`); for any other cloud, the relay's minimal
  `{ id, name, status }`. Without `{ cache: false }` it is refused.
  `cloud.cacheRead(id)` answers only what the app happens to hold, often `null` for a cloud the user
  owns.
- **Sending a message** (`chatSend`): `call('chat.sendChat', { channelId, content })` posts `content`
  as plain text, in the user's name and unmarked, to a room of the place the user was in when your
  page opened, and answers the sent message. One argument, those two fields and nothing else — no
  attachment, mention or reply — the content at most 1,000 characters with something besides white
  space in it; a room in another place, one the user is not in, or any room once the user moved to
  another place, is refused with `RUNTIME_NOT_ALLOWED`. The user is told, when asked, that the page
  sends messages, and is asked per place. A send that fails leaves a failed message in the room on the
  user's device, as a failed send from DoU's own composer does. Messages have their own budget, one per 500 ms and 30 a minute, `RATE_LIMITED`
  past it. Get the room's id from a read (`channel`) or the launch parameters.

The mock answers it from `runtime: { calls, streams, session, consent }` and plays the cloud change with
`changeCloud()`. It does not know the app's whitelist: it answers what you give it.

## Permissions

The calls marked above need a permission your page asks for in a file on its own site,
`/.well-known/chatic-app.json`:

```json
{
    "manifestVersion": 1,
    "name": "Quiz",
    "permissions": ["share", "userKey"],
    "display": "titled",
    "orientation": "portrait"
}
```

You ask; an administrator grants them when your page is reviewed, and only what was granted is
deployed. Without the file your page gets everything else but not what these permissions unlock: a call
that needs one fails with `NOT_SUPPORTED`, and without a runtime permission `supports('runtime')` is
`false`. `display` says how the page is shown:

| `display`         | What the user sees                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `clean` (default) | The page alone, with a small close button floating in the top-right corner (keep it clear)             |
| `titled`          | The app's bar above the page, with its title and a close button                                        |
| `immersive`       | `clean`, but the page fills the whole screen, under the status bar and the home indicator (see Layout) |

Apps from before bridge 2.29.0 called `titled` `standard` and `clean` `fullscreen`, and know only
those names: they show a new name as `clean`. Current apps read both. `orientation` is `any`,
`portrait` or `landscape`. The app reads
the file before it shows your page, keeps it for the rest of its run, and fetches a fresh copy behind
each later open: a change to the file takes effect one open later.

## Errors

Every failure is a `ChaticAppsError` with a `code`:

```ts
import { ChaticAppsError } from '@lemoncloud/chatic-apps-sdk';

try {
    const key = await apps.getUserKey();
} catch (error) {
    if (error instanceof ChaticAppsError && (error.code === 'NOT_SUPPORTED' || error.code === 'NOT_IN_APP')) {
        // A browser, an older app, or no `userKey` permission: sign in your own way.
    }
}
```

| Code                   | Means                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOT_SUPPORTED`        | Not available: an older app, a permission the page does not hold, or no browser clipboard or storage                                                                            |
| `NOT_IN_APP`           | The call needs the app, and the page is in a browser                                                                                                                            |
| `TIMEOUT`              | The app did not answer in 10 seconds (time in the background does not count)                                                                                                    |
| `INVALID`              | A value is missing, of the wrong type, or too long                                                                                                                              |
| `TOO_LARGE`            | One call's data is over 65,536 characters                                                                                                                                       |
| `LINK_NOT_ALLOWED`     | The link cannot be opened or shared from a page                                                                                                                                 |
| `NOT_OPEN`             | `finish` after the view has already closed                                                                                                                                      |
| `UNAVAILABLE`          | No device id to make a user key from, the page's storage could not be opened, or the device has no camera or microphone                                                         |
| `SETTINGS_ERROR`       | `openSettings()`: the OS would not open the settings                                                                                                                            |
| `QUOTA_EXCEEDED`       | A storage write would go past 1,048,576 characters; nothing was written                                                                                                         |
| `DISCONNECTED`         | The call was waiting when `disconnect()` closed the connection; or, for a runtime stream, the page came back from the back-forward cache and the stream ended (subscribe again) |
| `RUNTIME_NOT_ALLOWED`  | `runtime`: not a method this page may use, or an argument the app holds to the current cloud or place — for a message, its shape or its room                                    |
| `CLOUD_CHANGED`        | `runtime`: the user's cloud is no longer the one this view opened on; nothing answers after                                                                                     |
| `CONSENT_REFUSED`      | `runtime.connect()`: the user did not allow this page to read this cloud                                                                                                        |
| `RATE_LIMITED`         | `runtime`: too many server reads, or messages sent; wait `error.details.retryAfterMs`                                                                                           |
| `UNSUPPORTED_PROTOCOL` | `connect()` only: the app is newer than this library; update it                                                                                                                 |

Treat a code not in this table as that call failing, and nothing more.

## Rules worth knowing

- **Decide what to offer with `apps.supports(...)`**, never with a version number. A share button
  shows only if `apps.supports('share')`.
- **Save as you go.** The app or the web that opened the page can close it at any time without
  asking. Listen to `document`'s `visibilitychange` and save when it turns `hidden` — the app sends no
  "going to the background" signal.
- **Share `apps.link(params)`**, not your page's address: a tap on it opens the page in the app.
  Put what a shared link needs in its query and read it from `location.search` at start; nothing
  after your page's root survives a link.
- **The user key is not an account and proves nothing.** It stays the same on one device for your site,
  and differs on every other site. Two people on one phone share it; anyone who learns one can send it.
  Keep game progress under it, not money.
- **`onCloseRequest` is for something the user would lose.** A second close within three seconds always
  closes, so a page cannot keep the user in.
- **Leaving your origin leaves the bridge.** A link to another site opens in the browser; a page on
  another `apps.chatic.io` address loads in the view but gets no answers, so `connect()` there ends in
  `TIMEOUT`.
- **You cannot see the error reports.** They go to DoU's log, read by the people who review pages.
  Send errors to your own server too if you want to see them.

## Opened from DoU: `MiniAppLaunchParams`

When DoU itself opens your page — a cloud's owner registered it as the cloud's mini app — `params` has
this shape (exported as a type):

```ts
import type { MiniAppLaunchParams } from '@chatic/chatic-apps-sdk';

const params = apps.context?.params as Partial<MiniAppLaunchParams> | undefined;
// { cloud: { id, name }, place: { id, name } | null, user: { id, name } }
```

`user.id` is the user's id in that cloud. These are names to show, not proof of who is looking: there
is no token, and your server must not treat them as a sign-in. `user.isOwner` and `miniApps` are sent
to DoU's own hub only; your page never receives them.

## What this WebView is like

- **Use `apps.storage`, not the WebView's own**: `localStorage` and IndexedDB work, but go whenever the
  system clears website data. Keep what must follow the user to another phone on your own server, under
  `getUserKey()`.
- **No popups**: `window.open` and `target="_blank"` load in the same view, so a login that answers
  through `window.opener` does not work. Use a redirect login.
- **Downloads**: a file download is not handled on iOS, nor on the desktop. Show the content instead.
- **On the desktop** (`platform: 'desktop'`) the page opens in a window over DoU with a bar: the
  base requests only (`finish`, `setTitle`, error reports), no camera or microphone, and a site that is
  not under `apps.chatic.io` always shows its own address in the bar.
- **Camera and microphone** work through the browser APIs, under DoU's name: the OS asks the user
  "DoU would like to…". What your page uses is part of its review.
- **Your own server**: calls to it are ordinary cross-origin requests from `https://<name>.apps.chatic.io`;
  allow that origin in its CORS settings.
- **Layout**: the page sits inside the safe area on every edge, unless its manifest sets `immersive`
  (below); there are no insets to handle. Use the
  context's `theme`, not the OS's, for dark mode — the user can set DoU's theme apart from the phone's.
- **Immersive** (`display: "immersive"`, app bridge 2.29.0): the page fills the whole screen,
  under the status bar, the home indicator and a landscape notch, and keeps its own controls clear of
  them. The status bar stays visible. The app sets `--chatic-safe-area-inset-top`, `-right`, `-bottom` and `-left` on `<html>`; read
  them first and fall back to `env()`, which not every Android WebView reports. The viewport meta must
  say `viewport-fit=cover`: without it iOS keeps the page out of a landscape notch itself, and padding
  by the properties as well pads that side twice:

    ```css
    .hud {
        padding-top: var(--chatic-safe-area-inset-top, env(safe-area-inset-top, 0px));
    }
    .dock {
        padding-bottom: var(--chatic-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
    }
    ```

    An older app shows the page padded, as `clean` (an older desktop app, with the bar), and the
    insets read 0, so the same CSS is right on both. The close button still floats top-right, below the status bar. The status bar's icons follow
    the app's theme.

## Try it without the app

`@lemoncloud/chatic-apps-sdk/mock` turns a browser tab into a stand-in for the app. Install it before
`connect()`, in development only:

```ts
import { connect } from '@lemoncloud/chatic-apps-sdk';
import { installChaticAppsMock } from '@lemoncloud/chatic-apps-sdk/mock';

const app = import.meta.env.DEV ? installChaticAppsMock({ permissions: ['share', 'userKey'] }) : null;
const apps = await connect();

// Play the user's side from the console or a dev button:
app?.pressBack();
app?.requestClose();
app?.changeContext({ theme: 'dark' });
console.log(app?.closed); // { by: 'page', result } once the page finishes, { by: 'user' } on a close
console.log(app?.storage); // what the page has stored
```

Pass `storage: { … }` to start with data already stored; the mock keeps it in memory only.

It answers as the app does — the base calls, plus the `permissions` you give it, and `NOT_SUPPORTED`
for the rest — checks what the app checks, and logs every call. It is a stand-in: the share sheet is
logged rather than shown, the user key is not the app's, and it proves nothing about a phone.

## For an AI assistant writing a page

`AGENTS.md` in this package holds the rules for an assistant writing a page: the project, the calls
and the page. Copy it to the top of your project, where an assistant looks for it, or paste it into the
prompt along with what the page should do. `GUIDE.md` says how to set the project up.

## For maintainers

This library lives in the DoU app's repository so it cannot drift from the app: its public types are
pinned to the app's message definitions by a type-level test, and a contract test in the app runs this
client against the app's real page host. The protocol it speaks is specified in
[mini-app-protocol.md](https://github.com/lemoncloud-io/dou-app/blob/develop/apps/mobile/docs/webview/mini-app-protocol.md).

```bash
npx jest --config libs/chatic-apps-sdk/jest.config.js
npx tsc -b libs/chatic-apps-sdk/tsconfig.json
npx nx build @chatic/chatic-apps-sdk      # dist/libs/chatic-apps-sdk, ready to publish
```

The build writes `package.publish.json` as the published `package.json` (`publishConfig.access` is
`public`, so a scoped package is never published private by mistake). Publish from the build output:

```bash
cd dist/libs/chatic-apps-sdk && npm publish --dry-run
```
