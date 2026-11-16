import { useEffect } from 'react';

import { hiddenMediaKey, useHiddenMedia } from '../lib/localMediaPrefs';
import { useRoomAudioStore } from '../stores/roomAudioStore';

interface RoomAudioSurfaceInput {
    cid?: string;
    /** My uid in the room's cloud — hiding is kept per cloud and account. */
    uid?: string;
    channelId: string;
    /** The rows this surface draws, to notice the playing message being deleted. */
    messages: ReadonlyArray<{ id?: string; hidden?: boolean }>;
}

/**
 * What a room or thread screen needs around the room's audio: the items hidden on this device (the rows
 * leave them out), and the rule that what plays stops when its message is deleted or its file hidden —
 * there is nothing left on screen to pause it from.
 */
export const useRoomAudioSurface = ({ cid, uid, channelId, messages }: RoomAudioSurfaceInput) => {
    const hiddenMedia = useHiddenMedia(cid && uid ? { cid, uid } : undefined);
    const current = useRoomAudioStore(state => state.current);

    useEffect(() => {
        if (!current || current.channelId !== channelId) return;
        const hiddenHere = hiddenMedia.has(hiddenMediaKey(channelId, current.chatNo, current.idx));
        const deleted = messages.some(message => message.id === current.chatId && message.hidden);
        if (hiddenHere || deleted) useRoomAudioStore.getState().stop();
    }, [current, channelId, hiddenMedia, messages]);

    return { hiddenMedia };
};
