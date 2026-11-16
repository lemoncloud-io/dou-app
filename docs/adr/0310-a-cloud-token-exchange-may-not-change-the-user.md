# ADR-0310: A cloud token exchange may not change who the account is in that cloud

> Status: Accepted · Decided: 2026-11-11 · Implemented: `fix/invited-cloud-identity-guard`
> · Scope: `libs/auth/src/session/cloudTokens.ts` (`CloudIdentityChangedError`, the check and the
> refusal memo in `exchange`); `libs/auth/src/pairing/pairedCloudSessions.ts` (`prepareEntry`, once
> `enter`, forgets the recorded uid first; `checkPairedClouds` — once in
> `libs/app-runtime/src/session/hooks/pairing/usePairedCloudCheck.ts` — has a guest that signs in end
> its paired clouds); `libs/session/src/store/cloudStore.ts` and `expiry.ts`
> (`getCachedCloudTokens` measures an entry by its identity token)
> · The behaviour is documented in [libs/auth docs/session](../../libs/auth/docs/session/README.md),
> [libs/auth docs/pairing](../../libs/auth/docs/pairing/README.md) and
> [libs/session](../../libs/session/README.md)

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

The re-issue should not have happened at all. A cloud token is an identity token valid for 30 days,
and today's cloud servers send it with no AWS credential. The cache read that decides whether a
stored token can still be used (`getCachedCloudTokens`) judged entries by that credential, so it read
every entry as lapsed the moment it was written. Any entry into a cloud with no live socket therefore
threw the stored token away and called `delegate-cloud`. Measured on dev, before the fix: an invitee's
stored invite token with 30 days left was dropped and re-issued on the first entry with no socket.
After the fix the same entry is served from the store with no `delegate-cloud` call.

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
4. **Flows that change the user on purpose forget the recorded uid first.** A pairing's entry
   (`prepareEntry`) replaces the tab's own invite identity with the approver's. A guest that signs in to an account
   ends its paired clouds (`end`, not a bare `clear`), so the approver's uid does not stay behind. An
   invite login's answer is committed without an exchange, so accepting an invite again still sets
   the user.
5. **A refusal is remembered for the page life.** While the recorded uid is still the one it was
   refused over, a repeat is answered without a round trip. The server's answer does not change until
   something on the device moves that uid, and every renewal tick would otherwise call
   `delegate-cloud` and `exchange-token` again.
6. **A stored cloud token is used while its identity token is valid.** `getCachedCloudTokens` measures
   an entry by the identity token's `exp`, not by an AWS credential, and serves an entry whose `exp`
   cannot be read. A token that is truly spent is still re-issued through `delegate-cloud`, which is
   the only way to get a new one, and decision 1 guards that re-issue.

## Alternatives

- **Exempt by caller instead of by role.** Pass a flag from the owned-cloud reclaim. Rejected: a timer
  renewal can re-issue an owned cloud before the reclaim runs, and without the reclaim's flag it would
  be refused. The owner would then be locked out of their own cloud until the reclaim's next try.
- **Exempt clouds the account owns, by the owned catalog.** Rejected: the auth layer does not see the
  catalog, and before the catalog loads at boot the same lockout appears.
- **Check before the exchange, by decoding the delegation's target.** This would also stop the server
  from creating the empty user. Rejected for now: the device records the cloud uid, not the relay
  guest behind it, so there is nothing to compare the target with. Only the cloud uid can be compared.
- **Never re-issue a cloud on expiry; renew only through the cloud socket's refresh.** This was
  started and dropped. When a stored token is truly spent, `delegate-cloud` is the only way to get a
  new one, so a refresh-only rule would strand the user instead. Today's cloud servers send no
  credential, so the credential guard never fires for them anyway. The re-issues that hurt came from
  the cache misreading a valid token as lapsed (decision 6), not from renewal.
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
