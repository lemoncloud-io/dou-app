import { formatPairingCode, formatRemaining } from './pairingCode';

describe('formatPairingCode', () => {
    it('splits eight digits into two groups of four', () => {
        expect(formatPairingCode('07344168')).toBe('0734-4168');
    });

    it('leaves anything else as it is', () => {
        expect(formatPairingCode('1234')).toBe('1234');
    });
});

describe('formatRemaining', () => {
    it.each([
        [180_000, '3:00'],
        [61_500, '1:02'],
        [9_000, '0:09'],
        [-5_000, '0:00'],
    ])('shows %i ms as %s', (ms, text) => {
        expect(formatRemaining(ms)).toBe(text);
    });
});
