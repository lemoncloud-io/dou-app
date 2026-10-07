import { isCloudEnterable, needsCloudAttention, resolveCloudRowState } from './cloudRowState';

describe('resolveCloudRowState — one row state per relay status', () => {
    it.each([
        ['init', 'provisioning'],
        ['reserved', 'provisioning'],
        ['error', 'setupFailed'],
        ['suspended', 'restricted'],
        ['expired', 'released'],
        ['active', 'ready'],
    ] as const)('maps status %s to %s', (status, expected) => {
        expect(resolveCloudRowState({ status })).toBe(expected);
    });

    it('reads a drop mark on an active cloud as scheduled to end', () => {
        expect(resolveCloudRowState({ status: 'active', state$: { plan: 'drop' } })).toBe('dropScheduled');
    });

    it('lets a hold outrank a drop mark the cloud also carries', () => {
        // After the downgrade lands, the relay holds the marked cloud and leaves the mark in place.
        expect(resolveCloudRowState({ status: 'suspended', state$: { hold: 'downgrade', plan: 'drop' } })).toBe(
            'restricted'
        );
    });

    it('ignores a cleared mark', () => {
        expect(resolveCloudRowState({ status: 'active', state$: { plan: '' } })).toBe('ready');
    });

    it('treats a missing status as ready rather than inventing a problem', () => {
        expect(resolveCloudRowState({})).toBe('ready');
    });
});

describe('isCloudEnterable', () => {
    it('enters a ready cloud and one scheduled to end — both still have a live session', () => {
        expect(isCloudEnterable('ready')).toBe(true);
        expect(isCloudEnterable('dropScheduled')).toBe(true);
    });

    it('refuses every other state', () => {
        expect(isCloudEnterable('provisioning')).toBe(false);
        expect(isCloudEnterable('setupFailed')).toBe(false);
        expect(isCloudEnterable('restricted')).toBe(false);
        expect(isCloudEnterable('released')).toBe(false);
    });
});

describe('needsCloudAttention', () => {
    it('asks for attention on the three states cloud management can explain', () => {
        expect(needsCloudAttention('setupFailed')).toBe(true);
        expect(needsCloudAttention('dropScheduled')).toBe(true);
        expect(needsCloudAttention('restricted')).toBe(true);
    });

    it('leaves a provisioning row alone — waiting is the only action', () => {
        expect(needsCloudAttention('provisioning')).toBe(false);
        expect(needsCloudAttention('ready')).toBe(false);
    });
});
