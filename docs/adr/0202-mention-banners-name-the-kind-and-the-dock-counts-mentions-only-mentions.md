# ADR-0202: Mention banners name the kind, and the dock counts mentions-only mentions

> Status: Accepted · Decided: 2026-10-14 · Implemented: `feat/desktop-mention-notify`
> · Follows [ADR-0199](./0199-the-desktop-sends-and-reads-the-mention-record.md),
> which gave the desktop the mention record and the mentions inbox but left the banners
> titled as plain messages and the dock blind to mentions-only channels
> · Scope: `apps/desktop-web` — `shared/utils/mentionMatch` (`mentionKind`), `useDesktopNotifications`,
> `shared/utils/channelUnread` (`channelReadNo`), `shared/utils/placeUnreadCounts`,
> `shared/hooks/usePlaceUnreadCounts`, `shared/stores/useMentionsStore` (`countUnreadMentionsIn`),
> `features/chat/components/ChannelList`, `src/locales`. No change to `libs/*`, `apps/web`,
> `apps/mobile` or the server
> · The module doc is [desktop-web docs/chat/notifications.md](../../apps/desktop-web/docs/chat/notifications.md);
> [docs/shell/cloud-rail.md](../../apps/desktop-web/docs/shell/cloud-rail.md) (§ Unread) points at it

## Context

After ADR-0199 the desktop knew who a message called, but its surfaces did not say so. A mention
arrived with the title `#channel`, identical to any other message, so "someone called me" was
invisible until the channel was opened. And a mentions-only channel — the level a user picks to
mean "tell me only when I am called" — counted toward nothing: the dock badge, the place dots, the
cloud dot and the window title all read "all messages" channels only, so a mention there lit the
row's `@` and nothing else.

## Decision

1. **One decision point for "was I called, and how"** (`mentionKind` → `direct` / `everyone` /
   `null`). The mention-only filter and the banner title share it, so the two cannot disagree about
   the same message. `mentionsMe` is that answer as a boolean. The record wins whenever the message
   has one; a message with none is read by its text, my name over a group word.
2. **A group-channel banner names the kind first.** Direct: `Mention · #channel`; everyone:
   `@all · #channel` (the word reused from the existing `chat.mention.everyoneWord` key, `all` /
   `전체`); both in one record: the direct title. A nameless group channel reads `Mention · sender`.
   A record naming only others keeps the plain `#channel`, whatever the text says.
3. **A 1:1 and a cross-cloud push keep their old titles.** Every message in a 1:1 is already for me,
   so a mention title there would promise a distinction that does not exist. A push carries no
   mention record, so guessing from the text would pin "mention" on a message for a stranger who
   shares my name.
4. **The dock, the dots and the window title read one answer** (`placeUnreadCounts`): the total is
   the badge and the title count, the per-place numbers light the rail and place dots. A
   mentions-only channel adds `min(unread mentions, channel unread)`; "off" adds nothing.
5. **The `min` is the point, not the count.** The cap keeps two failures out: the quiet chatter
   around the mentions is never counted, and a mention read on another device — whose channel
   unread is back to 0 — leaves no number behind. An "all" channel is unchanged (its mentions are
   already inside its unread).
6. **"What I have read" is the row's answer** (`channelReadNo`: this device's cursor or the channel
   record's, whichever is further), shared by the row's `@` and the totals, so a mention counted
   toward the dock is one the row also marks unread. The inbox is grouped once per call by
   `place|channel`, and only when a mentions-only channel is in the list.
7. **The copy is translated at notify time** (`i18next.t` in the feed callback, not a
   render-captured `t`): the callback outlives the render that registered it, so a captured
   translator would go stale on a language switch. These are the hook's first translated strings.

## Consequences

- A mention in a mentions-only channel now raises the dock by one and dots its place and cloud,
   and reading the channel clears all three together.
- The totals inherit the inbox's device-local limits, now documented in the module doc: a mention
   that arrived while the app was closed was never captured; a mention crowded out by a newer
   message (the feed hands each channel's latest only) is missed; past the inbox's 200-entry cap an
   unread mention can fall out and shrink a channel's share.
- The quiet-hours breakthrough (a setting to let a direct mention banner through quiet hours) is
   **not** decided here. It waits on a device check that the live channel feed actually carries
   `mention$`; if the feed does not, the breakthrough would never fire and the fix would be
   server-side. Its decision belongs in the change that ships it.

## Alternatives considered

- **Sentence titles** (`Raine mentioned you in #general`) — the keyword lands at the end where the
   OS truncates, and a nameless channel leaves no grammatical subject.
- **Slack-style dock** (mentions + 1:1s only) — would redefine the badge for everyone already reading
   it as "unread messages".
- **Whole channel unread for a mentions-only channel** — counts the quiet messages the user asked
   not to be told about.
- **Record-only mention counting** (ignore the text fallback) — the banner would say "mention" while
   the row shows no `@` for the same message, and vice versa.
- **A `@` count on the row / a number in the mentions inbox** — the inbox is device-local and can be
   wrong; a precise-looking number would over-promise.
