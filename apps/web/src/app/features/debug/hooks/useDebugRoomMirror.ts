import { useEffect } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { getDebugObservation, publishDebugObservation, type DebugRoomSurface } from '../overlay/sharedObservationStore';
import { useDebugMode } from './useDebugMode';

export interface DebugRoomMirrorInput {
    channelId: string | undefined;
    channel: DomainChannel | null | undefined;
    /** The list the bubbles are drawn from. */
    rendered: readonly DomainChat[];
    /** The feed window before the page's own filter. */
    rows: readonly DomainChat[];
    /** The message the action sheet is open on, if any. */
    focused: DomainChat | null | undefined;
}

/**
 * Publishes an open room or thread into the debug overlay's mirror, so the Room screen can show the
 * channel and messages the page is actually holding — the same objects, not a second read of the
 * cache, which could disagree with the screen in exactly the case being traced.
 *
 * Locked debug mode costs reading the debug-mode flag: every effect returns before touching the mirror. A
 * long-press sets the focus, and the focus outlives the action sheet so the inspector can still be
 * pointed at the message after the sheet is dismissed.
 */
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

    // Leaving the page (or locking debug mode) takes the slot and its focus down — but only while the
    // slot is still this page's, so a cleanup that runs after the next page published cannot wipe it.
    useEffect(() => {
        if (!isEnabled) return;
        return () => {
            if (getDebugObservation().room?.surface !== surface) return;
            publishDebugObservation({ room: null, roomFocus: null });
        };
    }, [isEnabled, surface]);
};
