import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';
import { isPendingUploadSlot } from '@chatic/data';

import type { AudioTrack } from '../stores/roomAudioStore';

/**
 * Reads a track's message again and returns the signed address the server now gives its upload — for
 * a file that failed to play because its address expired. `undefined` when the read fails or the slot
 * has no address.
 */
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
