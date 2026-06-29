import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useSessionIdentity } from '@chatic/web-core';

import { isPlaceholderName } from '../../../shared';
import type { MessageViewer } from '../utils';

/**
 * The signed-in viewer used to name own/optimistic messages. Shared by the chat
 * pane and thread panel so both identify "you" identically. A guest auto-name
 * (UUID) is dropped so own messages fall back to "You" rather than the raw id.
 */
export const useMessageViewer = (channel: DomainChannel | undefined): MessageViewer => {
    const identity = useSessionIdentity();
    const myUid = identity.userId;
    const rawMyName = identity.activeProfile?.$user?.name ?? '';
    const myName = isPlaceholderName(rawMyName) ? '' : rawMyName;
    const cloudUid = channel?.$join?.userId ?? null;
    return useMemo(() => ({ uid: myUid, name: myName, cloudUid }), [myUid, myName, cloudUid]);
};
