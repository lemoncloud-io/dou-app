import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

import { isPlaceholderName } from '../../../shared';
import type { MessageViewer } from '../utils';

export const useMessageViewer = (channel: DomainChannel | undefined): MessageViewer => {
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const { userName, photo } = runtime.session.useRuntimeProfile();
    const myName = isPlaceholderName(userName) ? '' : userName;
    const cloudUid = channel?.$join?.userId ?? null;
    return useMemo(
        () => ({ uid: myUid, name: myName, cloudUid, photo: photo || undefined }),
        [myUid, myName, cloudUid, photo]
    );
};
