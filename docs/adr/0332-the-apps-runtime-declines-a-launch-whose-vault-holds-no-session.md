# ADR-0332: The app's runtime declines a launch whose vault holds no session

> Status: Accepted · Decided: 2026-11-17 · Implemented: `fix/runtime-declines-sessionless-vault`
> · Scope: `libs/runtime-mobile/src/boot.ts` (`NativeRuntimeNoSessionError`, `bootNativeRuntime`);
> `apps/mobile/src/app/services/runtime/nativeRuntimeHost.ts` (the decline);
> `libs/runtime-core/src/session/secretStorage.ts` (`setSecretLogoutPending`);
> `apps/mobile/src/app/webview/hooks/` (`secureStorageHandlers.ts`, `useSecureStorageHandler.ts`: a page's
> clear reaches the runtime's file)
> · The behaviour is documented in [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md#an-install-that-skipped-the-pages-move)
> and [libs/runtime-mobile](../../libs/runtime-mobile/README.md)
> · Amends: [ADR-0330](./0330-production-starts-on-the-apps-runtime-and-the-web-names-the-default.md)
> decision 1 (an unswitched install starts on the runtime, unless its vault holds no session)
> · Follows: [ADR-0331](./0331-a-web-copy-no-page-moved-wins-over-the-vault.md)

## Context

ADR-0331 records what happened when production installs went from app 0.31.2, which has no vault, to
0.32.1, whose first launch is the runtime's. The runtime read an empty vault and signed the device in
as a guest, while the person's session sat in the page's `localStorage`, which only the page's boot moves
into the vault. ADR-0331 made the page's move win over those guest tokens, so a later launch the page owns
brings the session back. The web side then turned the page's mirror off for every launch, so the runtime
does not run at all until the mirror is turned back on.

That leaves the gap for the day the mirror comes back. An install that is still on 0.31.2 then, and
updates after, gets a first launch owned by the runtime again. With the runtime owning every launch from
then on, no page boot ever runs to move the session: the person stays signed out until they sign in by
hand. The 0.32.2 release is being built anyway, so the gap can be closed in the app.

## Decision

1. **The runtime takes a launch only when the vault holds a session.** The boot runs the secret-storage
   step as before. When the step leaves the vault with no tokens, because it answered with none
   (`empty`) or because it just finished an unconfirmed logout (`logout-finished`), `bootNativeRuntime`
   throws `NativeRuntimeNoSessionError` before creating anything. The host answers `null`, which tells the
   page the session is its own for this launch.
2. **A decline is logged as one, not as a failure**: `session.native_runtime_declined` at info level, with
   the step's outcome.
3. **A vault that cannot be read is not a missing session.** The runtime runs from the tab then, as before.
   Telling "locked" apart from "empty" is what the vault's read already does; guessing would move an
   install's owner on a read failure.

The page that takes the launch moves a session still in `localStorage` into the vault, or, on an install
that is simply signed out, signs a guest in as the runtime would have. Either way the next launch finds a
session in the vault and is the runtime's.

## Alternatives

- **Decide before the boot, from the owner file.** The owner is read from MMKV before the vault is,
  and the vault read is asynchronous (it waits for the first unlock on iOS). Deciding there would mean
  reading the keychain on the app's startup path for every launch, which the host keeps off it on purpose.
  The boot already reads the vault, and declining after that read costs nothing extra.
- **Let the runtime read the page's `localStorage`.** It cannot: WKWebView storage is not reachable from
  React Native's JS process.
- **Have the page hand its copy to the runtime over the bridge.** It needs a new request on both sides
  and the same decision about when to trust the copy over the vault. Declining reuses the page's existing
  move, which ADR-0331 has already made safe.
- **Rely only on the web keeping the mirror off until every install has had a page launch.** That has no
  end date anyone can check, and an install that stays on 0.31.2 for months would still meet the guest
  sign-in the day the mirror comes back.

## Consequences

- A signed-out install, a fresh one included, spends its first launch on the page. The page signs a guest
  in on that launch, so the next launch is the runtime's.
- A sign-out on a launch the runtime owns restarts the JS context. The next start finds an empty vault, so
  the page owns the rest of that process and signs a guest in. The next launch is the runtime's again.
- Page-owned launches are now routine, so the "vault clear not confirmed" marker must cross owners: a
  page's vault clear also sets or removes the marker in the runtime's plain file. Otherwise a sign-out on
  a page-owned launch whose clear the keychain refused would leave tokens the runtime boots on next.
- The address a session end saved for the runtime is dropped on a declined launch. The page hears the same
  end on its own address.
- The owner screen's **This page** row shows the page's own session on a declined launch, as it does for
  a runtime that failed to boot. The log line is what tells the two apart.
