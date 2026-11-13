import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { useActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { readCursorOf, readPositionOf } from '../../../utils/countUnread';
import { useNotificationStore } from '../stores/useNotificationStore';

/**
 * Follows every room's read cursor in the active cloud into the inbox: when a cursor moves ahead,
 * the room's items up to it are read (`markChannelReadUpTo`). Reading a room here, or on another
 * device through the synced cursor, clears its items without opening each one.
 *
 * The cursor is the one the unread badges count from — my join row or the channel's embedded copy,
 * whichever is further along. Only a move ahead is applied, once: an item an undo turned back to
 * unread stays unread until the reader reads further.
 */
export const useNotificationReadSync = (): void => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId || RELAY_CLOUD_ID;
    const { channels, myJoins } = useActiveCloudData();
    const markChannelReadUpTo = useNotificationStore(state => state.markChannelReadUpTo);

    // The cursor last applied, per cloud and room.
    const applied = useRef(new Map<string, number>());

    useEffect(() => {
        for (const channel of channels) {
            if (!channel.id || channel.cid !== cloudId) continue;
            const cursor = readCursorOf(readPositionOf(myJoins.get(channel.id), channel.$join));
            if (!cursor) continue;
            const key = `${cloudId}:${channel.id}`;
            if ((applied.current.get(key) ?? 0) >= cursor) continue;
            applied.current.set(key, cursor);
            markChannelReadUpTo(cloudId, channel.id, cursor);
        }
    }, [channels, myJoins, cloudId, markChannelReadUpTo]);
};
