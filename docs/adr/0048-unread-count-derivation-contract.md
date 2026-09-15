# ADR-0048: Derive unread count on the `chatNo − metaNo` scale — a shared contract across three clients

> Status: Accepted · Decided: 2026-08-10
> Related: [ADR-0045](./0045-web-emoji-reaction-and-thread.md) (introducing emoji reactions · threads) ·
> [ADR-0047](./0047-web-reaction-and-thread-refinements.md) (reaction/thread follow-up)

## Context

Once emoji reactions shipped, unread badges quietly started going wrong. A channel that's fully read gets a
number attached the moment anyone adds a reaction. The cause isn't a bug in badge code — it's that **the
client re-derives, on its own, a distinction the server already has, and the derivations diverged.**

Three clients each compute the same value. The presentation is rightly rebuilt per platform, but this
calculation is a contract, not presentation — and since the contract was written down nowhere, the three
implementations ended up standing on different assumptions. This document is that contract, now made
canonical.

### The distinction the server already makes

Each channel has **one** monotonically increasing number, `chatNo`, shared by both human messages and system
events. Every time the server writes a chat, it decides whether it counts toward the aggregate and advances
the counter accordingly.

```ts
// chatic-socials-api  src/modules/chats/proxy.ts:327
/** Whether this message counts toward unread aggregation — currently only user messages count
 *  (system etc. are split off via metaNo) */
public isCountable(stereo?: ChatStereo): boolean {
    return stereo === 'user';
}

// same file :357 — non-user messages advance both chatNo and metaNo together
const $next = this.isCountable(model?.stereo) ? { chatNo: 1, metaNo: 0 } : { chatNo: 1, metaNo: 1 };
```

This is the invariant the entire document depends on.

> **`chatNo − metaNo` = the count of user messages up to that point.**
> Since a system chat advances both values together, it never contributes to this difference — it is
> **invariant** with respect to system events.

The read cursor needs the same conversion, because `join.chatNo` is **a position on the merged sequence**,
not a count of user messages. So the server snapshots `channel.metaNo` at the time of reading, as
`join.metaNo`. The server's own calculation is canonical.

```ts
// chatic-socials-api  src/modules/chats/proxy.ts:155
public calcUnreadCount($channel: ChannelModel, $join?: JoinModel): number {
    if (!$join) return 0;
    const metaNo = $T.N($channel?.metaNo, 0);
    const total = $T.N($channel?.chatNo, 0) - metaNo;
    const readNo = Math.max($T.N($join.chatNo, 0), $T.N($join.joinedNo, 0));
    const readMetaNo = $join.metaNo !== undefined ? $T.N($join.metaNo, 0) : metaNo;
    return Math.max(0, total - (readNo - readMetaNo));
}
```

### Why reactions broke this

A reaction is not a field, it's a **chat record** — `stereo: 'system'`, `subType: 'reaction'`
(`chatic-socials-api` `src/lib/chats/set-reaction.ts`). That is, it takes up one `chatNo` slot. What shows up
in the UI as a chip is only the client-side folded result of `foldReactions`.

Join/leave events take the same kind of slot too, but they're rare enough that it went unnoticed. Reactions
are frequent, so they surfaced the same defect every day.

### Why not just use the server's `channel.unreadCount`

Can't, for two reasons. First, the backend is eventually consistent, so reading right after a write returns
a stale value (the same reason as `CLAUDE.md`'s mutation cache rule). Second, the server **doesn't
automatically advance the sender's own read cursor** — a message I just sent gets marked as unread for me.
So the client derives it. The server value is used only as a fallback, for when the client doesn't yet know
any read boundary.

## Decision

**Derive unread count by converting both sides onto the user-message scale before subtracting.**

```
unread = (channel.chatNo − channel.metaNo) − (join.chatNo − join.metaNo)
```

Four rules to follow.

### 1. Read the head and its `metaNo` from the same record

`channel.chatNo` and `channel.metaNo` are two fields of one snapshot. Take the head from `lastChat$.chatNo`
and it becomes **a snapshot from a different point in time** — subtracting this record's `metaNo` from it
subtracts the system count measured at a different point in the sequence. The cursor side is the same —
`join.chatNo` and `join.metaNo` must come from the same join row.

### 2. Degrade to the old calculation when there's no cursor snapshot

A join row written before the server started keeping `join.metaNo` has no such value. In that case,
substitute `channel.metaNo`, making the correction zero — the result equals the old slot-difference
calculation, and it self-corrects the moment that channel is read once and the server fills in the snapshot.
This is the same fallback the server's own `calcUnreadCount` performs.

> **Reconsideration notes (2026-08-18, twice) — the conclusion is "keep the fallback."**
>
> The 14:00 commit (`c84545a6`) dropped this fallback and, when there's no snapshot, subtracted the cursor
> **unconverted, as-is.** The reasoning: the slot-difference approach counts system chats added after the
> read as unread, so the badge climbs with every reaction, and `channel.metaNo` is **the current head's**
> system count, not the cursor's — so inside the fallback it violates Rule 1 on its own.
>
> 24 minutes later, the 14:24 commit (`6bb46bc5`) **reverted** that decision. The unconverted difference
> instead **under-counts**, hiding actually-unread messages, and that was judged worse. **The current code
> uses the fallback** (`readMetaNo ?? headMetaNo`).
>
> The remaining fact is recorded honestly here. `headMetaNo >= readMetaNo` always holds, so the fallback is
> always **too high**, and even a room read all the way to the head keeps climbing by 1 for every reaction
> that lands — the defect the 14:00 commit pointed at is real and still present
> (`countUnread.test.ts`'s "still reads non-zero as system events land after a snapshot-less read to the
> head" pins down that shape). The unconverted side is always **too low**. There is no exact answer for a
> snapshot-less row — only a choice of which direction to be wrong in. In both cases, reading that room once
> makes the server fill the snapshot and become permanently accurate.
>
> To reopen this trade-off, read both commits first. And: the 14:00 commit changed only the tests and this
> document to the new contract, not the code (the formula); the 14:24 commit reverted only two of those
> tests, leaving the other 4 tests and this note out of sync with actual behavior — that was corrected to
> match the code on 2026-08-19.

### 3. Gate the "my message is latest → 0" shortcut to **user messages only**

This shortcut exists to paper over the sender's-cursor-doesn't-advance problem. But my own _reaction_ also
becomes the channel's latest chat. Without a gate, tapping 👍 on a channel I haven't even read would zero out
the whole badge. The check reuses something that already exists —
`isNotifiableChat` (= `stereo !== 'system'`), the very predicate OS banners and the sidebar preview use.

> **Caution** — this shortcut and `metaNo` netting answer the same question, "should this chat count," with
> two different mechanisms. One is a client-side predicate on `stereo`, the other is a server counter. They
> agree only as long as the server's non-countable set is exactly the complement of `stereo === 'user'`. If
> that set widens, they'll diverge **silently**.

### 4. A local read cursor is an upper bound, not a competing boundary

Since the server cursor round-trips and lags, this device may keep its own separate read point. That value
has no `metaNo` snapshot, so its scale doesn't match — never place it side by side with the server cursor and
pick "whichever read further." Use it as an upper bound instead — "having read up to `localReadNo`, unread
can't exceed the slot count above it." This is what keeps the badge from fully reappearing the instant one
new message arrives right after a channel was read.

## Current state

| Surface            | File                                                  | Contract compliance                                                                              |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Server (canonical) | `chatic-socials-api` `src/modules/chats/proxy.ts:155` | baseline                                                                                         |
| `apps/desktop-web` | `src/app/shared/utils/channelUnread.ts`               | ✅ Rules 1–4 in full                                                                             |
| `apps/testbed`     | `src/app/features/unread/computeUnreads.ts`           | ⚠️ Netting is correct, but takes the head from `lastChat$.chatNo`, violating Rule 1              |
| `apps/web`         | `src/app/utils/countUnread.ts`                        | ✅ Rules 1–2 (converted cursor + fallback when no snapshot — see the reconsideration note above) |

Only `apps/desktop-web` has Rules 3–4. Both the server `unreadCount` fallback and the local-cursor upper
bound are desktop-only — mobile has neither.

### A known inconsistency: `apps/web` doesn't convert the cursor

`apps/web` converts only the head; the cursor still subtracts the merged-sequence value as-is.

```ts
// apps/web/src/app/utils/countUnread.ts
/** My read cursor on the user-message scale, or undefined when no join row is known yet. */
readNo?: number;
...
const userHead = Math.max(0, (headChatNo ?? 0) - (headMetaNo ?? 0));
return Math.max(0, userHead - readNo);

// where that readNo comes from — both values here are on the merged scale
export const readCursorOf = (join?: { readNo?: number; chatNo?: number }): number | undefined =>
    join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : undefined;
```

This rests on the premise that `join.chatNo` is on the user-message scale, and that premise is stated
explicitly in a comment on `useChannelUnreads`: "this way system messages get netted out even without a
per-cursor metaNo." The server doesn't see it that way — the reason `markAsRead` bothers to snapshot the
cursor slot's `metaNo` is precisely that `join.chatNo` is on the merged scale. The API response's `readNo`
also carries `$join.chatNo` as-is (`chatic-socials-api` `src/modules/chats/api-chats.ts:102`).

The net effect is over-subtraction by `join.metaNo`. This goes unnoticed because the direction is **always
under-counting** (the badge reads lower than it should, or doesn't show at all) — the mirror image of the
reaction bug, which was loud because it over-counted.

Left unfixed for now because it's outside the scope of the desktop reaction fix (PR #418), and fixing it
would change mobile badge numbers — a behavior change that needs to be handled as its own piece of work.

### `apps/testbed`'s choice of head

`computeUnreads` takes the head as `latestChatNo = lastChat$.chatNo ?? channel.chatNo` while taking
`latestMeta` from `channel.metaNo`. When the two are different snapshots, this violates Rule 1. It's a
diagnostic surface with no real-usage impact, but it can produce misleading numbers when cross-checked
against other screens.

## Consequences

- **What improves** — the contract is written down in one place. Building a new surface means checking this
  document instead of "which of the three existing implementations should I copy." When any other system
  chat type gets added, badges stay correct automatically.
- **Cost** — the calculation is duplicated across four places. Extracting it into a shared library would be
  the right move, but there's no natural home for it (`libs/socket-data` is a dead package with only `dist`,
  no `src`), and extracting before fixing the web/desktop inconsistency above would bake a wrong premise into
  the shared engine. **Resolving the inconsistency is a precondition for extraction.**
- **Type lag** — the published `@lemoncloud/chatic-socials-api` doesn't yet declare `join.metaNo` or
  `ChatSubType.reaction` (installed `0.26.412`, server `0.26.722`). Clients read these via narrow casts. The
  cache path was cleaned up by widening `libs/app-messages`'s `CacheJoinView`, but the cast remains where
  `ChannelView.$join` supplies the value. Once the SDK catches up, those spots need to be found and cleaned.

## Follow-ups

- [ ] Fix `apps/web`'s cursor conversion — the "known inconsistency" above. A behavior change, so a separate
      PR.
- [ ] Align `apps/testbed`'s head/`metaNo` to the same record (Rule 1).
- [ ] Decide where to extract the shared derivation function once the two items above are resolved.
- [ ] Remove the `join.metaNo` cast once the SDK is upgraded.
