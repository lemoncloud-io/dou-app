# ADR-0379: The home line is the room's latest activity, and a row that prints a reply opens its thread

> Status: Accepted · Decided: 2026-11-26
> Scope: `apps/web/src/app/features/home/components/ChannelList.tsx` (`ChannelItem`, `ChannelList`)
> Supersedes: [ADR-0285](./0285-the-home-line-is-the-last-top-level-message-and-its-time-the-latest-activity.md)
> for the home list. Its two last messages per room (`DomainLastChat.chat` and `.activity`) stay, and so
> does its rule for place channel management and search.
> · The behaviour is documented in [last-chat](../../apps/web/docs/feature/home/last-chat.md)

## Context

ADR-0285 had the home row print the room's last top-level message and take only its time and order
from the latest activity, so that tapping a row never landed on a feed without the line it printed.
In use the split read as a bug: a reply in a thread on an older message raised the unread count, moved
the room up and refreshed its time, while the line beside them stayed on a message that had been there
for hours. People could not tell what had arrived.

The dead end ADR-0285 removed came from where the tap went, not from what the row printed. The
alternative it set aside, printing the reply and opening its thread, is what the desktop Channels and
DM lists have done since ADR-0242, and a notification for a reply already opens the thread directly.

## Decision

1. **The home row prints `DomainLastChat.activity`.** One chat now gives the row its line, its
   writer's name, its "@me" mark and its time, and `sortChannels` keeps ordering by it. A reply prints
   behind the `chat.preview.thread` mark that `lastChatPreview` already carries.
2. **A row whose line is a reply opens that reply's thread**, on the reply:
   `/channels/<id>/thread/<rootNo>?chatNo=<replyNo>`, the shape a notification tap uses. Any other row
   opens the room as before.
3. **A row that prints its draft opens the room**, even when the activity is a reply: the draft belongs
   to the room's composer.
4. **Nothing below the web changes.** `isPreviewableChat`, `isActivityChat` and the native SQL mirror
   already answer both rows, so the mobile app needs no new build.

## Alternatives

- **Keep ADR-0285.** No dead end, but the line and the unread count tell two different stories.
- **Print the reply and open the room.** The ADR-0242 dead end: the room's feed has no row for the
  reply.
- **Change place channel management and search too.** Those rows are not the reader's way into the
  room, and their taps do not route by the line. Left on `chat` until someone asks.

## Consequences

- Tapping a row whose newest message is a reply skips past the room's own unread top-level messages;
  the reader reaches them by going back from the thread.
- `useLastChats` is now read only by place channel management; home reads `useLastActivities` alone.
- The home row and the desktop lists follow the same rule again.
