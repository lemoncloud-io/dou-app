> Korean: [README.ko.md](./README.ko.md). This English version is the canonical one.

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

| Call                                                             | In the app                                                                                     | In a browser                        | Needs permission                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `finish(result?)`                                                | Closes the view; `result` (JSON, ≤ 16 KiB) goes back to the opener                             | `NOT_IN_APP`                        | —                                                                          |
| `setTitle(title)`                                                | The app's bar shows it, if the page asked for the bar (1–100 characters)                       | `document.title`                    | —                                                                          |
| `haptic(kind)`                                                   | `selection`, `impact`, `success`, `warning`, `error`                                           | a short vibration, if any           | —                                                                          |
| `onBack(handler \| null)`                                        | Android back calls `handler` and does nothing else                                             | never called                        | —                                                                          |
| `onCloseRequest(handler \| null)`                                | Asks before the user closes; return `true` to close                                            | never called                        | —                                                                          |
| `reportError(error)`                                             | Into DoU's log, under your origin (20 per page load)                                           | `console.error`                     | —                                                                          |
| `copy(text)`                                                     | The clipboard                                                                                  | the browser's clipboard             | `clipboard`                                                                |
| `share({ title, message, url })`                                 | The share sheet; waits for the user (see below)                                                | Web Share, else copies (`'copied'`) | `share`                                                                    |
| `openUrl(url)`                                                   | The browser, mail, phone, SMS or a store                                                       | a new tab                           | `openUrl`                                                                  |
| `getUserKey()`                                                   | 64 hex characters, the same for this device and site                                           | `NOT_IN_APP`                        | `userKey`                                                                  |
| `link(params?)`                                                  | A link that opens this page in the app (see below)                                             | the page's own root                 | —                                                                          |
| `storage.get(key)`, `.set(key, value)`, …                        | Your page's own storage on the device (see below)                                              | `localStorage`, same limits         | —                                                                          |
| `permissions.query(kind)`, `.request(kind)`, `openSettings()`    | Where the app stands with the OS for `'camera'` or `'microphone'`, and asking it (see below)   | the browser's own permission        | —                                                                          |
| `data.connect()`, `.call(…)`, `.subscribe(…)`, `.sendMessage(…)` | Reads the app's own data — the current cloud — as DoU's screens do; posts text with `chatSend` | `NOT_IN_APP`                        | `session`, `cloud`, `place`, `channel`, `chat`, `user`; `chatSend` to send |

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

## Reading the app's data: `apps.data`

A page can read the cloud it was opened in — its places, rooms, messages, members — with the same
reads DoU's own screens make, hear them change, and send a text message:

```ts
const apps = await connect();
const placeId = (apps.context?.params as Partial<MiniAppLaunchParams> | undefined)?.place?.id;
if (apps.supports('data') && placeId) {
    const { allowed } = await apps.data.connect(); // the app asks the user once, here
    const rooms = await apps.data.call('channel.cacheReadList', { sid: placeId });
    // rooms: CloudList<CloudChannel> | null
    const stream = await apps.data.subscribe('channel.observeList', [{ sid: placeId }], result => {
        render(result?.list ?? []);
    });
    apps.data.onCloudChanged(() => apps.finish());
}
```

- **Typed by the app's own names.** Every method the app opens to a page is in `DataCalls` or
  `DataStreams`, under the app's `<repository>.<method>` name, with its arguments and its answer:
  a wrong argument or a misused answer fails the type check. A name the library does not know still
  goes through and answers `unknown` — an app newer than this library may open more. `call<T>(name)`
  with an explicit type still reaches any method untyped, as it did before the types.
- **What comes back is the app's own data**, as the app holds it — the rows below, field for field,
  not reshaped or filtered for pages. `SDK_DATA_CONTRACTS` lists the cloud data contract versions this
  library speaks.
- **Reads, and one write, only as your manifest asks.** Each cloud data permission opens a fixed set of
  methods (the table below); `connect()` answers the names this page may use (`allowed.calls`,
  `allowed.streams`), and `can(name)` checks one — the types say what a method would be, `can` says
  whether it is open now. Anything else is refused with `RUNTIME_NOT_ALLOWED`. Apart from the one
  message `chatSend` opens, nothing a page can call changes anything, switches the cloud or the place,
  or reads another cloud.
- **The user is asked once** whether your page may read this cloud. `connect()` waits for the answer
  however long the user takes, with no timeout. A refusal is `CONSENT_REFUSED`; `connect()` asks again
  the next time the page is opened.
- **Streams**: `subscribe(name, args, listener, onEnd)` hands `listener` each event. For a typed stream
  pass only the arguments in the table: the library puts the listener right after them, where the
  app's method takes its callback. For a name the library does not know, put `LISTENER` where that
  method takes its callback (left out, it goes last). Pass nothing after the listener. `onEnd` hears a
  stream the app ended: `CLOUD_CHANGED`, a too-large event, or `DISCONNECTED` after the page came back
  from the back-forward cache (subscribe again). At most 16 per page load — the next `subscribe` fails
  `INVALID` — so `stop()` each one you no longer need.
- **The cloud is fixed.** If the user's cloud changes under the view, every stream ends with
  `CLOUD_CHANGED`, `onCloudChanged` fires once, and nothing answers after.
- **So is the place.** What belongs to a place — its rooms, their members and messages, its
  profiles — is read only in the place your page was opened in, while the user is still there: a list
  names that place (`sid`) or one of its rooms, and a room or a message is checked against it. Anything
  else is `RUNTIME_NOT_ALLOWED`, and so is every read of a place once the user moved to another; open
  a new view there. The places themselves and the cloud's own row are not a place's and stay open.
  Read the place's id from `session().committedSiteId` or the launch parameters (`place.id`).
- **Server reads are budgeted**: one per 250 ms and 60 a minute per view, `RATE_LIMITED` past it, with
  `error.details.retryAfterMs`.
- **Only some launches answer it**: the app has to hold the session itself, the page has to be a
  reviewed one on the phone, a cloud — Home included — has to be selected when it opens, and on
  Android the WebView has to tell the page's own messages from a frame's inside it (an old Android
  System WebView cannot, and the app then answers none of `apps.data` there).
  `supports('data')` is `false` everywhere else, and every call is `NOT_IN_APP` in a browser.
- **The types cannot hold every argument the app checks.** An object passed from a variable may carry
  fields its type does not list, and `call<T>` skips the argument types altogether; the app still
  refuses what its checks refuse (an extra field on a send, `pageSize` on `user.listPlaceMembers`), with
  `RUNTIME_NOT_ALLOWED`.
- **It reads what the app holds.** Nothing a page calls fetches into the app's cache, so it sees what
  DoU has already synced, plus the methods marked "server" below.

### Methods, by permission

| Permission | Method                                                 | Arguments                                                | Answer                                |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------- |
| `session`  | — (the hello's answer: `session()`, `onSessionChange`) | —                                                        | `CloudSession`                        |
| `cloud`    | `cloud.cacheRead`                                      | `id` — the current cloud's                               | `CloudInfo \| null`                   |
| `cloud`    | `cloud.getCloud` (server)                              | `{ id }` — the current cloud's, `{ cache: false }`       | `CloudInfo`                           |
| `cloud`    | `cloud.observeItem` (stream)                           | `id` — the current cloud's                               | `CloudInfo \| null`                   |
| `place`    | `place.cacheReadList`                                  | `{}` (optional)                                          | `CloudList<CloudPlace> \| null`       |
| `place`    | `place.observeList` (stream)                           | `{}`                                                     | `CloudList<CloudPlace> \| null`       |
| `place`    | `place.observeItem` (stream)                           | place `id`                                               | `CloudPlace \| null`                  |
| `place`    | `place.isPlaceDeleted` (server)                        | place `id`                                               | `boolean`                             |
| `channel`  | `channel.cacheRead`                                    | room `id` — a room of the place                          | `CloudChannel \| null`                |
| `channel`  | `channel.cacheReadList`                                | `CloudChannelListQuery` — `sid` the place's, required    | `CloudList<CloudChannel> \| null`     |
| `channel`  | `channel.fetchList` (server)                           | `CloudChannelListQuery` — `sid` the place's, required    | `CloudList<CloudChannel>`             |
| `channel`  | `channel.observeList` (stream)                         | `CloudChannelListQuery` — `sid` the place's, required    | `CloudList<CloudChannel> \| null`     |
| `channel`  | `channel.observeItem` (stream)                         | room `id` — a room of the place                          | `CloudChannel \| null`                |
| `channel`  | `join.cacheReadList`                                   | `{ channelId, activeOnly? }` — a room of the place       | `CloudList<CloudJoin> \| null`        |
| `channel`  | `join.observeList` (stream)                            | `{ channelId, activeOnly? }` — a room of the place       | `CloudList<CloudJoin> \| null`        |
| `chat`     | `chat.cacheRead`                                       | message `id` — answered if its room is the place's       | `CloudChat \| null`                   |
| `chat`     | `chat.cacheReadList`                                   | `{ channelId, cursorNo?, limit? }`                       | `CloudList<CloudChat> \| null`        |
| `chat`     | `chat.listPendingImageChats`                           | room `id`                                                | `CloudChat[]`                         |
| `chat`     | `chat.observeList` (stream)                            | `{ channelId, cursorNo?, limit?, includeUnsent? }`       | `CloudList<CloudChat> \| null`        |
| `chat`     | `chat.observeLastList` (stream)                        | room ids                                                 | `CloudLastChat[]`                     |
| `chat`     | `chat.observeFeedCoverage` (stream)                    | room `id`                                                | `[low, high][]` message-number ranges |
| `user`     | `user.cacheReadList`                                   | `{ channelId, limit?, page?, detail? }`                  | `CloudList<CloudUser> \| null`        |
| `user`     | `user.listPlaceMembers` (server)                       | `{ placeId, sessionPlaceId }` — both the current place's | `CloudPlaceMembers`                   |
| `user`     | `user.observeList` (stream)                            | `{ channelId, limit?, page?, detail? }`                  | `CloudList<CloudUser> \| null`        |
| `user`     | `profile.cacheRead`                                    | `<place id>@<user id>` — the place's                     | `CloudProfile \| null`                |
| `user`     | `profile.cacheReadList`                                | `{ sid, uid? }` — `sid` the place's, required            | `CloudList<CloudProfile> \| null`     |
| `user`     | `profile.observeList` (stream)                         | `{ sid, uid? }` — `sid` the place's, required            | `CloudList<CloudProfile> \| null`     |
| `user`     | `profile.observeItem` (stream)                         | `<place id>@<user id>` — the place's                     | `CloudProfile \| null`                |
| `chatSend` | `chat.sendChat` — call it as `sendMessage`             | `{ channelId, content }`                                 | `CloudChat`                           |

### The rows

All exported as types. Most fields are optional because the same row is filled from different answers
over time: a field is there only when the server or the app filled it, so read each with a fallback.

| Type           | What it is                              | Fields worth knowing                                                                                                                   |
| -------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `CloudChannel` | A room                                  | `id`, `sid` (its place), `name`, `stereo` (`dm`, `self`, …), `memberIds`, `chatNo`, `unreadCount`, `lastChat$`                         |
| `CloudJoin`    | A member's place in a room              | `channelId`, `userId`, `stereo` (`owner`, `member`), `readNo`, `nick`, `notify`                                                        |
| `CloudChat`    | A message                               | `id`, `channelId`, `chatNo` (`0` while sending), `content`, `ownerId`, `createdAtMs` (always set), `upload$$`, `isPending`, `isFailed` |
| `CloudPlace`   | A place of the cloud                    | `id`, `name`, `order`, `isOwner`, `owner$`                                                                                             |
| `CloudUser`    | A user of the cloud                     | `id`, `name`, `nick`, `thumbnail`                                                                                                      |
| `CloudProfile` | A user's name and picture in one place  | `id` (`<place>@<user>`), `sid`, `userId`, `nick`, `thumbnail`                                                                          |
| `CloudInfo`    | The current cloud                       | `id`, `name`, `status`, `ownerId`, `cloudType`                                                                                         |
| `CloudSession` | The current cloud's part of the session | `context.cloud.cloudId`, `context.identity.userId`, `committedSiteId`                                                                  |

`CloudList<Row>` is `{ list, meta: { total, limit?, page?, cursorNo?, readNo?, source? } }`.

### What each permission hands over

The app does not filter a row for pages: what DoU's screens read, your page reads. That includes
contact and account details, marked in the types as such. Ask only for the permissions the page needs —
what it does with what it read is its author's responsibility — keep such details on the device, and
never send them to a third party without telling the user.

| Permission | Hands over                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`  | Which cloud and place the user is on, the user's id in this cloud, whether signed in. Nothing of the user's other clouds, no server address, no token                                                                                                                                                                                                                                                                                                                            |
| `cloud`    | The current cloud's row; from the device cache, also its server addresses (`backend`, `wss`) and the device user ids that accepted an invite (`acceptedBy`). Through `cloud.getCloud`, for a cloud the user owns: its owner, the verified **email**, the linked **account** (`accountId`, `account$`), the subscription id, the cloud server's **account number** (`accountNo`) and service endpoints (`$envs`); for any other cloud, the relay's minimal `{ id, name, status }` |
| `place`    | The cloud's places, with their server endpoints (`$envs`). A place's `owner$` is the account server's view of its owner, whose type includes **phone, email, address, birth date**, sign-in details and fields named after secrets (`loginPw`, `$account.otp$`, `$account.key$`) — filled as the server chooses. Never read, keep or send the secret-named ones                                                                                                                  |
| `channel`  | Rooms of the place, their member ids, each member's join (role, nickname, read position), and the embedded owners (`owner$`, with **sign-in ids**)                                                                                                                                                                                                                                                                                                                               |
| `chat`     | Messages in the place's rooms, with their files' addresses, any webhook cards, and the embedded senders (`owner$`, with **sign-in ids**)                                                                                                                                                                                                                                                                                                                                         |
| `user`     | Users of the place's rooms (names, nicknames, pictures, **sign-in ids**), the place's profiles, and its member list                                                                                                                                                                                                                                                                                                                                                              |
| `chatSend` | Nothing: it lets the page send                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Sending a message: `sendMessage`

```ts
const sent = await apps.data.sendMessage(roomId, 'Round 3: 120 points'); // CloudChat
```

With `chatSend`, `sendMessage(channelId, text)` posts `text` as plain text, in the user's name and
unmarked, to a room of the place the user was in when your page opened, and resolves with the sent
message. It is `call('chat.sendChat', { channelId, content: text })`, which still works. Text only — no
attachment, mention or reply — at most 1,000 characters with something besides white space in it; a
room in another place, one the user is not in, or any room once the user moved to another place, is
refused with `RUNTIME_NOT_ALLOWED`. The user is told, when asked, that the page sends messages, and is
asked per place. A send that fails leaves a failed message in the room on the user's device, as a
failed send from DoU's own composer does. Messages have their own budget, one per 500 ms and 30 a
minute, `RATE_LIMITED` past it. Get the room's id from a read (`channel`) or the launch parameters. In
a browser it is `NOT_IN_APP`.

### Place profiles: `placeProfile`, `placeProfiles`, `myProfile`

```ts
const me = await apps.data.myProfile(); // CloudProfile | null
const sender = chat.ownerId ? await apps.data.placeProfile(chat.ownerId) : null; // a member of the place
const named = await apps.data.placeProfiles(); // CloudList<CloudProfile> | null: name the place's members
const stop = await apps.data.observePlaceProfile(userId, profile => renderName(profile?.nick));
```

A place profile is what a member is called in one place of a cloud: the app keys it to the member's
id in that cloud, `<place id>@<user id>`, and it mostly holds the name shown there (`nick`) and a
picture — DoU names a member by it, and by the member's own name where there is none. As every read of
a place, it answers only for the place your page was opened in.

- `placeProfile(userId)` reads one member's profile as the device holds it, and
  `observePlaceProfile(userId, listener, { onEnd? })` hears it and each change.
- `placeProfiles()` lists the place's profiles the device holds.
- `myProfile()` and `observeMyProfile(listener, { onEnd? })` do the same with the user's own id.

They need `user`, which reads profiles, and `session`, which names the place and the user's id:
without `session`, or before the session is on a place, they are `NOT_SUPPORTED`; without `user`, or
once the user moved to another place, `RUNTIME_NOT_ALLOWED`. `null` means the device holds no profile
for that member there: fall back to the member's own name. They are
`call('profile.cacheRead', '<place id>@<user id>')`, `call('profile.cacheReadList', { sid })` and
`subscribe('profile.observeItem', [id], …)`, which still work.

### In the mock

The mock answers from `data: { calls, streams, session, consent }`, typed with the same map — an
answer of the wrong shape fails the type check — and plays the cloud change with `changeCloud()`. It
does not know the app's whitelist: it answers what you give it. With `chatSend` it opens
`chat.sendChat` itself, checks a send's shape as the app does (not the room's place, nor the send
budget), and records each send that went through in `sentMessages`.

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
that needs one fails with `NOT_SUPPORTED`, and without a cloud data permission `supports('data')` is
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

| Code                   | Means                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOT_SUPPORTED`        | Not available: an older app, a permission the page does not hold, or no browser clipboard or storage                                                                               |
| `NOT_IN_APP`           | The call needs the app, and the page is in a browser                                                                                                                               |
| `TIMEOUT`              | The app did not answer in 10 seconds (time in the background does not count)                                                                                                       |
| `INVALID`              | A value is missing, of the wrong type, or too long                                                                                                                                 |
| `TOO_LARGE`            | One call's data is over 65,536 characters                                                                                                                                          |
| `LINK_NOT_ALLOWED`     | The link cannot be opened or shared from a page                                                                                                                                    |
| `NOT_OPEN`             | `finish` after the view has already closed                                                                                                                                         |
| `UNAVAILABLE`          | No device id to make a user key from, the page's storage could not be opened, or the device has no camera or microphone                                                            |
| `SETTINGS_ERROR`       | `openSettings()`: the OS would not open the settings                                                                                                                               |
| `QUOTA_EXCEEDED`       | A storage write would go past 1,048,576 characters; nothing was written                                                                                                            |
| `DISCONNECTED`         | The call was waiting when `disconnect()` closed the connection; or, for a cloud data stream, the page came back from the back-forward cache and the stream ended (subscribe again) |
| `RUNTIME_NOT_ALLOWED`  | `data`: not a method this page may use, or an argument the app holds to the current cloud or place — for a message, its shape or its room                                          |
| `CLOUD_CHANGED`        | `data`: the user's cloud is no longer the one this view opened on; nothing answers after                                                                                           |
| `CONSENT_REFUSED`      | `data.connect()`: the user did not allow this page to read this cloud                                                                                                              |
| `RATE_LIMITED`         | `data`: too many server reads, or messages sent; wait `error.details.retryAfterMs`                                                                                                 |
| `UNSUPPORTED_PROTOCOL` | `connect()` only: the app is newer than this library; update it                                                                                                                    |

Treat a code not in this table as that call failing, and nothing more. The codes are the app's own,
so a few keep the app's older wording (`RUNTIME_NOT_ALLOWED` is about `apps.data`).

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
import type { MiniAppLaunchParams } from '@lemoncloud/chatic-apps-sdk';

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

## Versions

While the library is `0.x`, a release that adds anything — a call, a typed method, a field — raises the
minor version (`0.3.0`), and one that only fixes raises the patch (`0.3.1`). Pin the version you build
with, and read the changes before moving to a new minor.

Which app a page meets is the app's business, not the library's: a call the app cannot answer fails with
`NOT_SUPPORTED`, so decide with `apps.supports(...)`, never with a version number. The library's own
numbers, for reading a bug report:

| Library           | Bridge it was built against (`SDK_BRIDGE_VERSION`) | Data contracts (`SDK_DATA_CONTRACTS`) | Added                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1.0             | 2.19.0                                             | —                                     | The base calls, storage, share, user key                                                                                                                                                                                                                     |
| 0.2.0             | 2.20.0                                             | —                                     | Camera and microphone permissions; `GUIDE.md` and `AGENTS.md` in the package                                                                                                                                                                                 |
| next (unreleased) | 2.30.0                                             | `[1]`                                 | `apps.data` with its typed methods, rows and session; `sendMessage`; place profiles (`placeProfile`, `placeProfiles`, `myProfile` and their `observe…`); the typed mock; `platform: 'desktop'`; the `MiniAppLaunchParams` type; the skill (`skill/SKILL.md`) |

The data contract is the app's own version for what `apps.data` reads. The app answers a
page with the newest contract both speak; a library that speaks none the app does is answered
`NOT_SUPPORTED`.

## For an AI assistant writing a page

`AGENTS.md` in this package holds the rules for an assistant writing a page: the project, the calls
and the page. Copy it to the top of your project, where an assistant looks for it, or paste it into the
prompt along with what the page should do. `GUIDE.md` says how to set the project up.

`skill/SKILL.md` (Korean: `skill/SKILL.ko.md`) is a procedure for the assistant: it asks the author one
question at a time and goes from an idea to a zip that passes the verifier, in three stages. `GUIDE.md`,
"For an AI assistant in your project", says how to copy it into a project.

## For maintainers

This library lives in the DoU app's repository so it cannot drift from the app: its public types are
pinned to the app's message definitions by a type-level test, and a contract test in the app runs this
client against the app's real page host. The cloud data rows, arguments and session are declared by hand
here (the app's types are private packages) and held to the app's by the app's contract test
(`chaticAppsSdkRuntime.contract.test.ts`):
the typed methods must be exactly what the whitelist opens, permission by permission, and every row
(and its embedded views, four levels deep)
field must match the app's in name, optionality and type. That test compiles itself, because neither
its transform nor CI type checks the app; dropping or retyping a field of an app row fails it. The protocol it speaks is specified in
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
