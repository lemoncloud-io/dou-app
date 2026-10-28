import { setStorageAdapter } from '@chatic/shared';

import { cloudStore } from '../store/stores';
import { endPairedCloud, forgetRefusedPairedCloud, isRefusedForEndedPairing } from './pairedCloudRefusal';
import { pairedClouds } from './pairedClouds';

const store = new Map<string, string>();
setStorageAdapter({
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: key => void store.delete(key),
});

const refusal = (reason: string) =>
    Object.assign(new Error('Request failed with status code 403'), { response: { status: 403, data: reason } });
const refused = refusal('403 NOT ALLOWED - pairing revoked @doPostDelegateCloud(users/0)');

beforeEach(() => {
    store.clear();
    pairedClouds.add('1000002');
});

describe('endPairedCloud', () => {
    it("drops the cloud from the list and forgets the approver's uid recorded there", () => {
        cloudStore.setCloudIdentity('1000002', { uid: 'approver' });
        cloudStore.setCloudIdentity('1000009', { uid: 'mine' });

        endPairedCloud('1000002');

        expect(pairedClouds.list()).toEqual([]);
        expect(cloudStore.getCloudIdentities()).toEqual({ '1000009': { uid: 'mine' } });
    });
});

describe('forgetRefusedPairedCloud', () => {
    it('drops a paired cloud the relay refused to delegate, with its recorded uid', () => {
        cloudStore.setCloudIdentity('1000002', { uid: 'approver' });

        expect(forgetRefusedPairedCloud('1000002', refused)).toBe(true);
        expect(pairedClouds.list()).toEqual([]);
        expect(cloudStore.getCloudIdentity('1000002')).toBeNull();
    });

    it.each([
        ['a network error', new Error('Network Error')],
        ['a server error', Object.assign(new Error('502'), { response: { status: 502 } })],
        [
            'a 403 that says nothing of the pairing (stale relay credentials)',
            refusal('The security token included in the request is expired'),
        ],
    ])('keeps it after %s', (_label, error) => {
        expect(forgetRefusedPairedCloud('1000002', error)).toBe(false);
        expect(pairedClouds.list()).toEqual(['1000002']);
    });

    it('leaves a cloud that was never paired alone', () => {
        expect(forgetRefusedPairedCloud('1000004', refused)).toBe(false);
    });
});

describe('isRefusedForEndedPairing', () => {
    it.each([
        '403 NOT ALLOWED - pairing revoked @doPostDelegateCloud(users/0)',
        '403 NOT ALLOWED - pairing not found @doPostDelegateCloud(users/0)',
        '403 NOT ALLOWED - approver session revoked @doPostDelegateCloud(users/0)',
        '403 NOT ALLOWED - approver banned @doPostDelegateCloud(users/0)',
    ])('recognises the relay refusing over an ended pairing: %s', reason => {
        expect(isRefusedForEndedPairing(refusal(reason))).toBe(true);
    });

    it.each([
        ['another 403', refusal('403 NOT ALLOWED - not a member')],
        ['a 403 for stale relay credentials', refusal('The security token included in the request is expired')],
        [
            'the same words on another status',
            Object.assign(new Error('pairing revoked'), { response: { status: 400 } }),
        ],
        ['a network error', new Error('Network Error')],
    ])('is false for %s', (_label, error) => {
        expect(isRefusedForEndedPairing(error)).toBe(false);
    });
});
