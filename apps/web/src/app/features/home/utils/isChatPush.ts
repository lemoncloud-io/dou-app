import type { InAppPushData } from '../../../utils/resolveInAppPushRoute';

const CHAT_PUSH_TYPE = 'chat';

export const isChatPush = (data: InAppPushData): boolean => {
    const type = typeof data.type === 'string' ? data.type.trim() : '';
    return type === '' || type === CHAT_PUSH_TYPE;
};
