# manage

Create and rename places and channels from chat home — the write half of a screen that used to only
list and navigate. Four operations: create a place, rename a place, create a channel, rename a
channel. Feature code: `apps/testbed/src/app/features/manage/`.

## Payload builders own the validation

`features/manage/payloads.ts` has one builder per operation, each doing the same thing: trim the
name through the shared `normalizeName` rule (`features/naming.ts`), and return `null` instead of a
payload when the result is unusable. The dialog's save button stays disabled until a builder returns
non-null, so there is exactly one gate between "user typed something" and "we call the repository,"
not one per call site.

```ts
buildChannelCreate(name); // → { stereo: 'private', name }
buildChannelUpdate(channelId, name); // → { channelId, name }
buildPlaceCreate(name); // → { name }
buildPlaceUpdate(placeId, name); // → { id: placeId, name }
```

Two decisions worth knowing before touching this:

- **Channel creation defaults `stereo` to `'private'`** — the screen only asks for a name, matching
  `apps/web`'s `CreateChannelPage` default rather than inventing a testbed-only shape.
- **A place rename targets `id`, not `sid`.** `PlaceRepository.updatePlace` looks the row up by `id`
  and optimistically updates the local cache keyed on it; passing `sid` finds nothing and the update
  silently no-ops.

## Wiring

| Operation      | Call                                                          |
| -------------- | ------------------------------------------------------------- |
| Create place   | `repos.place.createPlace({ name })`                           |
| Rename place   | `repos.place.updatePlace({ id, name })`                       |
| Create channel | `repos.channel.createChannel({ stereo, name }, activeSiteId)` |
| Rename channel | `repos.channel.updateChannel({ channelId, name })`            |

A channel is always created under the currently active place (`activeSiteId`), which is why the
"new channel" affordance is disabled when there's no active place at all.

## No manual refresh

Every call above writes through the cache, and chat home's own list subscription re-emits on that
write — the new or renamed row appears without this feature triggering a refetch itself. If a row
doesn't show up after a successful call, the bug is in the subscription, not in a missing refresh
here.

## Out of scope

Delete, member invites, and thumbnail/`stereo` editing are not part of this feature (invites are
[../session/invite.md](../session/invite.md), a separate flow).

## Verifying

```bash
npx vitest run apps/testbed/src/app/features/manage
```

`payloads.test.ts` pins the trim/`null`-gating behavior of all four builders, the channel-create
`stereo: 'private'` default, and the place-update `id` field.

## Related

- [README.md](./README.md) — the chat home screen this feature extends
