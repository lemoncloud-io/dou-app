import { pairingClouds, pairingTargetOptions } from './pairingTargets';

const clouds = [
    { id: '1000002', name: 'Lemon' },
    { id: '1000004', name: '' },
];

describe('pairingTargetOptions', () => {
    it('offers my account first, then each cloud, and starts on my account on the relay', () => {
        const { options, defaultKey } = pairingTargetOptions({ isRelayGuest: false, clouds, activeCloudId: null });

        expect(options).toEqual([
            { key: 'relay', target: { type: 'relay' } },
            { key: '1000002', target: { type: 'cloud', cloudId: '1000002' }, cloudName: 'Lemon' },
            { key: '1000004', target: { type: 'cloud', cloudId: '1000004' }, cloudName: '1000004' },
        ]);
        expect(defaultKey).toBe('relay');
    });

    it('starts on the cloud the account is working in', () => {
        expect(pairingTargetOptions({ isRelayGuest: false, clouds, activeCloudId: '1000004' }).defaultKey).toBe(
            '1000004'
        );
    });

    it('offers no relay option to a guest', () => {
        const { options, defaultKey } = pairingTargetOptions({ isRelayGuest: true, clouds, activeCloudId: 'default' });

        expect(options.map(option => option.key)).toEqual(['1000002', '1000004']);
        expect(defaultKey).toBe('1000002');
    });

    it('has nothing to offer a guest with no clouds', () => {
        expect(pairingTargetOptions({ isRelayGuest: true, clouds: [], activeCloudId: null })).toEqual({
            options: [],
            defaultKey: null,
        });
    });
});

describe('pairingClouds', () => {
    it('lists the owned clouds first, then the invited ones', () => {
        expect(pairingClouds([{ id: '1000002', name: 'Lemon' }], [{ id: '1000009', name: 'Lime' }])).toEqual([
            { id: '1000002', name: 'Lemon' },
            { id: '1000009', name: 'Lime' },
        ]);
    });

    it('keeps a cloud that is both owned and invited once, as owned', () => {
        expect(pairingClouds([{ id: '1000002', name: 'Lemon' }], [{ id: '1000002', name: 'Old name' }])).toEqual([
            { id: '1000002', name: 'Lemon' },
        ]);
    });

    it('offers the invited clouds alone when the catalog has none', () => {
        expect(pairingClouds([], [{ id: '1000009', name: 'Lime' }])).toEqual([{ id: '1000009', name: 'Lime' }]);
    });
});
