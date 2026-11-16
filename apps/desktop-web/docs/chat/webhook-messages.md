# Webhook messages

An integration — an alerting service, a deploy bot — can post into a group channel without being a
person in it. The server stores that post as a chat with `stereo: 'webhook'` and turns the card the
sender described into Block Kit blocks (`blocks$`). Desktop only reads these; nothing in the app can
create one, and the sender's token never reaches the client. This page is about how such a message
looks and behaves on the reader's side.

## The card

The message body is drawn by `@chatic/block-kit` (`BlockKitMessage`), through the same path as any
structured message: `resolveChatBlocks` prefers the server's `blocks$` field, then a Block Kit JSON
payload in `content`, and a message with neither is plain text. It reads blocks only from a webhook
send (`stereo === 'webhook'`): a person who pastes a Block Kit payload wrote text, and a card from
the composer would look exactly like an integration's alert, so their message stays that text. The
subset is the one the server produces — `header`, `section` (with `fields`), `divider` and
`context`. A block type this build does not know is shown as a short `unsupported block` line
rather than dropped, so the card still reads.
Links in the mrkdwn text open in a new window: the row passes no `onLinkClick`, because the Electron
shell hands a `_blank` anchor to the OS browser, the same way `RichText`'s links leave. Their colour is
the card's accent (below) when the sender gave one, and otherwise the `--link` token, which here is also
every message link's and the composer's link colour — this app's blue rather than the purple apps/web
gives its card links.

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

Every size on this page is the one at the default text size. The sizes and the 24px padding are
written in `rem`, so they follow the text size setting (which moves the root font size, see
[Settings](../settings/README.md)) in step with the rest of the app; only the 10px corners and the
border stay fixed.

In the card only the heading speaks at full ink; section text, field values and the context line
are quieter secondary text. Three Slack shapes are read for what they mean rather than literally: a
field written `*Label*\nvalue` is a small caption over its value, an inline code run is a bordered
chip in the text's own face (a service name, a version, a status — a value, not code), and a fenced
run (in practice a stack trace) is wrapped secondary text that folds past five lines. That last one
is not monospaced, as the design draws a trace — the cost is that a fence holding column-aligned
output, a table or pretty-printed JSON, loses its alignment. None of this touches the composer's own
code styles, which are for code a person typed.

### Type badge, accent colour and source link

These three come from the message's `source$`, not from its blocks: the server copies the sender's
alert channel name (`key`), the full report's address (`url`) and the sender's `color` exactly as sent
onto every webhook message, beside `blocks$`. The row passes `source$` to `BlockKitMessage` with the
blocks. A person's message is never a card, so a `source$` on one is never read. A hidden message
carries `source$: null`, which reads as none. Messages the server stored before it wrote `source$`
(10 November 2026) have neither badge nor accent; nothing is backfilled.

- **Type badge.** A pill at the top of the card saying the channel name in capitals (a style; the
  text stays the name), hyphens and underscores read as spaces (`ci-deploy` → CI DEPLOY), 12px bold,
  cut to one line. No `key`, no badge. The name is not mapped through any table: whatever a
  sender registers is what shows, and it is printed as text, never read as mrkdwn or markup.
- **Accent colour.** `color` decides the badge's colours and the colour of every link in the card.
  The app reads it with the same rules the server uses to pick the emoji it puts before the title, so
  the two never disagree: `danger`/`red`, `warning`/`orange`/`yellow` and `good`/`green` in any case
  take the design's ERROR red, an amber, and the ATTENDANCE green; a 3- or 6-digit hex, with or without
  `#`, keeps its hue; anything else, and any grey (HSL saturation under 0.2), is the neutral card — the
  design's grey badge and the app's own link colour. The title's emoji stays as the server wrote it, so
  an error card shows 🔴 and an ERROR badge together.
    - What the card paints is always a colour computed from the input, never the input: a value that
      would run as CSS has nowhere to go.
    - Each colour is fitted to 4.5:1 per theme by moving its lightness only — darker on the light card,
      lighter on the dark one. The ground it is fitted to is a reference a step past every client's card
      (light `#F7F7F7`, dark `#333333`), which `tokenContrast.spec.ts` holds this app's `--card` to.
    - The colours reach the links as CSS variables on the card root, one per theme, chosen by the
      `.dark` class; a colour known only at run time cannot be a Tailwind class.
- **Source link.** When the sender gave a source, the card draws "View source" (`chat.webhook.openSource`)
  as its own link line right under the title (last, when there is no title). The title stays plain
  text. `takeSourceLink` reads the address from `source$.url` first, and for a message stored before
  that field from the server's own `<url|원문 보기>` element at the end of the card's last context line;
  either way it takes that element off the line, so the link shows once. Only an `http`/`https`
  address becomes a link. When nothing drawable is left once that element is off — it was the card's only drawable line — the
  card shows the message's own text with the link under it.
  The move is drawing only: what Copy and Save read (below) is unchanged.

`content` is not the card: for a message with `blocks$` it is the server's plain-text summary, and it
is what Copy, Save, the delete confirmation and the link unfurl use. Folding the blocks back into text
there would replace that summary with the card's raw parts.

A webhook message is an ordinary message row, not a system notice. Only `stereo === 'system'` (join
and leave events, reactions) takes the notice layout, so a webhook card can be replied to, reacted to
and saved like a person's message.

## The sender

The sender is a system user, not a channel member, so none of the person-shaped lookups apply. The
row knows it is one from the message itself (`isWebhookChat`, `@chatic/data`, shared with apps/web).
The account's own record (`stereo: 'system'`, looked up by `ownerId`) would be the better source, and
the one per-integration bots will need, but the client cannot read it yet: the account is not a
member, so the member sync never brings it into the user cache, and the server has no call that
reads a user by id. The `owner$` a message carries is no substitute — the server stores only its id
and name.

- **No app badge.** The name stands alone. It used to be followed by an "App" mark; the card under it
  now carries its own type badge, and two labels on one message read as two different things. Until
  per-integration bot names exist, nothing beside the name says it is not a person — an accepted gap.
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
