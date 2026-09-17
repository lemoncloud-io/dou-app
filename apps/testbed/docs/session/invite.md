# invite

The full loop: create an invite for a channel, copy a code, accept it, and land in that channel
through a chain of target switches (`cid` → `sid` → `channelId`). testbed has no deep-link
infrastructure, so the whole handoff travels as one pasted bundle instead of a URL.

| Piece         | Location                                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| Bundle codec  | `features/invite/inviteCode.ts` (`encodeInvite` / `decodeInvite`)               |
| Create dialog | `features/invite/InviteCreateDialog.tsx` (the channel header's "Invite" button) |
| Accept screen | `pages/InvitePage.tsx` — route `/invite`                                        |

## The bundle format

Everything the accepter needs travels as one **base64(JSON)** blob:

```ts
interface InvitePayload {
    code: string; // the verify code (uuid) requestInvite issued
    cid: string; // target cloud id — the inviter's current cloud
    sid: string; // target site id
    channelId: string; // channel to enter
    backend?: string; // cloud REST endpoint (login-invite)
    wss?: string; // cloud WebSocket endpoint
    cloudName?: string; // display name (falls back to the login response's name)
}
```

`decodeInvite` returns `null` on a base64/JSON parse failure or a missing required field
(`code`/`cid`/`sid`/`channelId`), so a half-decoded bundle never starts a half-finished switch.

## Creating an invite

1. Channel header → "Invite" → `InviteCreateDialog`.
2. Enter `name` and `phone` → `repos.user.requestInvite({ channelId, name, phone })`.
3. The server's `code` field is a raw uuid that `login-invite` rejects — the actual code is embedded
   in the response's `Location` deeplink, so `parseInviteLocation(invite.Location)` extracts it (this
   mirrors `apps/web`'s login page, not a testbed-only quirk).
4. `cid` is filled from the inviter's live session (`activeServer.cloudId`), since the response may
   not carry it; `sid`/endpoints prefer the invite response and fall back to the session.
5. `encodeInvite(payload)` is shown and copied (`navigator.clipboard`, falling back to a selectable
   textarea when the clipboard API is blocked).

## Accepting an invite

The accepter must already be a **relay guest** (holding a `delegatorId`) — the screen refuses before
that. Paste the bundle → `decodeInvite` → `runtime.session.registerUserWithInviteCode(code,
delegatorId, backend)`.

This is deliberately the raw session API, not the higher-level invite-flow hook `apps/web` uses for
its own invites: that hook applies the invite token through `buildCredentialsByToken`, which expects
AWS credential fields (`AccessKeyId`) an invite token doesn't carry, and crashes. It also tries an
automatic cloud/site/channel switch — invited clouds aren't broker-delegable, so that switch cannot
succeed here regardless.

**Accepting saves the cloud; entering it is a separate, manual step.** On success, the invited cloud
is written to the cache —

```ts
repos.cloud.cacheWrite({ id: invitedCloudId, name, backend, wss, cloudType: 'invited' });
```

— using **`payload.cid`** (the bundle's real, delegable cloud id), never the login response's
`data.cloudId`. That field is an AWS account number, and writing it as the cloud id makes the
eventual switch fail with `refusing AWS account-no as cloud target`. The user then goes to
[chat home](../chat/README.md) and picks the invited cloud from its own list, which runs the
ordinary `switchCloud` path. The bundle's `sid`/`channelId` are preserved in the write but not acted
on automatically — there is no follow-up step that jumps straight to that place/channel yet.

The cloud cache partition is global, so the write survives whatever cloud is active when it happens
and shows up in chat home's invite list and in [overlay/](../overlay/README.md)'s `invitecloud`
DB Browser table regardless.

## Constraints

- `requestInvite` targets one recipient by `name` + `phone`; there is no batch-invite path here.
- A non-guest accepter (no `delegatorId`) is stopped with a message to sign in as a guest first, on
  [login](./login.md).

## Verifying

- Unit: `inviteCode.test.ts` (round-trip and the required-field guard).
- Manual, two sessions: A creates and copies a code from a channel; B (guest) pastes and accepts at
  `/invite`, then enters the same channel from chat home's invite list — check the
  `invitecloud` cache row in the overlay.

## Related

- [README.md](./README.md) — settings and session actions
- [../chat/README.md](../chat/README.md) — selecting and entering an invited cloud
- [../overlay/README.md](../overlay/README.md) — inspecting the `invitecloud` cache
