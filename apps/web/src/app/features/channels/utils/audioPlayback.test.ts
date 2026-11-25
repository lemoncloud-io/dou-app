import type { ChatFileSlot } from '@chatic/runtime-react';

import { audioTrackOf, canPlayAudioType, isVoiceMessageName, resetAudioTypeProbe } from './audioPlayback';

describe('isVoiceMessageName', () => {
    it('recognises the name a recording made in the app carries', () => {
        expect(isVoiceMessageName('voice-20261102-101500.m4a')).toBe(true);
    });

    it('does not take any other file for a voice message', () => {
        expect(isVoiceMessageName('voice-memo.m4a')).toBe(false);
        expect(isVoiceMessageName('song.mp3')).toBe(false);
        expect(isVoiceMessageName(undefined)).toBe(false);
    });
});

describe('canPlayAudioType', () => {
    let canPlay: jest.SpyInstance;

    beforeEach(() => {
        resetAudioTypeProbe();
        canPlay = jest.spyOn(HTMLMediaElement.prototype, 'canPlayType');
    });

    afterEach(() => {
        canPlay.mockRestore();
        resetAudioTypeProbe();
    });

    it('gives a file with no type the benefit of the doubt', () => {
        canPlay.mockReturnValue('');
        expect(canPlayAudioType(undefined)).toBe(true);
        expect(canPlay).not.toHaveBeenCalled();
    });

    it('says no when the platform cannot play the type', () => {
        canPlay.mockReturnValue('');
        expect(canPlayAudioType('audio/ogg')).toBe(false);
    });

    it('says yes when the platform may play the type', () => {
        canPlay.mockReturnValue('maybe');
        expect(canPlayAudioType('audio/mp4')).toBe(true);
        expect(canPlay).toHaveBeenCalledWith('audio/mp4');
    });
});

describe('audioTrackOf', () => {
    const message = { cid: 'c1', channelId: 'ch-1', chatId: 'ch-1:7', chatNo: 7 };
    const slot = (over: Partial<ChatFileSlot> = {}): ChatFileSlot => ({
        key: 'c1/up-1',
        uploadId: 'up-1',
        name: 'memo.m4a',
        size: 1234,
        contentType: 'audio/mp4',
        url: 'https://cdn/memo.m4a',
        state: 'ready',
        audio: true,
        ...over,
    });

    it('builds the track for a sent, playable slot', () => {
        expect(audioTrackOf(message, slot(), 2)).toEqual({
            key: 'c1/up-1',
            cid: 'c1',
            channelId: 'ch-1',
            chatId: 'ch-1:7',
            chatNo: 7,
            idx: 2,
            uploadId: 'up-1',
            url: 'https://cdn/memo.m4a',
            name: 'memo.m4a',
            size: 1234,
        });
    });

    it('carries the sender, the time and the thread when the message has them', () => {
        const track = audioTrackOf(
            { ...message, senderName: 'Kim', sentAt: 1_700_000_000_000, threadRootNo: '3' },
            slot(),
            0
        );
        expect(track).toMatchObject({ senderName: 'Kim', sentAt: 1_700_000_000_000, threadRootNo: '3' });
    });

    it('leaves out optional fields the slot and message do not have', () => {
        const track = audioTrackOf(message, slot({ uploadId: undefined, name: undefined, size: undefined }), 0);
        expect(track).toBeDefined();
        expect(track).not.toHaveProperty('uploadId');
        expect(track).not.toHaveProperty('name');
        expect(track).not.toHaveProperty('size');
        expect(track).not.toHaveProperty('senderName');
        expect(track).not.toHaveProperty('threadRootNo');
    });

    it('gives no track for a slot that is not ready yet', () => {
        expect(audioTrackOf(message, slot({ state: 'sending' }), 0)).toBeUndefined();
    });

    it('gives no track for a slot with no address', () => {
        expect(audioTrackOf(message, slot({ url: undefined }), 0)).toBeUndefined();
    });

    it('gives no track for a message with no number yet', () => {
        expect(audioTrackOf({ ...message, chatNo: 0 }, slot(), 0)).toBeUndefined();
    });
});
