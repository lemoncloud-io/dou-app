import { authorize } from './gate';
import type { Action } from './gate';
import { createLimiter } from './limiter';
import type { Settings, Tier } from './settings';

const settings = (tier: Tier, rooms: string[] = ['r'], perMinute = 1): Settings => ({
    tier,
    allowRooms: rooms,
    rateLimit: { perMinute, perHour: 10 },
});

const write = (channelId: string): Action => ({ kind: 'write', channelId });

const codeOf = (config: Settings, action: Action, limiter = createLimiter(), now = 0): string | null =>
    authorize(config, action, limiter, now)?.code ?? null;

describe('the gate', () => {
    it('tier off refuses reads and writes', () => {
        expect(codeOf(settings('off'), { kind: 'read' })).toBe('tier_off');
        expect(codeOf(settings('off'), write('r'))).toBe('tier_off');
    });

    it('read tier refuses a write even in an allowed room, and allows reads', () => {
        expect(codeOf(settings('read'), write('r'))).toBe('tier_read_only');
        expect(codeOf(settings('read'), { kind: 'read' })).toBeNull();
        expect(codeOf(settings('read'), { kind: 'readRoom', channelId: 'r' })).toBeNull();
    });

    it('an unlisted room is refused for reading and for writing at every tier', () => {
        for (const tier of ['read', 'write', 'full'] as const) {
            expect(codeOf(settings(tier), { kind: 'readRoom', channelId: 'x' })).toBe('room_not_allowed');
        }
        expect(codeOf(settings('write'), write('x'))).toBe('room_not_allowed');
        expect(codeOf(settings('full'), write('x'))).toBe('room_not_allowed');
    });

    it('a refused write in an unlisted room does not spend the rate budget', () => {
        const limiter = createLimiter();
        expect(codeOf(settings('write'), write('x'), limiter)).toBe('room_not_allowed');
        expect(codeOf(settings('write'), write('r'), limiter)).toBeNull();
    });

    it('rate limit: the write over perMinute is refused and passes a minute later', () => {
        const limiter = createLimiter();
        expect(codeOf(settings('write'), write('r'), limiter, 0)).toBeNull();
        expect(codeOf(settings('write'), write('r'), limiter, 1000)).toBe('rate_limited');
        expect(codeOf(settings('write'), write('r'), limiter, 60_001)).toBeNull();
    });

    it('rate limit: the hourly cap holds while the minute window is free', () => {
        const limiter = createLimiter();
        const hourly: Settings = { tier: 'write', allowRooms: ['r'], rateLimit: { perMinute: 5, perHour: 2 } };
        expect(codeOf(hourly, write('r'), limiter, 0)).toBeNull();
        expect(codeOf(hourly, write('r'), limiter, 120_000)).toBeNull();
        expect(codeOf(hourly, write('r'), limiter, 240_000)).toBe('rate_limited');
        expect(codeOf(hourly, write('r'), limiter, 3_600_001)).toBeNull();
    });

    it('a room read never spends the write budget', () => {
        const limiter = createLimiter();
        for (let i = 0; i < 5; i += 1)
            expect(codeOf(settings('write'), { kind: 'readRoom', channelId: 'r' }, limiter)).toBeNull();
        expect(codeOf(settings('write'), write('r'), limiter)).toBeNull();
    });
});
