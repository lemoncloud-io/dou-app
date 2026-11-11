# ADR-0310: A cloud token exchange may not change who the account is in that cloud

> Status: Accepted · Decided: 2026-11-11 · Implemented: `fix/invited-cloud-identity-guard`
> · Scope: `libs/auth/src/session/cloudTokens.ts` (`CloudIdentityChangedError`, the check and the
> refusal memo in `exchange`); `libs/auth/src/pairing/pairedCloudSessions.ts` (`enter` forgets the
> recorded uid first); `libs/app-runtime/src/session/hooks/pairing/usePairedCloudCheck.ts` (a guest
> that signs in ends its paired clouds)
> · The behaviour is documented in [libs/auth docs/session](../../libs/auth/docs/session/README.md)
> and [libs/auth docs/pairing](../../libs/auth/docs/pairing/README.md)

## Context

A cloud token is issued in two calls. `delegate-cloud` on the relay names a relay user, and
`exchange-token` on the cloud server finds that user's account in the cloud, or creates one. For a
cloud the account does not own, the relay user is the guest that the current session signed in from.

An invitee's user in a cloud is made by the invite login: the server links the guest that accepted
(the page's `delegatorId`) to the invitee it prepared. When the session's linked guest is that same
guest, every later exchange finds the invitee again. This was checked on dev for a signed-in account
that accepts an invite, and for a guest that accepts and then signs in. When the linked guest is a
different one, the exchange creates a new, empty user instead. That user has no place, no room and no
membership, and every request it makes is refused.

On 2026-11-11 that happened in production. A web build hid every invited cloud from signed-in
invitees for about nine hours. While the cloud was hidden, nothing kept one invitee's token fresh. When
they opened a push for the cloud, the app re-issued the token, and the server answered with a new user
(1000013 instead of 1000002). The app committed it. The invitee's rooms disappeared, photos could not
be sent, and the identity map recorded the new uid over the old one, which removed the last trace on
the device of the right user. The device kept entering as the new user after the list was fixed.

The app already remembers, per cloud, which uid the account has there (the identity map). Nothing
compared a fresh token against it.

## Decision

1. **An exchange that names a different uid than the one recorded for the cloud is refused.**
   `exchange` throws `CloudIdentityChangedError` and writes nothing, so the cache, the identity map and
   the session store keep the recorded user. Every caller already treats a failed issue as a failure:
   a switch rolls back and shows its toast, and a renewal or a background slot backs off. The refusal
   is logged at error level so it shows up in the log console.
2. **An owner token is let through.** The owned-cloud reclaim is the one change meant to happen by
   re-issue: a device holding an invitee's token for a cloud the account owns gets the owner back.
   Only the server issues an owner token. The delegation of an invitee carries `role: member`, which
   was checked on dev, so an empty invitee cannot arrive as an owner.
3. **No recorded uid, no check.** A first entry, or an entry after a sign-out (which clears the map),
   takes any answer.
4. **Flows that change the user on purpose forget the recorded uid first.** A pairing's `enter`
   replaces the tab's own invite identity with the approver's. A guest that signs in to an account
   ends its paired clouds (`end`, not a bare `clear`), so the approver's uid does not stay behind. An
   invite login's answer is committed without an exchange, so accepting an invite again still sets
   the user.
5. **A refusal is remembered for the page life.** While the recorded uid is still the one it was
   refused over, a repeat is answered without a round trip. The server's answer does not change until
   something on the device moves that uid, and every renewal tick would otherwise call
   `delegate-cloud` and `exchange-token` again.

## Alternatives

- **Exempt by caller instead of by role.** Pass a flag from the owned-cloud reclaim. Rejected: a timer
  renewal can re-issue an owned cloud before the reclaim runs, and without the reclaim's flag it would
  be refused. The owner would then be locked out of their own cloud until the reclaim's next try.
- **Exempt clouds the account owns, by the owned catalog.** Rejected: the auth layer does not see the
  catalog, and before the catalog loads at boot the same lockout appears.
- **Check before the exchange, by decoding the delegation's target.** This would also stop the server
  from creating the empty user. Rejected for now: the device records the cloud uid, not the relay
  guest behind it, so there is nothing to compare the target with. Only the cloud uid can be compared.
- **Never re-issue an invited cloud; keep its first token alive with the cloud socket's refresh.**
  This would avoid the bad answer instead of refusing it. It changes how every cloud renews, and
  renewal is re-issue by design (`docs/socket/`). Left for later; the guard is needed either way.
- **Take the new user and tell the invitee.** This keeps the cloud reachable, but as a user with
  nothing in it, and it destroys the recorded uid. Support needs that uid to restore the right user.

## Consequences

- An invitee whose session is linked to the wrong guest cannot enter the cloud. They see the switch
  failure instead of an empty cloud, and they can accept an invite again. The device keeps the right
  uid.
- The server still creates the empty user on the first refused exchange. Only the client stops
  using it.
- A device that already committed the wrong user (before this change) is not repaired. Its recorded
  uid is now the wrong one, and restoring it is a server-side fix.
- An ownership transfer away from an owner, which no feature does today, would be refused by the
  same rule and would need its own exemption.
- Why a production session ends up linked to a guest other than the one that accepted is not known.
  Finding it needs the relay's session record. That cause, and the server creating a user on the
  exchange, are backend questions.
