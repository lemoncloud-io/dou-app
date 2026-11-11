import type { DomainChat } from './models';

/**
 * Message edit/delete semantics — whether a message may be changed, and whether it has been.
 *
 * Owned by the data layer rather than an app because both apps ask the same two questions, and one
 * answer depends on which kind of server wrote the row (see {@link isMessageEdited}). This is the
 * canonical copy.
 *
 * `apps/desktop-web` reads {@link isMessageEdited} from here. It still keeps its own copy of the
 * permission rule (`features/chat/utils/messagePermissions.ts`) — reference only, never edited from
 * here; this comment is what holds the two in step.
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
 * Whether this message's text has been changed since it was sent.
 *
 * A server that records edits stamps `editedAt` when — and only when — the text is changed, and that
 * is the answer wherever it is present. A server that does not (a cloud not yet redeployed) carries no
 * edit flag, so the only signal there is that `updatedAt` has moved past `createdAt`. Both kinds of
 * server are live at once, which is why the inference stays as the fallback: reading `editedAt` alone
 * would drop the marker from every message edited against an older server.
 *
 * The inference reads "the row was written again", not "a person changed the text". A freshly sent
 * message arrives with the two times equal (observed on the wire: both `1785809147347`), and nothing
 * else writes the chat row on those servers: read cursors live on `$join`, and unread is derived
 * client-side from `(chatNo, metaNo)` rather than stored per message.
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
    if ((chat.editedAt ?? 0) > 0) return true;
    const createdAt = chat.createdAt ?? 0;
    const updatedAt = chat.updatedAt ?? 0;
    return createdAt > 0 && updatedAt > createdAt;
};
