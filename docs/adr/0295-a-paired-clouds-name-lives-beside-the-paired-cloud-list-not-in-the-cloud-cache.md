# ADR-0295: A paired cloud's name lives beside the paired-cloud list, not in the cloud cache

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/paired-cloud-name-sync`
> · Scope: `libs/session` (`chatic-paired-cloud-names`), `libs/auth` (`PairedCloudStore`), `libs/data`
> (`CloudRepository.getCloud`'s `cache` option), `libs/app-runtime` (`syncPairedCloudName`,
> `usePairedCloudNameSync`, `usePairedCloudNames`), `apps/web` (home header, cloud switch sheet)
> · The behaviour is documented in [libs/runtime-core docs/data](../../libs/runtime-core/docs/data/README.md#paired-clouds-names)
> and [libs/auth docs/pairing](../../libs/auth/docs/pairing/README.md)

## Context

A browser that enters a cloud through a device-pairing "this cloud only" approval showed the cloud as
`Cloud …<last 6 of the id>` in the home header and the cloud switch sheet. The approval carries only the
cloud's id, a guest's cloud catalog is empty, and the cloud is not invited, so none of the three places
the screens read a name from — the local cloud cache, the owned catalog, the invited list — ever had
one. The relay now answers `cloud.get` for a non-owner, a paired guest included, with a minimal
`{ id, name, status }` view, so the name can be read once the browser is inside the cloud. The question
was where to keep it.

The cloud cache is the obvious place, and the one every other name lives in. But every row there is
classified by `cloudType`, `'owner'` or `'invited'`, and both values mean something to their readers:

- `'invited'` puts the cloud in `useInvitedClouds`, which attaches a background socket and counts its
  unread — wrong for a cloud the browser holds only through someone else's approval.
- `'owner'` is what `CloudRepository.getCloud` writes for a cloud the cache has never seen, so simply
  calling it would record a paired cloud as owned.

## Decision

**A paired cloud's name is kept by the store that keeps the paired-cloud list, in a session key of its
own (`chatic-paired-cloud-names`), and is read with a `cloud.get` that skips the cloud cache.**

- `CloudRepository.getCloud(payload, { cache: false })` reads without writing; the default is
  unchanged.
- `PairedCloudStore` keeps a name only for a cloud on its list, and `remove` / `clear` drop it with the
  cloud — so an ended pairing or a logout takes the name with it, as it takes the tokens.
- The read runs once per entry into a paired cloud, after its socket and the relay are verified, in a
  plain browser tab as well as the shells. A failure is silent and leaves the id-based fallback.
- The screens read it below a cached name, so a cloud the browser also knows another way keeps the
  name every other screen shows.

## Alternatives considered

- **A third `cloudType`, `'paired'`.** Rejected for its reach: every reader of the cache would have to
  learn to ignore it — the owned/invited filters in the web, the local data source that defaults a
  missing type to `'invited'`, and the bridge's cache model that native code reads — and a missed
  reader would surface the cloud as one of the other two. The cache is also partitioned and routed per
  device user, while a paired cloud belongs to the tab's session.
- **Memory only.** No storage change, but every reload would show the id until the sockets verify
  again. The session key costs one declared key and keeps the name exactly as long as the pairing.
- **The name in the approval response.** A server change for a value the relay already serves.

## Consequences

- The session's plain port gains a key, declared in `SESSION_KEYS` like the list beside it.
- A paired cloud renamed by its owner shows the new name from the next entry, not live.
- Any future screen that names a cloud has a fourth source to consult for a paired cloud
  (`runtime.session.usePairedCloudNames`); the header and the switch sheet are the two that do today.
