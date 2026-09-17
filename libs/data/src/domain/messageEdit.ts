import type { DomainChat } from './models';

/**
 * Message edit/delete semantics — whether a message may be changed, and whether it has been.
 *
 * Owned by the data layer rather than an app because both apps ask the same two questions and
 * one of the answers is a stopgap that will have to be replaced in one move (see
 * {@link isMessageEdited}). This is the canonical copy.
 *
 * `apps/desktop-web` keeps its own copy of these rules (`features/chat/utils/messagePermissions.ts`
 * and `features/chat/utils/isEdited.ts`) — reference only, never edited from here, and never the
 * one to change when the rule changes. Moving desktop onto these is deliberately deferred to the
 * day the server grows an edit flag, because desktop has to be touched then anyway; until that day
 * the duplication is real and this comment is the only thing holding the two in step.
 *
 * Both predicates read `hidden` for truthiness rather than comparing it to `true`. The server
 * models it as 0/1 and only the view type narrows it to a boolean, so `=== true` would let a
 * deleted message come back as an ordinary one the first time a 1 arrives on the wire.
 */

/**
 * Whether a message can be edited or deleted from the client.
 *
 * Both operations address the message by its server id, so anything that has not finished being
 * sent is out: an optimistic row has no id the server would accept, and a failed one is retried or
 * discarded through the outbox instead. System rows are the server's own transcript and are not
 * ours to rewrite — the server rejects the attempt anyway, and offering the affordance would be a
 * lie. An already-deleted row has nothing left to change.
 *
 * Authorship is the caller's answer, not this function's. The two apps decide "is this mine"
 * differently — desktop reconciles the account id an optimistic row carries with the cloud id the
 * server rewrites it to, `apps/web` compares one id — and each app's answer already backs
 * something visible (which side of the feed the bubble sits on). Re-deriving it here would be a
 * third copy of the subtlest rule of the three.
 */
export const canModifyMessage = (chat: DomainChat, isMine: boolean): boolean =>
    isMine && !!chat.id && !chat.isPending && !chat.isFailed && chat.stereo !== 'system' && !chat.hidden;

/**
 * Whether this message has been changed since it was sent.
 *
 * The server carries no edit flag — no `editedAt`, no `isEdited` — so the only signal available is
 * that `updatedAt` has moved past `createdAt`. A freshly sent message arrives with the two equal
 * (observed on the wire: both `1785809147347`), and nothing else writes the chat row today: read
 * cursors live on `$join`, and unread is derived client-side from `(chatNo, metaNo)` rather than
 * stored per message.
 *
 * That this is an inference does not leak to callers: they ask "was this edited" and the reasoning
 * stays in here. The weakness is worth naming anyway — it reads "the row was written again", not
 * "a person changed the text". Any future server-side write to a chat row (a moderation flag, a
 * pin, a counter) would make every touched message read as edited. A field on the model is the fix;
 * this is what can be done without one, and keeping it in one place is what makes that fix a
 * one-line change.
 *
 * Three exclusions, all of them "we have no business claiming an edit here":
 *   - deleted rows — the server's delete is a `PUT` on the same row, so it moves `updatedAt` too,
 *     and "This message was deleted. (edited)" is nonsense.
 *   - unsent rows — nothing has reached the server to be edited.
 *   - missing timestamps — with no basis to judge, say no rather than guess.
 *
 * A message edited optimistically shows its new text immediately and picks up the marker only when
 * the server's record lands. That lag is intended: marking it early would mean un-marking it on
 * failure, and the claim would be false for as long as it took.
 */
export const isMessageEdited = (chat: DomainChat): boolean => {
    if (chat.hidden || chat.isPending) return false;
    const createdAt = chat.createdAt ?? 0;
    const updatedAt = chat.updatedAt ?? 0;
    return createdAt > 0 && updatedAt > createdAt;
};
