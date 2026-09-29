import type { InAppPushData } from '../../../utils/resolveInAppPushRoute';

/** The push `type` a chat message is expected to carry. */
const CHAT_PUSH_TYPE = 'chat';

/**
 * Whether a foreground push is a chat message — the only kind that may light a cloud's unread mark.
 *
 * The rule is "chat passes", not "known non-chat is blocked": a notification type introduced later
 * is kept off the dot without anyone having to remember to add it to a list. A cloud-activation push
 * (`type: 'cloud'`) is the case that made this necessary: it names the brand-new cloud, and without
 * the gate that cloud lit up as "unread" the moment it was created.
 *
 * A push with NO type passes. The payload spec that defines `type` lives outside this repository,
 * and a chat push predating the field — or a sender that omits it — would otherwise never mark
 * anything. The background path applies the same rule by its own means: the native shells only
 * record a mark from a chat notification channel.
 */
export const isChatPush = (data: InAppPushData): boolean => {
    const type = typeof data.type === 'string' ? data.type.trim() : '';
    return type === '' || type === CHAT_PUSH_TYPE;
};
