# ADR-0170: desktop takes and serves custom UI bundles on the dev channel only

> Status: Accepted · Decided: 2026-10-06
> Scope: `apps/desktop/src/main/customUiContract.ts` · `apps/desktop/src/main/index.ts` ·
> `apps/desktop/src/preload/index.ts` · `apps/desktop-web/src/app/features/debug/pages/DebugCustomUiPage.tsx`

## Context

The desktop shell can replace its UI with a downloaded web bundle. The `apply` request on the
`chatic-custom-ui` IPC channel fetches an `https` ZIP, unpacks it under `userData`, and from the next
load serves it under a custom scheme. The choice survives a restart. It began as a proof of concept:
a debug-panel tab in desktop-web and a tray item both drive it.

Only the tray item was limited to the dev channel. The IPC handler was registered on every channel, and
the only thing it checked was whether the sender was a trusted page. The preload exposed
`electronAPI.customUi.apply` on every channel too.

That left production open. A script that gets into any trusted page — the deployed web, or a bundle
already applied — can call `apply` with a ZIP it controls, and the app's UI becomes that bundle until the
user finds the reset item. The bundle then runs on the trusted custom origin, with the same bridge to the
shell that the real UI has. Nothing in a production build uses the feature, and none is planned.

## Decision

### 1. `apply` is refused outside the dev channel

The main-process handler answers `apply` with the usual status reply carrying
`error: 'custom UI bundles can only be applied on the dev channel'`. The channel is the one the tray item
already uses: an unpackaged run, or a build made with `MAIN_VITE_CHANNEL=dev`. The refusal is checked right
after the sender's origin and before any download. It is a pure function in `customUiContract.ts`, which the
unit tests cover.

### 2. The preload leaves `apply` out of a production build

The preload reads the stage the shell already passes it. It exposes `electronAPI.customUi.apply` only when
that stage is exactly `dev`, so a missing or unknown stage closes the call rather than opening it. A
production page then cannot send `apply` at all, and the main-process refusal is a second lock rather than
the only one. The debug panel hides its Apply button when `apply` is absent.

### 3. A production launch never serves a bundle

Refusing `apply` closes the way in, but not what is already there. Before the refusal existed, a production
install could have applied a bundle, and the shell restores the recorded one at every launch. A build
compiled with `MAIN_VITE_CUSTOM_UI_ROOT` set would serve that directory too. So the launch decision is one
pure function, `customUiBoot`: off the dev channel the answer is always the built-in UI, whatever the record
or the override say. On the dev channel an override that can be served wins, otherwise the record is
restored, as before. A production build that has the override compiled in logs that it is ignored.

The record and the unpacked files are not deleted. Only the load is skipped, because deleting cannot be
undone. They sit unused in the production `userData` directory; the dev channel keeps its own `userData`,
so a dev build does not pick them up.

### 4. `status` and `disable` stay on every channel

Both are safe: `status` only reads, and `disable` returns to the deployed web build.

## Alternatives

- **Check only in main.** This is enough to close the hole, but then a production page can still send the
  request, and one wrong condition later reopens it. The preload already knows the stage, so leaving the
  function out costs one expression.
- **Restrict the ZIP to an allowlist of hosts, or verify a hash.** This would let production keep the
  feature. It is real work (key or hash distribution, a place to host bundles) for a feature nothing in
  production uses.
- **Delete the feature.** Developers still use it to try a web build inside the shell. Dev is where it is
  useful, so it stays there.

## Consequences

- A production build cannot apply a bundle from the renderer, whatever runs in a trusted page. Applying one
  in production needs this decision reversed, and a shell release.
- A production install that took a bundle before this change comes up on the built-in UI at its next launch.
  Its record and files stay on disk, unused. Nothing deletes them, so they take space until someone removes
  the `custom-web` directory and `chatic-custom-ui.json` from the production `userData` by hand.
- The menu-bar and tray Reset items appear only while a bundle is being served, which can now only happen on
  the dev channel. The debug panel's Custom UI tab is still reachable in production through debug mode; it
  shows only Reset, which has nothing to reset there.
- The smoke script (`yarn test:sandbox`) asserts that `apply` is withheld in a window whose stage is not
  `dev`. The refusal and the launch decision are covered by unit tests. The preload expression that exposes
  `apply` on dev, and the few lines in `index.ts` that act on `customUiBoot`, have no test of their own,
  because jest cannot load electron.
- desktop-web's `CustomUiApi.apply` became optional, so the panel compiles against both kinds of shell.

## When to reverse

- Production gains a real need for a custom UI. Add an allowlist and an integrity check at the same time —
  the origin check alone is not enough, as above.
