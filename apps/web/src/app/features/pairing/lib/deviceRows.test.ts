import type { PairingListItem } from '@chatic/http';

import { approvedPairingRows, deviceKindKey } from './deviceRows';

const item = (over: Partial<PairingListItem>): PairingListItem => ({
    pairingId: 'p',
    purpose: 'web',
    client: {},
    target: { type: 'relay' },
    status: 'approved',
    ...over,
});

describe('deviceKindKey', () => {
    it.each([
        ['mobile', 'pairing.devices.kind.mobile'],
        ['web', 'pairing.devices.kind.web'],
        ['', 'pairing.devices.kind.unknown'],
        [undefined, 'pairing.devices.kind.unknown'],
    ])('%j → %s', (kind, key) => {
        expect(deviceKindKey(kind)).toBe(key);
    });
});

describe('approvedPairingRows', () => {
    it('keeps standing approvals only, newest first', () => {
        const rows = approvedPairingRows([
            item({ pairingId: 'old', approvedAt: 1, claimedAt: 2 }),
            item({ pairingId: 'revoked', status: 'revoked', approvedAt: 9 }),
            item({ pairingId: 'new', approvedAt: 5, claimedAt: 6 }),
        ]);

        expect(rows.map(row => row.pairingId)).toEqual(['new', 'old']);
    });

    it('flags an unclaimed relay approval, never a cloud one', () => {
        const rows = approvedPairingRows([
            item({ pairingId: 'relay', approvedAt: 2 }),
            item({ pairingId: 'cloud', approvedAt: 1, target: { type: 'cloud', cloudId: '1000002' } }),
        ]);

        expect(rows.map(row => [row.pairingId, row.unclaimed])).toEqual([
            ['relay', true],
            ['cloud', false],
        ]);
    });
});
