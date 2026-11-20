# ADR-0330: Production starts on the app's runtime, and the web names the default

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/web-session-owner-default`
> · Scope: `apps/mobile/src/app/services/runtime/sessionOwner.ts` (`defaultSessionOwner`,
> `readDefaultSessionOwner`, `writeDefaultSessionOwner`), `launchSessionOwner.ts`,
> `apps/mobile/src/app/webview/hooks/sessionOwnerHandlers.ts`, `useSessionOwnerHandler.ts`;
> `apps/web/src/app/runtime/sessionOwnerDefault.ts`, `apps/web/src/main.tsx`;
> `libs/bridge-messages` (`SetDefaultSessionOwner`, bridge 2.28.0); the three deploy workflows
> · The behaviour is documented in [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md#the-pages-default)
> · Amends: [ADR-0322](./0322-the-apps-runtime-ships-switched-off-and-production-opens-the-owner-switch-in-debug-mode.md)
> decisions 1 and 5, and [ADR-0328](./0328-a-dev-build-starts-an-unswitched-install-on-the-apps-runtime.md)
> decisions 1 and 3
> · Amended by: [ADR-0331](./0331-a-web-copy-no-page-moved-wins-over-the-vault.md) — production installs went from 0.31.2
> straight to 0.32.1, not through 0.32.0
> · Amended by: [ADR-0332](./0332-the-apps-runtime-declines-a-launch-whose-vault-holds-no-session.md) decision 1 — the runtime
> declines a launch whose vault holds no session
> · Amended by: [ADR-0363](./0363-a-page-asks-a-shell-whose-runtime-already-holds-the-session.md) — the offer
> says when the session is held, so the mirror switch is a safe rollback from app 0.32.4

## Context

ADR-0322 shipped the app's runtime switched off in production and left open when real installs get it:
"that needs a switch the server controls rather than a person". ADR-0328 then made the dev build start
on the runtime by default and kept production on the page, ignoring any build setting.

The product decision now is to run production on the runtime from the next app release, 0.32.1. Doing
that with a build default alone would make the release one-way: if the runtime misbehaves on real
installs, the only way back would be another app release through store review, and installs that do
not update would stay on the runtime.

## Decision

1. **A production build starts an install nobody switched on the app's runtime**, as the dev build does.
   `LOCAL` builds keep the page. A build whose stage cannot be recognised (an env file that failed to
   load) keeps the page too: it also lacks the runtime's service settings, and an unreadable setting
   must not move the session. Before this, an unrecognised stage counted as production; it no longer
   needs to, because production no longer means "the page".
2. **The web names the default for installs nobody switched.** A new bridge request,
   `SetDefaultSessionOwner`, carries `web`, `native` or `null` from the page to the app. The app records
   it beside the switch's own choice and reads it at the next start, ahead of the build's default. Every
   build answers it, production included, without debug mode. It never restarts the app.
3. **The page sends the web build's setting on every boot.** `VITE_APP_SESSION_OWNER` in the web build,
   filled by the deploy workflows from the `WEB_<STAGE>_APP_SESSION_OWNER` repository variables. Unset
   sends `null`, which clears an earlier value. This is the server-controlled switch ADR-0322 left open:
   a web deploy, not an app release.
4. **A person's choice still wins, and a build's pin outranks the page.** The order is the owner switch's
   recorded choice, then the build's `VITE_SESSION_OWNER_DEFAULT`, then the page's default, then the
   stage's own. A build whose stage cannot be recognised keeps the page whatever the others say.
5. **The build pin is honoured on every recognised stage**, production included. The device scenarios
   pin their builds to the page and reach the runtime through the switch; a web build that names the
   runtime must not move them.
6. **A launch whose owner could not be settled sends the page's default too**, without the handshake
   reply that normally says the app supports it. A runtime that stops answering the page is the case the
   rollback exists for, and those launches never get past the error screen.

## Alternatives

- **Build default only, no web control.** Rejected: no rollback short of an app release, and no way to
  move installs that never update.
- **Web control only, production default still the page.** It is the safer rollout, since nothing moves
  until a web deploy names `native`. Not chosen: the decision was to ship the runtime as the production
  default in 0.32.1. The web control makes that default reversible instead.
- **A per-user or percentage switch on the server.** Rejected for now: there is no server-side
  configuration API for it. Because the page decides what to send, a share or a targeted group can be
  added later in the web alone, with no app change.
- **Restart the app when the default changes.** Rejected: the page sends it on every boot, so a restart
  would reload the screen of every launch whose recorded value differs. The next start is soon enough.

## Consequences

- Every production install updating from 0.32.0 moves to the runtime on its first launch of 0.32.1. What
  the page kept in its own plain storage does not come along, so the selected cloud starts empty once,
  as after a switch. The device guest's id crosses only for installs whose earlier launches ran a
  production web build that copies it into the vault.
- Production installs now meet the gaps the runtime doc lists under "What is not done yet": the
  paired-cloud check does not run, logout markers do not cross owners, a restart is counted as a cold
  boot, and the offer does not say whether the session is already held.
- A rollback reaches an install two starts after the web deploy at the earliest: one start to hear the
  new default, the next to run on it.
- An app from before bridge 2.28.0 does not list the request; the page sends it nothing, and the 0.32.0
  production app stays on the page as it shipped.
- Changing the repository variable does nothing until the web is deployed again.
- Two preconditions the earlier records set are accepted rather than closed. The missing device guest id
  (ADR-0328) affects only installs whose earlier launches never ran a production web build that copies
  it into the vault; they see their accepted invited clouds again after a guest sign-in. The keychain
  observation in ADR-0322 — a runtime-owned launch on a simulator once coming up as an account signed in
  before a reinstall — was not reproduced after the keychain was cleared, and the vault deletes an item
  it finds without its install flag (mobile `docs/storage/device-vault.md`, Reinstall). It is not
  explained either; a report of it in production is answered by naming `web` from the web.
- A misspelt `VITE_APP_SESSION_OWNER` clears the record like an unset one, which on a production app
  means the runtime. The page logs it (`session.owner_default_unknown`).
