import { setStorageAdapter } from '@chatic/shared';

import { forgetRefusedPairedCloud } from './pairedCloudRefusal';
import { pairedClouds } from './pairedClouds';

const store = new Map<string, string>();
setStorageAdapter({
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: key => void store.delete(key),
});

const refused = Object.assign(new Error('403'), { response: { status: 403 } });

beforeEach(() => {
    store.clear();
    pairedClouds.add('1000002');
});

describe('forgetRefusedPairedCloud', () => {
    it('drops a paired cloud the relay refused to delegate', () => {
        expect(forgetRefusedPairedCloud('1000002', refused)).toBe(true);
        expect(pairedClouds.list()).toEqual([]);
    });

    it.each([
        ['a network error', new Error('Network Error')],
        ['a server error', Object.assign(new Error('502'), { response: { status: 502 } })],
    ])('keeps it after %s', (_label, error) => {
        expect(forgetRefusedPairedCloud('1000002', error)).toBe(false);
        expect(pairedClouds.list()).toEqual(['1000002']);
    });

    it('leaves a cloud that was never paired alone', () => {
        expect(forgetRefusedPairedCloud('1000004', refused)).toBe(false);
    });
});
