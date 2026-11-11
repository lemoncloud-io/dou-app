import { describe, expect, it } from 'vitest';

import { pairingTargetOptions } from './pairingTargets';

const clouds = [
    { id: 'c1', name: 'Team' },
    { id: 'c2', name: '' },
];

describe('pairingTargetOptions', () => {
    it('offers the whole account first, then one option per cloud, naming a nameless cloud by its id', () => {
        const { options } = pairingTargetOptions({ isRelayGuest: false, clouds, activeCloudId: null });

        expect(options).toEqual([
            { key: 'relay', target: { type: 'relay' } },
            { key: 'c1', target: { type: 'cloud', cloudId: 'c1' }, cloudName: 'Team' },
            { key: 'c2', target: { type: 'cloud', cloudId: 'c2' }, cloudName: 'c2' },
        ]);
    });

    it('leaves the whole account out for a guest, whose relay session the relay will not delegate', () => {
        const { options, defaultKey } = pairingTargetOptions({ isRelayGuest: true, clouds, activeCloudId: null });

        expect(options.map(option => option.key)).toEqual(['c1', 'c2']);
        expect(defaultKey).toBe('c1');
    });

    it('starts on the active cloud', () => {
        expect(pairingTargetOptions({ isRelayGuest: false, clouds, activeCloudId: 'c2' }).defaultKey).toBe('c2');
    });

    it('starts on the whole account on the relay, and when the active cloud is not offered', () => {
        expect(pairingTargetOptions({ isRelayGuest: false, clouds, activeCloudId: null }).defaultKey).toBe('relay');
        expect(pairingTargetOptions({ isRelayGuest: false, clouds, activeCloudId: 'joined' }).defaultKey).toBe('relay');
    });

    it('has nothing to offer a guest without clouds', () => {
        expect(pairingTargetOptions({ isRelayGuest: true, clouds: [], activeCloudId: null })).toEqual({
            options: [],
            defaultKey: null,
        });
    });

    it('skips a catalog row without an id', () => {
        const { options } = pairingTargetOptions({ isRelayGuest: true, clouds: [{ name: 'x' }], activeCloudId: null });

        expect(options).toEqual([]);
    });
});
