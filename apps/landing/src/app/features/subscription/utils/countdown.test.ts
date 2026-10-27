import { formatMinutesSeconds, formatTimeOfDay, secondsUntil } from './countdown';

describe('countdown', () => {
    it('counts whole seconds up to an instant and stops at zero', () => {
        const now = Date.parse('2026-11-01T03:00:00.000Z');
        expect(secondsUntil('2026-11-01T03:05:00.000Z', now)).toBe(300);
        expect(secondsUntil('2026-11-01T03:00:00.400Z', now)).toBe(1);
        expect(secondsUntil('2026-11-01T02:59:00.000Z', now)).toBe(0);
    });

    it('prints minutes and seconds', () => {
        expect(formatMinutesSeconds(282)).toBe('04:42');
        expect(formatMinutesSeconds(0)).toBe('00:00');
    });

    it('prints the local time of day', () => {
        expect(formatTimeOfDay(new Date(2026, 10, 1, 14, 5).toISOString())).toBe('14:05');
    });
});
