# Webhook messages

An integration — an alerting service, a deploy bot — can post into a group channel without being a
person in it. The server stores that post as a chat with `stereo: 'webhook'` and turns the card the
sender described into Block Kit blocks (`blocks$`). Desktop only reads these; nothing in the app can
create one, and the sender's token never reaches the client. This page is about how such a message
looks and behaves on the reader's side.

## The card

The message body is drawn by `@chatic/block-kit` (`BlockKitMessage`), through the same path as any
structured message: `resolveChatBlocks` prefers the server's `blocks$` field, then a Block Kit JSON
payload in `content`, and a message with neither is plain text. The subset is the one the server
produces — `header`, `section` (with `fields`), `divider` and `context`. A block type this build does
not know is shown as a short `unsupported block` line rather than dropped, so the card still reads.
Links in the mrkdwn text open in a new window: the row passes no `onLinkClick`, because the Electron
shell hands a `_blank` anchor to the OS browser, the same way `RichText`'s links leave. They take
the `--link` token, which here is also every message link's and the composer's link colour, so a card
link is this app's blue rather than the purple apps/web gives its card links.

A message with at least one drawable block sits in a card: the card surface with a hairline border,
10px corners and 24px inside it, as wide as what it holds up to the message column — a short alert is a
small card, a stack trace fills the column. A message whose blocks are all unknown falls back to its
own text with no card around it; that text is a message, and a frame would make it look like an
integration's card.

The design draws the card twice, a step larger for the desktop column than for the phone, and this
app asks for the larger one (`scale="desktop"`): an 18px heading (16px from level 3 down), 16px
section text and field values, 14px for a stack trace, its fold toggle and the context line, 13px for
a field's caption. The sizes are written out in
`@chatic/block-kit` rather than taken from this app's type tokens, which name the same steps as
apps/web's at different sizes — so a card body reads larger than an ordinary message's 15px, which
is what the design asks for.

In the card only the heading speaks at full ink; section text, field values and the context line
are quieter secondary text. Three Slack shapes are read for what they mean rather than literally: a
field written `*Label*\nvalue` is a small caption over its value, an inline code run is a bordered
chip in the text's own face (a service name, a version, a status — a value, not code), and a fenced
run (in practice a stack trace) is wrapped secondary text that folds past five lines. That last one
is not monospaced, as the design draws a trace — the cost is that a fence holding column-aligned
output, a table or pretty-printed JSON, loses its alignment. None of this touches the composer's own
code styles, which are for code a person typed.

When the sender gave a source (its `meta.sourceUrl`, the full report), the card's heading is the
link to it. The server writes that source as the last element of the card's last context line,
`<url|원문 보기>`; `takeSourceLink` takes it off that line and the row hands it to `BlockKitMessage` as
`sourceUrl`, so the heading is drawn as the heading and underlines on hover, with no icon beside it.
A screen reader hears "View source" (`chat.webhook.openSource`) after the title. Only an `http`/`https`
address moves, and only onto a plain-text heading; otherwise the link stays where the server put it.
The move is drawing only: what Copy and Save read (below) is unchanged.

`content` is not the card: for a message with `blocks$` it is the server's plain-text summary, and it
is what Copy, Save, the delete confirmation and the link unfurl use. Folding the blocks back into text
there would replace that summary with the card's raw parts.

A webhook message is an ordinary message row, not a system notice. Only `stereo === 'system'` (join
and leave events, reactions) takes the notice layout, so a webhook card can be replied to, reacted to
and saved like a person's message.

## The sender

The sender is a system user, not a channel member, so none of the person-shaped lookups apply:

- **Badge.** The name is followed by an "App" badge (`chat.webhook.badge`), which tells an
  integration's card apart from a person with the same name.
- **No profile.** The avatar and name are plain content, not popover triggers. There is no profile to
  open, and nothing to start a direct message with.
- **Name.** `owner$.name` when the server embeds it, else "Webhook". The roster and Place Profiles are
  not consulted at all: the sender is not a member, and its owner id could collide with a person's and
  borrow their name. Whether the server embeds `owner$` for webhook messages is
  not confirmed, and both cases are covered by tests. A webhook name never waits on the roster, so it
  shows no loading skeleton.
- **Grouping.** A webhook message never joins a person's author block, and the reverse, even if the
  server sent both without an owner id. Consecutive messages from the same sender, by name, still collapse
  into one block while they share a clock minute, as a person's do; posts under different names do not.

## What the rest of the app does with one

| Surface                    | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OS notification            | Raised like a person's message. The guard is `stereo !== 'system'`, so a webhook passes; the body is the sidebar preview line (`messagePreview`: the plain text of `content`, or an attachment label when there is none). Only in a named channel, and only when `owner$` carries a name, is the body prefixed with that name; in a DM the title is that name instead. Without `owner$` the banner has no sender name. A webhook is never "mine", so a banner is not suppressed even if its owner id equals the viewer's. The same holds for the cross-cloud push banner when the push payload carries `stereo` (not confirmed), and for the mentions inbox. |
| Unread badge               | Counted. The badge is `chatNo - metaNo`, and only system messages are netted out. This matches the server's rule that a webhook counts as a user message for unread and push; if that rule changes, the client's `stereo` check and the server's counter disagree without any error. A webhook is never "mine" (`isOwnChat`), so an owner id equal to the viewer's neither clears the sidebar badge when it is the latest message nor hides the card from the "new messages" divider and count.                                                                                                                                                              |
| Sidebar preview and search | Read `content`, the same plain-text summary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Edit                       | Hidden on any structured message, so a card is never turned into text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Delete                     | Offered only on my own messages, and the sender is never me in the client's ownership check, so the app offers no delete on a webhook message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Limits

- Nothing in the card is interactive beyond its links: Block Kit buttons and modals are not drawn.
- Uploaded files on an integration's message are not confirmed: the client draws whatever the server
  attached, and what the server accepts from a sender is not checked here.
- The card is whatever the server stored. What a sender may put in it — text length, how many cards
  per post — is that sender's service's rule, so a card can look shorter than what the sender posted
  and the client has nothing to compare it with.
