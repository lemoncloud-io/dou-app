import { useMemo } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { isViewerId, resolveDisplay, useAuthorNames, useSiteProfileMap, viewerPlaceProfile } from '../../../shared';
import { useMessageViewer } from '../hooks/useMessageViewer';
import { buildMessageRows } from '../utils';
import { MessageRow } from './MessageRow';

interface ThreadCardMessagesProps {
    channel: DomainChannel;
    messages: DomainChat[];
    onRetry: (message: DomainChat) => void;
    onDiscard: (message: DomainChat) => void;
}

/**
 * A Threads page card's messages, drawn by the thread panel's own row: the author by their place
 * nickname and avatar, images and files, and a failed send's Retry and Delete. Rows are grouped the way
 * the panel groups them, so consecutive messages from one person share a header.
 */
export const ThreadCardMessages = ({ channel, messages, onRetry, onDiscard }: ThreadCardMessagesProps) => {
    const viewer = useMessageViewer(channel);
    const placeProfiles = useSiteProfileMap();
    const ownerIds = useMemo(() => messages.map(message => message.ownerId), [messages]);
    const names = useAuthorNames(ownerIds);
    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, 0, false, placeProfiles),
        [messages, viewer, names, placeProfiles]
    );
    const reactorName = useMemo(
        () => (userId: string) => {
            const mine = isViewerId(userId, viewer);
            const place = mine ? viewerPlaceProfile(viewer, placeProfiles) : placeProfiles[userId];
            return resolveDisplay(place, mine ? viewer.name : (names.get(userId) ?? ''), undefined).name;
        },
        [names, placeProfiles, viewer]
    );

    return (
        // The card's column is the container the row toolbar's narrow rule measures (see MessageRow).
        <div className="flex flex-col gap-1 [container-type:inline-size]">
            {rows.map(row =>
                row.kind === 'group' ? (
                    <MessageRow
                        key={row.group.key}
                        group={row.group}
                        onRetry={onRetry}
                        onDiscard={onDiscard}
                        reactorName={reactorName}
                        withDayInTime
                    />
                ) : null
            )}
        </div>
    );
};
