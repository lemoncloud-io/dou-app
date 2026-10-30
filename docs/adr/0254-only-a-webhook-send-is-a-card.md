# ADR-0253: Only a webhook send is a card, and its sender is drawn as a bot

> Status: Accepted · Decided: 2026-10-30 · Implemented: `feat/webhook-card-gating`
> · Scope: `libs/block-kit/src/resolveChatBlocks.ts` · `libs/data/src/domain/chatSender.ts` ·
> `apps/web/src/app/features/channels/components/ChannelMessageRow.tsx` ·
> `apps/web/src/app/features/channels/utils/messagePlainText.ts`
> · The module docs are [desktop-web webhook messages](../../apps/desktop-web/docs/chat/webhook-messages.md)
> and [apps/web chat room](../../apps/web/docs/feature/channels/chat-room.md)

## Context

A chat can be drawn as a Block Kit card from two places: the server's `blocks$`, which it builds only
for a webhook send, and a Block Kit JSON payload in `content`. The client read both from any message.
So a person who pasted a payload into the composer got a card — drawn exactly like an integration's
alert, with the same frame, heading and (since ADR-0246) a linked title.

The sender had the same gap from the other side. desktop-web treated a sender as an integration when
the message said `stereo: 'webhook'`; apps/web did not ask at all, and a webhook row there offered to
open the system account's profile, which has nothing behind it.

The server marks both. `chat.stereo` is `user`, `system` (join, leave, reaction events) or `webhook`,
and it refuses `webhook` on a person's send. The account behind every webhook send is `#webhook`, a
user whose own `stereo` is `system`.

## Decision

1. **A card only for a webhook send.** `resolveChatBlocks` reads no blocks unless
   `chat.stereo === 'webhook'`; from anyone else, `blocks$` and a payload in `content` are both
   ignored and the message is the text it carries. On apps/web the surfaces that hold the whole
   message — Copy, the expanded view, the thread root — read it the same way (`chatPlainText`).
2. **The sender is a bot when the message is a webhook send** (`isWebhookChat`, `@chatic/data`, one
   definition for both apps). desktop-web already drew it so; apps/web now stops offering its profile.
3. **The account's record is where this belongs, and is not read yet.** Whether a sender is a bot is
   a fact about the account (`stereo: 'system'`, looked up by `ownerId`), and per-integration bot
   accounts will need it. The client cannot read that record today: the webhook account is not a
   channel member, so the member sync never brings it into the user cache, and the server has no
   call that reads a user by id. Until it does, the message's `stereo` answers for its sender — true
   of every webhook post, since one system account sends them all.

## Alternatives

- **Keep drawing any payload as a card.** What the client has done since Block Kit landed, and
  nothing sends one from the composer on purpose. Rejected: the card is how a reader recognises an
  alert, and anyone could post one that reads as real.
- **Read the sender's kind from the `owner$` a message carries.** It is on every message, but the
  server stores only the account's id and name there — no `stereo` — and a copy frozen into each
  message is the wrong home for a fact about the account. Rejected in favour of the account record.
- **Bring the webhook account in through the member sync.** The sync is defined as the channel's
  current members, and an id missing from it reads as someone who left. Rejected; a lookup by id is
  the server change to ask for.

## Consequences

- A person's pasted payload reads as raw JSON in their row, and is copied and expanded as that text.
- Text surfaces that have only a body to go on — the sidebar and home previews, notifications,
  search, a push — still flatten a payload in `content` whoever sent it. A pasted payload therefore
  previews as its words and reads as JSON in the row.
- `resolveChatBlocks` knows the word `webhook` as well as `isWebhookChat`. The block lib cannot depend
  on `@chatic/data`, and the card rule belongs with the reader it gates.
- Moving the bot check to the account record waits on the server: a user lookup by id. When it
  lands, `isWebhookChat` stays the card rule and the sender check moves to the record.
