import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainChat } from '@chatic/data';

// Only join/leave are sendable subtypes (the empty '' is a stored default, never emitted).
export type SystemSubType = 'join' | 'leave';

export type SendChatFn = (payload: ChatSendInput) => Promise<DomainChat>;

// Emits a join/leave system message over the socket `chat.send` event via the chat repository.
// `chat.send` now accepts `stereo`/`subType`, so system messages take the same path as user
// messages — the current socket session's user becomes the owner (good enough to test self
// enter/exit). content is intentionally empty: the server stores only the subType code.
export const sendSystemChat = (
    sendChat: SendChatFn,
    channelId: string,
    subType: SystemSubType
): Promise<DomainChat> => {
    if (!channelId) throw new Error('channelId is required');
    return sendChat({ channelId, content: '', stereo: 'system', subType });
};
