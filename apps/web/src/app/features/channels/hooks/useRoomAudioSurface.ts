import { useEffect } from 'react';

import { hiddenMediaKey, useHiddenMedia } from '../lib/localMediaPrefs';
import { useRoomAudioStore } from '../stores/roomAudioStore';

interface RoomAudioSurfaceInput {
    cid?: string;
    uid?: string;
    channelId: string;
    messages: ReadonlyArray<{ id?: string; hidden?: boolean }>;
}

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
