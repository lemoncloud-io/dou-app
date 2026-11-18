import type { ChatFileSlot } from '@chatic/runtime';

import type { AudioTrack } from '../stores/roomAudioStore';

/** The name a recording made in the app carries: `voice-<yyyyMMdd-HHmmss>.m4a`. */
const VOICE_NAME = /^voice-\d{8}-\d{6}\.m4a$/i;

/** Whether an upload looks like a voice message recorded in the app. Nothing else marks one. */
export const isVoiceMessageName = (name: string | undefined): boolean => !!name && VOICE_NAME.test(name);

let probe: HTMLAudioElement | null | undefined;

/**
 * Whether this system's player says it may play `contentType`. Asked of the element itself, so the
 * answer is the platform's — iOS answers no for Ogg Vorbis, a browser yes. An unknown type, or a page
 * with no audio element at all, is given the benefit of the doubt: a failed play still lands as an
 * error and marks the file then.
 */
export const canPlayAudioType = (contentType: string | undefined): boolean => {
    if (!contentType) return true;
    if (probe === undefined) {
        try {
            probe = typeof document === 'undefined' ? null : document.createElement('audio');
        } catch {
            probe = null;
        }
    }
    if (!probe || typeof probe.canPlayType !== 'function') return true;
    return probe.canPlayType(contentType) !== '';
};

/** Test seam: forget the probe element. */
export const resetAudioTypeProbe = (): void => {
    probe = undefined;
};

export interface AudioMessageInfo {
    cid: string;
    channelId: string;
    chatId: string;
    chatNo: number;
    senderName?: string;
    sentAt?: number;
    threadRootNo?: string;
}

/** The player's track for a sent audio slot, or none for a slot that cannot be played from here. */
export const audioTrackOf = (message: AudioMessageInfo, file: ChatFileSlot, idx: number): AudioTrack | undefined => {
    if (!file.url || file.state !== 'ready' || !message.chatNo) return undefined;
    return {
        key: file.key,
        cid: message.cid,
        channelId: message.channelId,
        chatId: message.chatId,
        chatNo: message.chatNo,
        idx,
        ...(file.uploadId ? { uploadId: file.uploadId } : {}),
        url: file.url,
        ...(file.name ? { name: file.name } : {}),
        ...(file.size !== undefined ? { size: file.size } : {}),
        ...(message.senderName ? { senderName: message.senderName } : {}),
        ...(message.sentAt !== undefined ? { sentAt: message.sentAt } : {}),
        ...(message.threadRootNo ? { threadRootNo: message.threadRootNo } : {}),
    };
};
