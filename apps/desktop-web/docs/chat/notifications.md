# Notifications

How the desktop tells you about a new message when you are not looking at its
channel: the OS banner's title, and what the title promises. The code is
`src/app/shared/hooks/useDesktopNotifications.ts`; whether a message calls you
is decided in `src/app/shared/utils/mentionMatch.ts`.

## Banner titles

A group channel names the kind of call first. The body stays `sender: message`.

| Message | Title |
|---|---|
| Names me (`mention$.userIds` holds my id, or the text names me when there is no record) | `Mention · #channel` (`멘션 · #채널`) |
| Calls everyone (`mention$.all`, or a group word when there is no record) | `@all · #channel` (`@전체 · #채널`) |
| Both in one record | The direct title — a naming beats everyone |
| Record names someone else | The plain `#channel`, though the text has my name |
| Nameless group channel mentioning me | `Mention · sender` (`멘션 · 보낸사람`) |

A 1:1 (`stereo: 'dm'`) keeps the sender as its title whatever the mention
record says — every message there is for me already. A cross-cloud push keeps
its `#channel` title: the push carries no mention record, so guessing from the
text would pin "mention" on a message for someone else with my name.

The record wins whenever the message has one; the text is only read for a
message with none (an older client, a webhook). The words for "everyone" come
from the existing `chat.mention.everyoneWord` key (`all` / `전체`).
