import { useEffect } from 'react';

import { isNative, webClient } from '@chatic/bridges';

/**
 * Mirror the unread total onto the OS dock/taskbar badge via the desktop shell's
 * SetBadgeCount handler. No-op in a plain browser (isNative() false) and on
 * shells that don't support it (the request is best-effort).
 */
export const useDesktopBadge = (count: number): void => {
    useEffect(() => {
        if (!isNative()) return;
        void webClient.request('SetBadgeCount', { count }).catch(() => undefined);
    }, [count]);
};
