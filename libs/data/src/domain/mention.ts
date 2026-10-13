import type { ChatMentionBody } from '@lemoncloud/chatic-socials-api';
// The send input comes from `-lib`, not `-api`: both export a `ChatSendInput`, and only `-lib`'s
// carries `uploadIds`. Taking the `-api` one compiles just as well and silently drops attachments
// from every caller's type.
import type { ChatSendInput } from '@lemoncloud/chatic-sockets-lib';

import type { DomainChat } from './models';

/**
 * Who a message calls out, as the sender's composer picked it: member ids and/or "everyone".
 *
 * The server never reads the message body to decide who was mentioned — an `@name` typed by hand,
 * an e-mail address (`ops@here.io`) or a name that is a prefix of another (`@Min` / `@Minsu`) would
 * all be guessed wrong. What the composer picked is the only signal, and it travels beside the text.
 */
export type { ChatMentionBody };

/**
 * A chat send that may carry the mention picked in the composer.
 *
 * The socket SDK's send type does not declare `mention` yet, while the chats service already takes it
 * on `chat.send` and stores what it keeps as the message's `mention$`. The payload reaches the socket
 * as it is, so widening the type here is all a sender needs; once the SDK declares the field this
 * intersection is a no-op.
 */
export type ChatSendPayload = ChatSendInput & { mention?: ChatMentionBody };

/** The stored record as it reaches the cache: `all` is `true` from a read, `1` from `chat.sync`. */
type MentionRecord = DomainChat['mention$'];

/** `all` arrives as a boolean from a read and as the model's `1` from a live `chat.sync`. */
const isEveryone = (all: unknown): boolean => all === true || all === 1;

/**
 * Whether a message calls out the viewer — by id, or by mentioning everyone.
 *
 * `viewerIds` are every id the viewer is known by in that channel: the account uid and, in a
 * subscription cloud, the cloud user id the channel's member list holds. The record keeps channel
 * member ids, so checking only the account uid would miss every mention in a cloud room.
 *
 * No record means no mention — that covers a message typed with no pick, a webhook, and anything
 * sent before mentions travelled with the message.
 */
export const isMentioningViewer = (
    chat: Pick<DomainChat, 'mention$'> | null | undefined,
    viewerIds: ReadonlyArray<string | null | undefined>
): boolean => {
    const record = chat?.mention$;
    if (!record) return false;
    if (isEveryone(record.all)) return true;
    const ids = record.userIds ?? [];
    return viewerIds.some(id => !!id && ids.includes(id));
};

/**
 * The record a not-yet-acknowledged row carries for the mention it was sent with.
 *
 * An optimistic row is the only copy of a failed send, and a resend rebuilds its payload from that
 * row — so without this the retry of a message that mentioned someone would go out mentioning no one.
 */
export const toMentionRecord = (mention: ChatMentionBody | null | undefined): MentionRecord | undefined => {
    if (!mention) return undefined;
    const userIds = mention.userIds?.filter(Boolean) ?? [];
    const all = mention.all === true;
    if (!userIds.length && !all) return undefined;
    return { ...(userIds.length ? { userIds } : {}), ...(all ? { all: true } : {}) };
};

/**
 * The send-side shape of a stored record — what a resend has to put back on the wire.
 *
 * `all` is sent as `true` only: the server ignores any other value, so a record's `1` from a live
 * `chat.sync` is turned back into `true` here rather than forwarded.
 */
export const toMentionBody = (record: MentionRecord | null | undefined): ChatMentionBody | undefined => {
    if (!record) return undefined;
    const userIds = record.userIds?.filter(Boolean) ?? [];
    const all = isEveryone(record.all);
    if (!userIds.length && !all) return undefined;
    return { ...(userIds.length ? { userIds } : {}), ...(all ? { all: true } : {}) };
};
