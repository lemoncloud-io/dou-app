import { DEFAULT_RATE_LIMIT, parseSettings } from './settings';

describe('parseSettings', () => {
    it('a missing, broken or non-object input means tier read with the default limits', () => {
        for (const input of [undefined, null, '{ not json', 42, []]) {
            expect(parseSettings(input)).toEqual({ tier: 'read', allowRooms: [], rateLimit: DEFAULT_RATE_LIMIT });
        }
    });

    it('an unknown tier fails closed to off', () => {
        expect(parseSettings({ tier: 'root' }).tier).toBe('off');
        expect(parseSettings('{"tier":"root"}').tier).toBe('off');
    });

    it('reads the settings.json shape of dou-control', () => {
        const parsed = parseSettings(
            JSON.stringify({ tier: 'write', allowRooms: ['r1', 7], rateLimit: { perMinute: 2, perHour: -1 } })
        );
        expect(parsed).toEqual({
            tier: 'write',
            allowRooms: ['r1'],
            rateLimit: { perMinute: 2, perHour: DEFAULT_RATE_LIMIT.perHour },
        });
    });
});
