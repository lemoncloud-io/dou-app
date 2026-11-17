# ADR-0331: A web copy no page moved wins over the vault

> Status: Accepted · Decided: 2026-11-17 · Implemented: `fix/unmigrated-web-session-wins`
> · Scope: `libs/auth/src/session/storage/secretStorageMigration.ts` (`replaceWithWebCopy`,
> `hasWebCopy`, `discardWebCopy`), `libs/auth/src/session/storage/types.ts` (`'replaced'`);
> `libs/runtime-core/src/session/secretStorage.ts` and `libs/app-runtime/src/boot.ts`
> (`hasWebSessionCopy`, `discardWebSessionCopy`); `apps/web/src/main.tsx` (the sign-out on a launch the
> runtime owns, `adoptLateVault`)
> · The behaviour is documented in [libs/auth docs/session](../../libs/auth/docs/session/README.md#the-device-vault-at-boot)
> and [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md#an-install-that-skipped-the-pages-move)
> · Amends: [ADR-0293](./0293-session-tokens-live-in-the-device-vault-and-lemon-web-core-keeps-none.md)
> (the boot's handling of a vault that already holds tokens),
> [ADR-0315](./0315-the-device-guest-id-is-kept-in-the-vault-as-well-as-the-plain-store.md) decisions 2
> and 7, and [ADR-0330](./0330-production-starts-on-the-apps-runtime-and-the-web-names-the-default.md)
> (its premise that production installs ran 0.32.0 first)

## Context

ADR-0293 moved the session's four tokens from the page's `localStorage` into the shell's vault, at the
page's boot. The boot table that implements it (`libs/auth` docs/session) had one row for a vault that
already holds tokens: "the vault is the truth; delete the web copy". That was safe while the page was the
only thing that wrote the vault.

ADR-0330 made the phone app's own runtime the production owner from app 0.32.1. The runtime reads only
the vault. Its design assumed every production install would have had a launch of 0.32.0 first, where the
page still owned the session and moved the tokens. Production installs did not: they went from 0.31.2,
which has no vault at all, straight to 0.32.1.

Measured on production logs on 2026-11-17: the first 0.32.1 launch of such an install reads an empty
vault, so the runtime signs the device in as a guest. The person looks signed out: their owned clouds are
gone, and an invited cloud answers `delegate-cloud` with 403, because the guest session carries no link
to the guest the invite was accepted under. The person's real session is still in `localStorage`, because
a page that mirrors the runtime never opens the vault and never runs the move.

The way back that ADR-0330 provides, a web build naming the page as the default owner, made this worse
under the old table. The next launch is the page's, the vault holds the runtime's guest tokens, the
`values` row takes them as the truth, and the last copy of the person's session is deleted.

## Decision

1. **When the vault holds tokens and a web copy with a relay token is still there, the web copy wins.** A
   copy without the relay token is a leftover, not a session, and is deleted as before. The copy replaces the
   vault's whole token set: a token the copy lacks is removed from the vault, since otherwise it would keep
   belonging to the other session. The web copy is deleted only once the shell confirms the write. A write
   the shell refuses takes the existing `migration-refused` row: this run signs in from the copy, held in
   the tab, and the copy stays for the next boot.
2. **The device guest's id goes with it.** The plain copy is written over the vault's in the same write.
   The plain copy is the id the page accepted invites under; the vault's was written by the runtime's own
   guest sign-in. A plain store with no id leaves the vault's in place. This amends ADR-0315 decision 2,
   where the boot never overwrites an id the vault holds, for this one row, and the premise of its
   decision 7 that the two copies always name the same guest: here they need not.
3. **A vault with tokens and no web copy is unchanged**: the vault is the truth.
4. **The page deletes a copy the person has moved on from**, so the rule never sees it. On a launch the
   app's runtime owns, a sign-out deletes the web copy along with the page's other signed-out keys: the
   person ended the session there, and the copy would otherwise sign them back in to the account they left
   at the next page-owned launch. A page that finds a vault only after booting without one (the shell did
   not inject it in time) deletes the tokens it wrote to `localStorage` before reloading onto the vault,
   unless they were there when it started; tokens written in that window are a guest's, signed in because
   the session had already moved.

The rule rests on one fact: a web copy next to vault tokens means no page has booted on this vault. Every
boot that reads the vault deletes the web copy, nothing writes the tokens to `localStorage` while a vault is
in use, and decision 4 removes the two copies a page could otherwise leave behind.
So the tokens in the vault were written by something other than the page, and the web copy is the
person's own session.

With this in the web build, naming the page as the production default is safe for these installs. An
install that already met the guest sign-in gets its session back on its next page-owned launch. An install
still on 0.31.2 that updates later meets the guest sign-in on its first 0.32.1 launch only, because that
launch's owner is settled by the app before any web build is heard, and is back on its second.

## Alternatives

- **Ship an app release where the runtime refuses a launch whose vault holds no tokens.** That stops the
  guest sign-in for installs that have not updated yet, but it needs store review, and it does nothing for
  installs that already met it: their vault holds tokens now. The web change covers both, and does not
  wait for a release. It can still be done later.
- **Have the mirroring page hand its web copy to the runtime.** The 0.32.1 runtime has no request for
  that, so it also needs an app release.
- **Stop using the vault in the web build.** That brings the web copy back for the installs that never
  moved, but signs out every install whose session lives only in the vault: a fresh 0.32.1 install, and a
  person who signed in again by hand after the update.
- **Keep the old row and only name the page as the default.** That deletes the person's session on the
  next launch, as described above. Rejected.

## Consequences

- A person who signed in again by hand on the runtime after the update, while the old copy was still in
  `localStorage`, is taken back to the session they had before the update on the next page-owned launch.
  For most of them it is the same account; a person who signed in to a different account has to sign in
  to it again.
- A person who signs out on a launch the runtime owns loses the pre-update copy for good, which is what
  signing out means.
- A web build from before the vault, deployed as a rollback and then rolled forward, would also leave a
  web copy next to vault tokens. The copy is the newer session in that case, so letting it win is still
  the right answer.
- The phone app's runtime runs the same step with no web storage behind it, so its boot never takes this
  row.
