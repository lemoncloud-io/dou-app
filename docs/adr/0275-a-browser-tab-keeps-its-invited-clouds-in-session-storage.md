# ADR-0275: A browser tab keeps its invited clouds in session storage

> Status: Accepted · Decided: 2026-11-03 · Implemented: `fix/invite-cloud-session-storage`
> · Scope: `libs/db` (`WebStorageAdapter`), `libs/app-runtime` (`resolveCacheBackend`, `localFactory`,
> `InvitedCloudImportStorage`)
> · Related: [ADR-0053](./0053-per-domain-cache-contract-versions.md) (invited clouds are a
> local-authority domain; a storage move needs a bridge first) ·
> [ADR-0156](./0156-an-invited-cloud-is-entered-with-the-invite-login-answer.md) (an invited cloud
> belongs to the device user that accepted it)
> · The module docs are [runtime-web docs/cache](../../libs/runtime-web/docs/cache/README.md)
> and [libs/db](../../libs/db/README.md)

## Context

An invited cloud can be entered only by the device user that accepted the invite: the invite login
binds the acceptance to that user's `delegatorId`, and the server grants the cloud to it alone. In a
plain browser tab that device user is a guest the tab creates for itself, and its identity — device
id, relay credential, `delegatorId` — is kept in `sessionStorage`. A new tab is a new guest; closing
the tab ends it.

The invited-cloud rows were kept in IndexedDB, one partition shared by every tab and kept forever.
So a row outlived the only user that could enter its cloud, and every later tab inherited it. A later
tab listing it would open background sockets into it and delegate as a user the server never granted
the cloud to, which mints an empty user there. The `acceptedBy` field and the filter that reads it
kept most such rows out of the list, but a row written before the field existed carries no acceptors
and could not be kept out, and the rows themselves piled up with nothing to remove them.

## Decision

1. **In a plain browser tab, `invitecloud` is stored in the tab's `sessionStorage`.** It is the first
   check in `resolveCacheBackend`, and the test is `isNative()` — the same predicate the web and
   desktop-web entry points use to put the session in `sessionStorage`. The row therefore lives
   exactly as long as the guest that can use it. Inside the desktop shell the session is in
   `localStorage` and the rows stay in IndexedDB; inside the mobile shell they stay in native SQLite.
2. **A new `WebStorageAdapter` in `libs/db` implements the store**: one JSON value per partition, read
   and rewritten whole, no query interpretation. It suits a small domain only, and says so.
3. **The move carries its own bridge.** `InvitedCloudImportStorage` wraps the tab store and, on the
   first call in a tab, copies the IndexedDB rows the tab can be shown to own: those whose
   `acceptedBy` names the tab's guest, and those the tab's session holds a uid in (desktop-web writes
   no `acceptedBy`, so this is its only proof). Both records live in the tab's `sessionStorage`. Any
   other row is not carried. The tab is marked as imported only once a pass ran with a guest id, so
   an account session or a post-logout reload retries on a later boot. IndexedDB is read, never
   written, so a tab still on the previous build is unaffected.
4. **The `acceptedBy` filter stays.** Shells still share one partition across device users, and a
   browser tab's rows survive a logout, so the guest a tab signs back in as is not guaranteed to be
   the one that accepted them. In a tab it is rarely load-bearing, not redundant.

## Consequences

- A browser tab no longer shows another guest's invited cloud, including the unattributed rows the
  filter could not catch, and the domain no longer grows without bound in a browser.
- A reload keeps a tab's invited clouds (sessionStorage survives it); closing the tab drops them, as
  it already dropped the guest. "Duplicate tab" copies both together.
- The browser's routing fingerprint changes (`invitecloud:session`), so sync cursors are retired: a
  tab reloaded after the deploy re-syncs its other domains in full. While an old-build tab and a
  new-build tab share an account, each retires the other's cursors, so the full re-syncs repeat until
  the last old-build tab reloads.
- Two leftovers wait for a later change: the import, which only tabs open across the deploy need, and
  the IndexedDB `invitecloud` rows browsers still hold. They are removed together, once those tabs
  are gone.

## Alternatives

- **Partition the IndexedDB rows by `delegatorId`.** Keeps one store and isolates guests, but rows
  still outlive their guest forever — the pile-up stays, and a cleanup would need a list of live
  guests nobody has.
- **Keep IndexedDB and delete rows with no acceptors.** Fixes the leak, not the lifetime: every closed
  tab still leaves its rows behind for good.
- **Route with `isNativeApp()`, like the rest of the router.** That predicate is false in the desktop
  shell, whose session persists in `localStorage`; its invited clouds would have ended with the window
  while the session that can enter them survived.
- **Move without a bridge.** A tab open across the deploy would lose every accepted cloud on its next
  reload, with no list API and no push recovery on the web to bring them back. ADR-0053 already makes a
  bridge the precondition for moving this domain.
