---
name: dou-shell-verify
description: >-
    Check a web change as it runs inside the app — in the virtual mobile shell, in one browser tab,
    with no simulator. Start it with `yarn local`, make the situation with `window.virtualShell`
    (a push tapped, a link opened, the app sent to the background, offline, Android back, a relaunch,
    another device) or run a scenario file, and judge by the frame and the shell's log. Read and follow
    this when a web change has to be seen as the app shows it, when asked to verify a scenario in the
    app without a device, or when told to run the shell-verification step. Real device capabilities
    are dou-device-verify's.
---

# dou-shell-verify

The virtual shell (`@lemoncloud/hybrid-shell`) runs the web the way the mobile app runs it — inside the
app's bridge, with its boot globals, its push and link routing — in a browser tab. It is the default
place to see a web change "in the app". What it cannot imitate it says so, on screen and in its log, and
that part stays for [`dou-device-verify`](../dou-device-verify/SKILL.md). The module doc —
[`apps/shell-adapter/README.md`](../../../../apps/shell-adapter/README.md) — has what is imitated and
what is not; this file is what you do around it.

## When to open it

- A web change that behaves differently inside the app than in a browser tab: anything behind
  `isNative()`, the bridge, the boot, a push or link landing, back handling, the network dropping.
- A scenario to check "in the app" when nobody asked for a device.

Not for: photos, camera, files, keyboard typing, purchases, real backgrounding, the OS handing a link
over, the WebView's own quirks — those are `dou-device-verify`. Not for what `apps/web-e2e` already
checks on the pull requests it runs for (those that affect it).

## 1. Start it

```bash
yarn local
```

No arguments means the shell against **dev**; it does not ask. Run it the way your environment runs a
long-lived server (a background process, a launch configuration) — it does not return. It prints
`hybrid-shell: shell at http://127.0.0.1:5007/__shell/` once the shell serves, and
`the web answers at …` once the web is up. If it stops at once, it printed what is missing and where to
get it; that is for the person to fix — do not create env files or stop the process holding a port.

Open `http://localhost:5007/__shell/` in the browser tool and wait for the handshake:

```js
const s = window.virtualShell;
s.status().handshake; // 'ready' — poll until it is; `handshakeLate: true` means the web never answered
```

**Every `waitFor` after a relaunch takes a cursor** (`since`): it defaults to the start of the log, so
without one a line from the previous launch answers at once. `app.restart()`, `device.set()` with
another platform and a cold `push.tap` / `deeplink` are relaunches.

A fresh browser profile starts on the app's onboarding, which holds a link until it is done. Skip it
once (its SKIP button); the shell keeps the app's config bag across relaunches, so it stays done until
the shell page reloads.

## 2. Prod and sign-in rules

- **prod only when the person asked for prod in this task.** Then `yarn local --env prod` (its shell
  is `http://localhost:5017/__shell/`). The DEV | PROD switch in the shell's header is for people —
  do not press it; `window.virtualShell` has no way to switch, and `status().env` says where you are.
  A prod shell runs only scenarios marked `prod: safe`; put no writes in one — no sending, deleting,
  inviting, profile or settings changes. Say `status().env` in the report: the PROD band is on the
  shell page, not in a frame screenshot.
- **Never pick an account or type a password** in the Google sign-in popup. When the scenario needs a
  signed-in user, open the shell in your browser tool first, then ask the person to sign in once **in
  that browser, in that shell tab** — a session in their own browser is in a different profile and you
  will not see it. The session survives `app.restart()`. Otherwise run as the guest the web boots as.
  Apple sign-in is not supported in the shell; it fails with the app's own sign-in error.
- A situation made only with raw bridge events is not a pass. Check it again with the tools
  (`push.tap`, `deeplink`, `app.background`, `net.offline`, …).

## 3. Run a scenario — file first

The scenarios live in `apps/shell-adapter/scenarios/`; the shell lists them. Run one in the page:

```js
const r = await window.virtualShell.scenario.run('/__shell/scenarios/push-opens-room.yaml', {
    vars: { room: '<channel id>' },
});
r.status; // 'passed' | 'failed' | 'skipped'
r.steps.filter(step => step.status !== 'passed');
```

or from a terminal, against the running shell (a fresh headless browser — the onboarding note above
applies): `npx hybrid-shell run apps/shell-adapter/scenarios/<file>.yaml`.

For a one-off check, drive the tools and look at the frame (screenshot, or read
`document.querySelector('iframe').contentDocument` — same origin). Take a log cursor before acting so
you judge only what your step caused:

```js
const s = window.virtualShell;
const mark = s.logs().at(-1)?.seq ?? 0;
await s.app.background();
await s.push.tap({
    title: 'New message',
    data: { type: 'chat', link: '/channels/<id>/room', payload: '{"cid":"#","sid":"<sid>"}' },
});
s.status().path; // '/channels/<id>/room' — then capture the frame and check the room is on screen
```

The guest's self chat is the room on home, whose channel id is `U:<uid>` — open it once and read it
from `status().path`. A push tap goes where the mobile app's own `resolvePushTapPath` sends it, and a
link where its `resolveDeepLink` does; a link the app opens on a native screen, or rejects, fails the
tool call with `NATIVE_ROUTE: …` or `UNRESOLVED: …`. On iOS there is no back tool (iOS has no back
button); go back with the frame's own history: `document.querySelector('iframe').contentWindow.history.back()`.

To keep what you just did, `s.logs.toScenario({ since: mark, name: '<what>' })` writes it as a draft
scenario; turn the `# observed:` comments you care about into `expect` steps and save it under
`apps/shell-adapter/scenarios/`.

Useful reads: `s.logs({ since: mark, source: ['web→shell', 'shell→web'] })` for the exchange (a request
and its reply share a `refId`), `s.logs({ source: ['unsupported'] })` for what the shell could not
answer, `s.logs({ source: ['net'] })` for requests and what the network rules did to them.

## 4. Report

Split it in two, so nobody reads an imitation as the real thing:

- **Checked in the virtual shell** — each step or scenario, what you saw (path, screen, the message
  exchanged), and `status().env`.
- **Not checkable here** — every `unsupported` type your scenario touched, and anything in the module
  doc's "not imitated" rows. These are `dou-device-verify` candidates; say so on the checklist line
  rather than leaving it to look done. A guest boot logs a few reads as unsupported on its own; list
  them only when the scenario is about them.
- **Attach the log** — `s.logs.export({ format: 'md', since: mark })`; secrets are placeholders in it.

Stop the server when you are done if you started it.
