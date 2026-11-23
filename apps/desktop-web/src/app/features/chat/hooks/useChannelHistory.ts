import { useEffect, useRef } from 'react';

import { type MessageJumpOrigin, useMessageJumpStore } from '../../../shared';
import type { HistoryDirection } from '../stores/useHistoryRequestStore';
import { useChannelHistoryStore } from '../stores/useChannelHistoryStore';
import { recordMove, stepHistory } from '../utils/channelHistory';
import type { ReaderLocation } from '../utils/jumpReturn';

interface ChannelHistoryInput {
    here: ReaderLocation;
    label: string | null;
    threadRootId: string | null;
    isLanding: () => boolean;
}

const reportedAnchor = (channelId: string): number | null => {
    const position = useMessageJumpStore.getState().position;
    return position?.channelId === channelId ? position.chatNo : null;
};

export const useChannelHistory = ({ here, label, threadRootId, isLanding }: ChannelHistoryInput) => {
    const current = useRef<MessageJumpOrigin | null>(null);
    const stepping = useRef<MessageJumpOrigin | null>(null);

    useEffect(
        () =>
            useMessageJumpStore.subscribe(state => {
                const at = current.current;
                const position = state.position;
                if (at && position && position.channelId === at.channelId && position.chatNo !== at.anchorChatNo) {
                    current.current = { ...at, anchorChatNo: position.chatNo };
                }
            }),
        []
    );

    useEffect(() => {
        const at = current.current;
        const { channelId } = here;
        const listed = label !== null;
        const samePlace = at?.cloudId === here.cloudId && at?.placeId === here.placeId;
        if (at && at.channelId === channelId && (samePlace || !listed)) {
            if (at.threadRootId !== threadRootId || (label && at.label !== label)) {
                current.current = { ...at, threadRootId, label: label ?? at.label };
            }
            return;
        }
        if (!channelId || !listed || isLanding()) return;
        const entering: MessageJumpOrigin = {
            cloudId: here.cloudId,
            placeId: here.placeId,
            channelId,
            label,
            anchorChatNo: reportedAnchor(channelId),
            threadRootId,
            sameChannel: false,
        };
        const step = stepping.current;
        stepping.current = null;
        if (step && step.channelId === channelId) {
            current.current = entering;
            return;
        }
        if (at) {
            const store = useChannelHistoryStore.getState();
            store.set(recordMove(store, at));
        }
        current.current = entering;
    });

    const step = (
        direction: HistoryDirection,
        reachable: (entry: MessageJumpOrigin) => boolean
    ): MessageJumpOrigin | null => {
        if (!current.current) return null;
        const store = useChannelHistoryStore.getState();
        const result = stepHistory(store, direction, current.current, reachable);
        if (!result) return null;
        store.set(result.history);
        stepping.current = result.target;
        return result.target;
    };

    return { step };
};
