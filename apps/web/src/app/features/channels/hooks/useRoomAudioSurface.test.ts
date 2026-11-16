import { act, renderHook } from '@testing-library/react';

import { MemoryStore } from '@chatic/storage';

import { hideMedia, setLocalMediaPrefsStorage } from '../lib/localMediaPrefs';
import { resetRoomAudioStore, useRoomAudioStore, type AudioTrack } from '../stores/roomAudioStore';
import { useRoomAudioSurface } from './useRoomAudioSurface';

const me = { cid: 'c1', uid: 'u1' };

const track = (over: Partial<AudioTrack> = {}): AudioTrack => ({
    key: 'c1/up-7',
    cid: 'c1',
    channelId: 'ch-1',
    chatId: 'ch-1:7',
    chatNo: 7,
    idx: 0,
    url: 'https://cdn/7.m4a',
    ...over,
});

/** Puts `playing` in the store as the loaded track, as a press on its bubble would. */
const load = (playing: AudioTrack) => useRoomAudioStore.setState({ current: playing, status: 'playing', position: 3 });

type Messages = ReadonlyArray<{ id?: string; hidden?: boolean }>;
const renderSurface = (messages: Messages = [], channelId = 'ch-1') =>
    renderHook(({ rows }: { rows: Messages }) => useRoomAudioSurface({ ...me, channelId, messages: rows }), {
        initialProps: { rows: messages },
    });

describe('useRoomAudioSurface', () => {
    beforeEach(() => {
        setLocalMediaPrefsStorage(new MemoryStore());
        resetRoomAudioStore();
    });

    afterAll(() => setLocalMediaPrefsStorage());

    it('returns the keys hidden on this device for the cloud and account', () => {
        hideMedia(me, ['ch-1:3:0']);
        hideMedia({ cid: 'c2', uid: 'u1' }, ['ch-1:4:0']);
        const { result } = renderSurface();

        expect([...result.current.hiddenMedia]).toEqual(['ch-1:3:0']);
    });

    it('reads nothing hidden before the account is known', () => {
        hideMedia(me, ['ch-1:3:0']);
        const { result } = renderHook(() => useRoomAudioSurface({ cid: 'c1', channelId: 'ch-1', messages: [] }));

        expect(result.current.hiddenMedia.size).toBe(0);
    });

    it('keeps playing while nothing about the track changes', () => {
        load(track());
        renderSurface([{ id: 'ch-1:7' }]);

        expect(useRoomAudioStore.getState().current?.key).toBe('c1/up-7');
    });

    it('stops when the playing file is hidden on this device', () => {
        load(track());
        renderSurface();

        act(() => hideMedia(me, ['ch-1:7:0']));

        expect(useRoomAudioStore.getState().current).toBeNull();
    });

    it('stops when the playing message is deleted', () => {
        load(track());
        const { rerender } = renderSurface([{ id: 'ch-1:7' }]);

        rerender({ rows: [{ id: 'ch-1:7', hidden: true }] });

        expect(useRoomAudioStore.getState().current).toBeNull();
    });

    it('leaves another channel’s track alone', () => {
        load(track({ channelId: 'ch-2', chatId: 'ch-2:7' }));
        hideMedia(me, ['ch-1:7:0', 'ch-2:7:0']);
        renderSurface([{ id: 'ch-2:7', hidden: true }]);

        expect(useRoomAudioStore.getState().current?.channelId).toBe('ch-2');
    });
});
