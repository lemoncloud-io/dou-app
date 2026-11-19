import { useEffect, useRef } from 'react';

import { type MessageJumpOrigin, useMessageJumpStore } from '../../../shared';
import type { HistoryDirection } from '../stores/useHistoryRequestStore';
import { useChannelHistoryStore } from '../stores/useChannelHistoryStore';
import { recordMove, stepHistory } from '../utils/channelHistory';
import type { ReaderLocation } from '../utils/jumpReturn';

interface ChannelHistoryInput {
    here: ReaderLocation;
    /**
     * The open room's display label, or null when the open place does not list it. A switch
     * replaces the list before it selects the room it lands on, so for that moment the selection
     * belongs to the place being left, not to `here`.
     */
    label: string | null;
    threadRootId: string | null;
    /**
     * An open is still on its way to its room (a pending landing after a place or cloud switch).
     * Rooms selected meanwhile are stops on the way, not places the reader went.
     */
    isLanding: () => boolean;
}

/** The first message in view, when the feed has already reported one for this room. */
const reportedAnchor = (channelId: string): number | null => {
    const position = useMessageJumpStore.getState().position;
    return position?.channelId === channelId ? position.chatNo : null;
};

/**
 * Records the rooms the reader moves between on home, and steps Back and Forward through them.
 *
 * It watches the open room rather than wrapping every way of opening one: the sidebar, the
 * switcher, the rails, the unread chord, a jump and a notification all end in the selection
 * changing, and a new door will too. When it changes, the room left goes on Back with where the
 * reader was in it. Its own steps do not record, and neither do the rooms an open passes through.
 *
 * `step` takes the next entry off the history and hands it back; the caller opens it.
 */
export const useChannelHistory = ({ here, label, threadRootId, isLanding }: ChannelHistoryInput) => {
    // Where the reader is, kept current, so a move can record where it left.
    const current = useRef<MessageJumpOrigin | null>(null);
    // The entry a step is opening. Its landing is the step, not a move.
    const stepping = useRef<MessageJumpOrigin | null>(null);

    // The feed reports the first message in view as it scrolls. Only a report for the tracked room
    // counts: the room being opened reports its own before this component's effects run.
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
        // A room the open place lists is in that place. One it does not list is still the room
        // being left while a switch lands, so its place is not taken from `here`.
        const listed = label !== null;
        const samePlace = at?.cloudId === here.cloudId && at?.placeId === here.placeId;
        // Still in the same room: keep its label and thread current. The self room is listed by
        // every place under one id, so moving between places on it is a move.
        if (at && at.channelId === channelId && (samePlace || !listed)) {
            if (at.threadRootId !== threadRootId || (label && at.label !== label)) {
                current.current = { ...at, threadRootId, label: label ?? at.label };
            }
            return;
        }
        // Nothing open, or a room the open place does not list yet: a switch is landing.
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
        // A step that landed. Any other room means the step was overtaken by a move of the reader's,
        // which records like any other.
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

    /**
     * Take one step; null when there is nowhere to go, or no room is open to come back to. The
     * caller opens the entry it returns.
     */
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
