# ADR-0221: `cloud.get` and `cloud.update` go to the relay

> Status: Accepted · Decided: 2026-10-22 · Implemented: `fix/cloud-update-on-relay`
> · Scope: `libs/app-runtime/src/data/factories/socketFactory.ts` · `libs/data/src/repositories/CloudRepository.ts`
> · `apps/web/src/app/features/mypage/pages/CloudEditPage.tsx`
> · The module doc is [libs/data remote/socket](../../libs/data/docs/remote/socket.md#routing--where-a-call-is-sent)

## Context

The Cloud domain's two socket actions, `cloud.get` and `cloud.update`, were bound to the active
slot like every cloud-domain gateway. A rename therefore went to whichever server the session was
standing in, and the web cloud profile screen switched the whole app into the cloud before it could
save.

Measured on the dev backend, a cloud's name is stored twice, and nothing keeps the two in step:

- **The relay's row** is the catalog row. The cloud list, the home header, the cloud switcher and
  the management screens all read it over HTTP.
- **The cloud server's own row** is a copy that the cloud server's `cloud.get` and `cloud.update`
  read and write.

For one owned cloud the relay row and the cloud server's copy held two different names; the copy
had been renamed a day earlier and the relay row never had. Every rename the app had sent reached
only the copy. The owner's screens showed the new name only because the app overlays the locally
cached name on the catalog. That overlay is lost when the cache is cleared or the owner signs in on another device,
and the catalog then shows the old name again. Invited members, who read the name with `cloud.get`
on the cloud's own socket, did see the rename.

Desktop's account hub also renamed any owned cloud without switching, so a rename of a cloud other
than the active one went to the wrong server entirely.

## Decision

1. **`socketFactory` binds the whole `cloud` bundle to the relay slot**, the same way it already
   pins `invite` and `auth.linkAccount`. The destination is fixed when the bundle is put together,
   so no caller can send either action anywhere else.
2. **The web cloud profile screen no longer switches into the cloud.** It renames from wherever the
   session is. The places screen still switches, because the place list is the cloud's own cache.
   The hub's rule that disables both rows for a cloud that is not ready to be entered is unchanged.
3. **A cached cloud row keeps its own `cid`, and takes only the name from the answer.** The mapper
   fills `cid` from the request context, which is the active cloud. Before this change a cloud was
   only read or renamed from inside itself, so the two agreed; now they do not, and
   `CloudRepository` keeps the row's own `cid`. The relay's view also carries the owner's head and
   email, which would overwrite the inviter an invited row keeps there, so only `name` is written.
4. **Anything that triggers a relay-pinned cloud read waits for the relay slot to verify**, not only
   the active one. The invited-name sync runs once per cloud, so starting it before the relay is up
   would leave the name unsynced for the visit.

## Consequences

- An owner's rename lands in the catalog every screen reads, on every device, and survives a cache
  clear. Invited members read the same name through `syncInvitedCloudName`, now answered by the
  relay.
- **The cloud server's own copy of the row is no longer written by the app.** It keeps whatever
  name it last had. If something on the server side reads that copy, it shows a stale name until
  the backend syncs the two rows; that is backend work and outside this change.
- The relay's catalog list can lag a write by a moment, and the catalog re-reads on every mount, so
  the web management screens, remounted the moment the profile screen closes, read the old name.
  They now let the locally cached name win over the catalog's, the rule home's header and desktop's
  rail already follow. The same rule's cost comes with it: a rename made on another device shows on
  this one only once this device's cached name changes.
- The relay answers `cloud.get` for a cloud id it is given, including clouds owned by others. This
  change relies on that for invited members. Whether the relay refuses a rename from someone who is
  not the cloud's owner was not checked here.

## Alternatives considered

- **Pin only `cloud.update`.** This was the first version. Rejected after measuring: invited members
  would keep reading the cloud server's copy, which renames no longer reach, so the owner and the
  members would see two different names.
- **Write both rows, the relay's and the cloud server's.** Rejected: writing the cloud server's row
  needs a session in that cloud, which is the switch this change removes, and two writes can half
  fail. Keeping the rows in step belongs to the backend, which owns both.
- **Rename over the relay's HTTP API instead.** The data layer already has an HTTP `PUT /clouds/:id`
  that nothing calls. Rejected: the read for invited members has to move to the relay as well, and
  it is a socket read today; pinning the socket bundle moves both in one place and keeps
  `CloudRepository`'s optimistic write and rollback as they are.
- **Keep the active-slot binding and switch into the cloud before every rename.** Rejected: it
  updates only the copy the catalog never reads, which is the bug described above.
