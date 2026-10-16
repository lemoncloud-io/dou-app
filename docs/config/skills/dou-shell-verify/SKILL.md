---
name: dou-shell-verify
description: >-
    Check a web change as it runs inside the app — in the virtual mobile shell, in one browser tab,
    with no simulator. Start it with `yarn local`, make the situation with `window.virtualShell`
    (a push tapped, a link opened, the app sent to the background, Android back, a relaunch, another
    device) and judge by the frame and the shell's log. Read and follow this when a web change has to
    be seen as the app shows it, when asked to verify a scenario in the app without a device, or when
    told to run the shell-verification step. Real device capabilities are dou-device-verify's.
---

# dou-shell-verify

The virtual shell runs the web the way the mobile app runs it — inside the app's bridge, with the
app's boot script, its push and link routing — in a browser tab. It is the default place to see a web
change "in the app". What it cannot imitate it says so, on screen and in its log, and that part stays
for [`dou-device-verify`](../dou-device-verify/SKILL.md). The module doc —
[`apps/virtual-shell/README.md`](../../../../apps/virtual-shell/README.md) — has the tools, what is
imitated and what is not; this file is what you do around it.

## When to open it

- A web change that behaves differently inside the app than in a browser tab: anything behind
  `isNative()`, the bridge, the boot, a push or link landing, back handling, the safe area.
- A scenario to check "in the app" when nobody asked for a device.

Not for: photos, camera, files, keyboard, purchases, real backgrounding, the OS handing a link over,
the WebView's own quirks — those are `dou-device-verify`. Not for what `apps/web-e2e` already checks
on the pull requests it runs for (those that affect it).

## 1. Start it

```bash
yarn local
```

No arguments means the shell against **dev**; without a terminal it does not ask. Run it the way
your environment runs a long-lived server (a background process, a launch configuration) — it does
not return. It prints `http://localhost:5007/__shell/` as it starts; the page answers once both Vite
servers have printed their own ready lines. If it stops at once, it printed what is missing and where
to get it; that is for the person to fix — do not create env files or stop the process holding a port.

Open `http://localhost:5007/__shell/` in the browser tool and wait for the handshake — the shell's
reply `OnWebAppReady`, not the web's request `WebAppReady`, which comes earlier:

```js
const s = window.virtualShell;
if (s.status().handshake !== 'ready') await s.waitFor('OnWebAppReady', { source: 'shell→web' });
```

**Every `waitFor` after a relaunch takes a cursor** (`since`): it defaults to the start of the log, so
without one a line from the previous launch answers at once. `app.restart()`, `device.set()` and a
cold `push.tap` / `deeplink` are relaunches, and each lands on `/`.

## 2. Prod and sign-in rules

- **prod only when the person asked for prod in this task.** Then `yarn local --env prod` (its shell
  is `http://localhost:5017/__shell/`). The DEV | PROD switch in the shell's header is for people —
  do not press it; `window.virtualShell` has no way to switch, and `status().env` says where you are. Put no
  writes in a prod scenario — no sending, deleting, inviting, profile or settings changes. Say
  `status().env` in the report: the PROD band is on the shell page, not in a frame screenshot.
- **Never pick an account or type a password** in a sign-in popup. When the scenario needs a signed-in
  user, open the shell in your browser tool first, then ask the person to sign in once **in that
  browser, in that shell tab** — a session in their own browser is in a different profile and you
  will not see it. The session survives `app.restart()`. Otherwise run as the guest the web boots as.
  Apple sign-in is not supported in the shell.

## 3. Run the scenario

Drive it with `window.virtualShell` through the browser tool's script execution, and look at the
frame (screenshot, or read `document.querySelector('iframe').contentDocument` — same origin). Take a
log cursor before acting so you judge only what your step caused.

```js
const s = window.virtualShell;
const mark = s.logs().at(-1)?.seq ?? 0;
await s.app.background();
const r = await s.push.tap({ type: 'chat', link: '/channels/<id>/room', payload: { cid: '#', sid: '<sid>' } });
// r.ok && r.sent → ['OnNavigate', 'OnBackgroundStatusChanged'] — judge by the path, not by this order
await s.waitFor('OnNavigate', { source: 'shell→web', since: mark });
s.status().path; // '/channels/<id>/room' — then capture the frame and check the room is on screen
```

The relay guest's place id is in the frame's `localStorage` (`chatic-relay-selected-site-id`, `0000`
on the relay); its self chat is the room on home, whose channel id is `U:<uid>` — open it once and read
it from `status().path`. `status().path` is what the web left in the address bar: a tapped room shows
without the `cid`/`sid` the tap carried. On iOS there is no back tool (iOS has no back button); go back
the way the WebView's swipe does, with the frame's own history:
`document.querySelector('iframe').contentWindow.history.back()`.

Every tool answers `{ ok, sent, queued?, ... }` — `push.tap` and `deeplink` add `path`, `back` adds
`exited`, `waitFor` adds `entry` (the log line) — or `{ ok: false, error, message }`. Read `error`
before retrying anything: `INVALID_INPUT` is your call, `UNRESOLVED` a link the app would drop too,
`PLATFORM_MISMATCH` back on iOS, `NATIVE_ROUTE` a native screen the shell does not have. After Android
back closes the app, `status().exited` is `true`; `app.restart()` (or a tap, a link, `app.foreground()`)
opens it again.

**`events.push` is for exploring, never for the verdict.** It sends any app → web event with data
as you write it, unchecked against the contract (`contract: 'unchecked'`) — a shape the real app may
never send. When it shows you something, confirm it with the tools that send what the app sends
(push, deep link, app state, back, restart, device) before calling it a pass. It refuses on prod.

`keyboard.show()` raises a drawn keyboard and tells the web its height the way the app does — enough
to judge the layout (does the composer sit above it), not typing. `status().badge` is what the web set
the app icon's badge to. `storage()` reads the cache, settings and preferences the shell keeps.

Useful reads: `s.logs({ since: mark, source: ['web→shell', 'shell→web'] })` for the exchange (a
request and its reply share a `refId`), `s.logs({ source: ['unsupported'] })` for what the shell could
not answer, `s.logs({ source: ['console'], type: 'error' })` for the page's own errors.

## 4. Report

Split it in two, so nobody reads an imitation as the real thing:

- **Checked in the virtual shell** — each step, what you saw (path, screen, the message exchanged),
  and `status().env`.
- **Not checkable here** — every `unsupported` type your scenario touched, and anything in the
  module doc's "not imitated" rows. These are `dou-device-verify` candidates; say so on the
  checklist line rather than leaving it to look done. A guest boot alone always logs
  `FetchFcmToken`, `FetchBadgeCount`, `FetchLastChatsData` and `FetchLogUploadQueue` as unsupported;
  list them only when the scenario is about push, the badge, room previews or log upload. The toast
  for each shows once, for three seconds — take a screenshot then, or read it from `logs()` later.

Stop the server when you are done if you started it.
