import { useCallback } from 'react';

import { runtime, isPendingUploadSlot } from '@chatic/runtime';

import type { AudioTrack } from '../stores/roomAudioStore';

export const useFreshAudioAddress = () =>
    useCallback(async (track: AudioTrack): Promise<string | undefined> => {
        try {
            const chat = await runtime.data.getCloudRepositories(track.cid).chat.getChat({ id: track.chatId });
            const slot = chat.upload$$?.[track.idx];
            return slot && !isPendingUploadSlot(slot) ? (slot.orgUrl ?? undefined) : undefined;
        } catch {
            return undefined;
        }
    }, []);
