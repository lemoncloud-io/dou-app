import { useMemo, type ReactNode } from 'react';

import { useSessionSelection } from '@chatic/web-core';

import { OtherCloudUnreadContext, type OtherCloudUnreadValue } from './otherCloudUnreadContext';
import { useOtherCloudUnreadSource } from './useOtherCloudUnread';

/**
 * Single owner of the inactive-clouds unread read (see {@link OtherCloudUnreadContext}).
 *
 * The active cloud id comes from the session here rather than from a prop, so the two consumers
 * cannot disagree about which cloud is excluded — that exclusion is what keeps the active cloud from
 * being counted twice (once live, once from the staler cache).
 */
export const OtherCloudUnreadProvider = ({ children }: { children: ReactNode }) => {
    const { selectedCloudId } = useSessionSelection();
    const { byCloud, total, refresh } = useOtherCloudUnreadSource(selectedCloudId);

    // Held stable so an unrelated re-render of this provider (its catalog/invited-cloud inputs
    // re-render on their own) does not re-render every consumer.
    const value = useMemo<OtherCloudUnreadValue>(() => ({ byCloud, total, refresh }), [byCloud, total, refresh]);

    return <OtherCloudUnreadContext.Provider value={value}>{children}</OtherCloudUnreadContext.Provider>;
};
