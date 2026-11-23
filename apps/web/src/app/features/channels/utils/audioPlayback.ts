import type { ChatFileSlot } from '@chatic/runtime';

import type { AudioTrack } from '../stores/roomAudioStore';

const VOICE_NAME = /^voice-\d{8}-\d{6}\.m4a$/i;

export const isVoiceMessageName = (name: string | undefined): boolean => !!name && VOICE_NAME.test(name);

let probe: HTMLAudioElement | null | undefined;

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
