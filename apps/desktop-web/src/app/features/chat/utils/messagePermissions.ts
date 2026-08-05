import type { DomainChat } from '@chatic/data';

/**
 * Whether a message can be edited or deleted from the client.
 *
 * Both operations address the message by its server id, so anything that has not
 * finished being sent is out: an optimistic row has no id the server would accept,
 * and a failed one is retried or discarded through the outbox instead. System rows
 * are the server's own transcript and are not ours to rewrite — the server rejects
 * the attempt anyway, and offering the affordance would be a lie.
 *
 * Authorship is the caller's answer, not this function's. `MessageGroup.isMine`
 * already reconciles the account id an optimistic row carries with the cloud id the
 * server rewrites it to on persist, and re-deriving that here would be a second
 * copy of a rule that has already been subtle enough once.
 */
export const canModifyMessage = (chat: DomainChat, isMine: boolean): boolean =>
    isMine && !!chat.id && !chat.isPending && !chat.isFailed && chat.stereo !== 'system' && !chat.hidden;
