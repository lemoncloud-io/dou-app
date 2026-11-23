import { useMemo } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/runtime';

import { isViewerId, resolveDisplay, useAuthorNames, useSiteProfileMap, viewerPlaceProfile } from '../../../shared';
import { useMessageViewer } from '../hooks/useMessageViewer';
import { buildMessageRows, foldReactions } from '../utils';
import { MessageRow } from './MessageRow';

interface ThreadCardMessagesProps {
    channel: DomainChannel;
    messages: DomainChat[];
    onRetry: (message: DomainChat) => void;
    onDiscard: (message: DomainChat) => void;
    hideSavedMark?: boolean;
    reactionEvents?: DomainChat[];
}

export const ThreadCardMessages = ({
    channel,
    messages,
    onRetry,
    onDiscard,
    hideSavedMark,
    reactionEvents,
}: ThreadCardMessagesProps) => {
    const viewer = useMessageViewer(channel);
    const placeProfiles = useSiteProfileMap();
    const ownerIds = useMemo(() => messages.map(message => message.ownerId), [messages]);
    const names = useAuthorNames(ownerIds);
    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, 0, false, placeProfiles),
        [messages, viewer, names, placeProfiles]
    );
    const reactions = useMemo(
        () => (reactionEvents ? foldReactions(reactionEvents, viewer) : undefined),
        [reactionEvents, viewer]
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
        <div className="flex flex-col gap-1 [container-type:inline-size]">
            {rows.map(row =>
                row.kind === 'group' ? (
                    <MessageRow
                        key={row.group.key}
                        group={row.group}
                        reactions={reactions}
                        onRetry={onRetry}
                        onDiscard={onDiscard}
                        reactorName={reactorName}
                        withDayInTime
                        hideSavedMark={hideSavedMark}
                    />
                ) : null
            )}
        </div>
    );
};
