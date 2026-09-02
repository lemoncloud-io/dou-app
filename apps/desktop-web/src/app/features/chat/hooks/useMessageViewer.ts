import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useSessionIdentity } from '@chatic/app-runtime';
import { useRuntimeProfile } from '@chatic/app-runtime';

import { isPlaceholderName } from '../../../shared';
import type { MessageViewer } from '../utils';

/**
 * The signed-in viewer used to name own/optimistic messages. Shared by the chat
 * pane and thread panel so both identify "you" identically. A guest auto-name
 * (UUID) is dropped so own messages fall back to "You" rather than the raw id.
 */
export const useMessageViewer = (channel: DomainChannel | undefined): MessageViewer => {
    const { userId: myUid } = useSessionIdentity();
    const { userName } = useRuntimeProfile();
    const myName = isPlaceholderName(userName) ? '' : userName;
    const cloudUid = channel?.$join?.userId ?? null;
    return useMemo(() => ({ uid: myUid, name: myName, cloudUid }), [myUid, myName, cloudUid]);
};
