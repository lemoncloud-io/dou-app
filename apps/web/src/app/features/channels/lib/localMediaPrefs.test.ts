import { act, renderHook } from '@testing-library/react';

import { MemoryStore, type KeyValueStore } from '@chatic/storage';

import {
    hiddenMediaKey,
    hideMedia,
    readHiddenMedia,
    readWaveform,
    setLocalMediaPrefsStorage,
    unhideMedia,
    useHiddenMedia,
    WAVEFORM_CACHE_MAX,
    writeWaveform,
} from './localMediaPrefs';

const me = { cid: 'c1', uid: 'u1' };

describe('localMediaPrefs', () => {
    let store: MemoryStore;

    beforeEach(() => {
        store = new MemoryStore();
        setLocalMediaPrefsStorage(store);
    });

    afterAll(() => setLocalMediaPrefsStorage());

    it('keys an entry by room, message number and slot', () => {
        expect(hiddenMediaKey('ch-1', 42, 1)).toBe('ch-1:42:1');
    });

    it('hides and shows again, per cloud and account', () => {
        hideMedia(me, ['ch-1:1:0', 'ch-1:2:0']);
        expect([...readHiddenMedia(me)]).toEqual(['ch-1:1:0', 'ch-1:2:0']);
        expect(readHiddenMedia({ cid: 'c2', uid: 'u1' }).size).toBe(0);
        expect(readHiddenMedia({ cid: 'c1', uid: 'u9' }).size).toBe(0);

        unhideMedia(me, ['ch-1:1:0']);
        expect([...readHiddenMedia(me)]).toEqual(['ch-1:2:0']);
    });

    it('survives a new page: what was hidden is read back from the store', () => {
        hideMedia(me, ['ch-1:3:0']);
        setLocalMediaPrefsStorage(store);
        expect(readHiddenMedia(me).has('ch-1:3:0')).toBe(true);
    });

    it('reads garbage or a throwing store as nothing hidden, and keeps working', () => {
        store.set('dou.hiddenMedia:c1:u1', '{not json');
        expect(readHiddenMedia(me).size).toBe(0);

        const broken: KeyValueStore = {
            get: () => {
                throw new Error('blocked');
            },
            set: () => {
                throw new Error('blocked');
            },
            remove: () => undefined,
            clear: () => undefined,
            keys: () => [],
        };
        setLocalMediaPrefsStorage(broken);
        expect(() => hideMedia(me, ['ch-1:1:0'])).not.toThrow();
        expect(readHiddenMedia(me).size).toBe(0);
    });

    it('re-renders a reader on hide and undo', () => {
        const { result } = renderHook(() => useHiddenMedia(me));
        expect(result.current.size).toBe(0);
        act(() => hideMedia(me, ['ch-1:5:0']));
        expect(result.current.has('ch-1:5:0')).toBe(true);
        act(() => unhideMedia(me, ['ch-1:5:0']));
        expect(result.current.has('ch-1:5:0')).toBe(false);
    });

    it('reads no scope as nothing hidden', () => {
        hideMedia(me, ['ch-1:5:0']);
        const { result } = renderHook(() => useHiddenMedia(undefined));
        expect(result.current.size).toBe(0);
    });

    it('keeps a waveform or its decorative mark per upload', () => {
        writeWaveform(me, 'up-1', [0.1, 0.5, 1]);
        writeWaveform(me, 'up-2', 'decorative');
        expect(readWaveform(me, 'up-1')).toEqual([0.1, 0.5, 1]);
        expect(readWaveform(me, 'up-2')).toBe('decorative');
        expect(readWaveform(me, 'up-3')).toBeUndefined();
        expect(readWaveform({ cid: 'c2', uid: 'u1' }, 'up-1')).toBeUndefined();
    });

    it('drops the least recently used waveform past the cap', () => {
        for (let n = 0; n < WAVEFORM_CACHE_MAX; n += 1) writeWaveform(me, `up-${n}`, [0.5]);
        // Reading the oldest makes it the newest, so the next write drops the second oldest instead.
        expect(readWaveform(me, 'up-0')).toEqual([0.5]);
        writeWaveform(me, 'up-new', [0.2]);
        expect(readWaveform(me, 'up-0')).toEqual([0.5]);
        expect(readWaveform(me, 'up-1')).toBeUndefined();
        expect(readWaveform(me, 'up-new')).toEqual([0.2]);
    });

    it('ignores a stored waveform that is not bars in 0..1', () => {
        store.set('dou.waveforms:c1:u1', JSON.stringify({ order: ['up-1'], bars: { 'up-1': [2, 'x'] } }));
        expect(readWaveform(me, 'up-1')).toBeUndefined();
    });
});
