import { useEffect } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/runtime-react';

import { getDebugObservation, publishDebugObservation, type DebugRoomSurface } from '../overlay/sharedObservationStore';
import { useDebugMode } from './useDebugMode';

export interface DebugRoomMirrorInput {
    channelId: string | undefined;
    channel: DomainChannel | null | undefined;
    rendered: readonly DomainChat[];
    rows: readonly DomainChat[];
    focused: DomainChat | null | undefined;
}

export const useDebugRoomMirror = (
    surface: DebugRoomSurface,
    { channelId, channel, rendered, rows, focused }: DebugRoomMirrorInput
) => {
    const { isEnabled } = useDebugMode();
    const focusedId = focused?.id;

    useEffect(() => {
        if (!isEnabled || !channelId) return;
        publishDebugObservation({ room: { surface, channelId, channel: channel ?? null, rendered, rows } });
    }, [isEnabled, surface, channelId, channel, rendered, rows]);

    useEffect(() => {
        if (!isEnabled || !channelId || !focusedId) return;
        publishDebugObservation({ roomFocus: { surface, channelId, messageId: focusedId } });
    }, [isEnabled, surface, channelId, focusedId]);

    useEffect(() => {
        if (!isEnabled) return;
        return () => {
            if (getDebugObservation().room?.surface !== surface) return;
            publishDebugObservation({ room: null, roomFocus: null });
        };
    }, [isEnabled, surface]);
};
