# Notifications

How the desktop tells you about a new message when you are not looking at its
channel: the OS banner's title, what the title promises, and how a push from
another cloud or the relay is shown and opened. The code is
`src/app/shared/hooks/useDesktopNotifications.ts` for the active server's own
messages and `src/app/shared/hooks/useCrossCloudPushNotifications.ts` for
pushes; whether a message calls you is decided in
`src/app/shared/utils/mentionMatch.ts`.

## Place and cloud levels

A person can set one notification level — all messages, mentions only, or off — for a whole place
(the place's settings page) or a whole cloud (the cloud's hub). The server keeps no such field: its
notification setting is per member per channel (`join.notify`), and a device can only mute push as a
whole. So a place level is not stored as a level on the server at all. Choosing one writes that
level to each channel of the place, exactly as the channel's own setting would: the local pref at
once, and `join.notify` through the join outbox, which resends it until the server has it. Other
devices follow those channel records. A cloud level is the same write for every place of the cloud.

- A 1:1 has no "mentions only" (see the channel settings), so a place set to mentions only leaves
  its 1:1s at all messages.
- My notes-to-self room is listed in every place and never notifies, so a place level skips it.
- A channel already at the chosen level is not written again.
- A refused batch raises one toast (`place.settings.notify.failed`), not one per channel or place.

**Exceptions.** Once a place has a level, a channel set differently is an exception, and the place
page counts them ("Channels set differently: N") with a link to the place's channel list, where each
one is changed from its own settings. With no level chosen and channels that differ, no option is
checked and the count is against "all messages".

**New channels.** The level is also remembered on this device (`placeNotify` in the notification
prefs, keyed by cloud and place), together with the channels it was applied to. `usePlaceNotifyInheritance`
watches the active cloud's channel cache and writes the place level to a channel the first time this
device sees it in that place, then adds it to the known list. A known channel is never written
again, so an exception stays one. Re-applying a place level adds to the known list rather than
replacing it, so a channel that was not loaded at that moment is still treated as known.

Two limits follow from there being no server field. A channel inherits only once this app has seen
it, so a message in a channel created while the app was closed, and never listed since, can still be
pushed at the server's default. And the remembered level is per device: another device sees the
channel records, not the place level, so it shows a level for the place only when every channel
agrees. A cloud level is offered only for the cloud the session is in, because listing another
cloud's channels needs that cloud's session; the hub of any other cloud says to switch first.

The device-wide controls on the Settings page — desktop banners, quiet hours, snooze — stay
device-wide and sit on top of these levels.

## Banner titles

A group channel names the kind of call first. The body stays `sender: message`.

| Message                                                                                 | Title                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Names me (`mention$.userIds` holds my id, or the text names me when there is no record) | `Mention · #channel` (`멘션 · #채널`)             |
| Calls everyone (`mention$.all`, or a group word when there is no record)                | `@all · #channel` (`@전체 · #채널`)               |
| Both in one record                                                                      | The direct title — a naming beats everyone        |
| Record names someone else                                                               | The plain `#channel`, though the text has my name |
| Nameless group channel mentioning me                                                    | `Mention · sender` (`멘션 · 보낸사람`)            |

A 1:1 (`stereo: 'dm'`) keeps the sender as its title whatever the mention
record says — every message there is for me already. A cross-cloud push keeps
its `#channel` title: the push carries no mention record, so guessing from the
text would pin "mention" on a message for someone else with my name.

The record wins whenever the message has one; the text is only read for a
message with none (an older client, a webhook). The words for "everyone" come
from the existing `chat.mention.everyoneWord` key (`all` / `전체`).

## A push from the relay

A push names its source cloud in `cid`. A message on the relay — the Home tile — carries `#` there
instead of a cloud id, and every reader of the push turns it into the relay's own id, `default`, before
using it: `pushCloudIdOf` from `@chatic/data`, the same function apps/web reads its pushes through.
Read raw, `#` matched no cloud, so a click on the toast or banner switched to a cloud named `#` and
failed with "cloud not found", even on the relay.

- **Opening it.** The click lands on the relay: from another cloud it leaves that cloud, and on the
  relay it opens the channel in place. The open names no place, because the Default Cloud pins its
  one place; whatever `sid` the push carries is not used.
- **Not twice.** While the relay is open its own socket banners the message, so the push raises no
  second banner — the same rule as a push from the active cloud.
- **Muted.** The server's notify mode for the channel is read from the relay's cached channel, so a
  relay channel set to "off" stays silent.

## Dock, place dots and window title

All three read one answer (`placeUnreadCounts`): the total is the OS badge and
the window title's count, the per-place numbers light the rail and place dots.

- An "all messages" channel adds its unread, as before.
- A "mentions only" channel adds `min(unread mentions, channel unread)`. The
  quiet chatter around the mentions stays out, and a mention read on another
  device — whose channel unread is back to 0 — leaves no number behind.
- An "off" channel adds nothing, mention or not.
- A 1:1 never reads as "mentions only" (the server sends every message of it),
  so a mention stored there is already inside its unread.

"What I have read" is the same boundary the channel row's `@` uses
(`channelReadNo`: this device's cursor or the channel record's, whichever is
further), so a mention counted here is one the row also marks unread.

Limits, all from the mentions inbox living on this device: a mention that
arrived while the app was closed is never captured and lights nothing here; a
mention crowded out by a newer message (the feed hands each channel's latest
only) is missed the same way; and past the inbox's 500-entry cap, which mentions
share with the inbox's other kinds ([inbox.md](./inbox.md)), an unread mention
can fall out and shrink a channel's share. Only mention items count here: a 1:1
message, a reply or a reaction in the inbox adds nothing.

## Quiet-hours breakthrough

Off unless turned on, under the quiet-hours card in Settings (the switch only
shows while quiet hours are set). When on, a message whose mention record names
me directly still banners during quiet hours:

| Message during quiet hours                       | Banner |
| ------------------------------------------------ | ------ |
| Record names me (`mention$.userIds` holds my id) | Yes    |
| Record calls everyone (`mention$.all`)           | No     |
| My name in the text, no record                   | No     |
| 1:1 message                                      | No     |
| Anything while snoozed                           | No     |

Snooze is never broken through — it is pressed by hand, often while sharing the
screen, and a banner there would put the message body on the shared screen. Past
the breakthrough the usual checks still run: the global switch, the channel
level (an "off" channel stays silent), the open channel, the read cursor, and my
own messages. A banner broken through on macOS still needs Focus off to show;
the setting says so.
