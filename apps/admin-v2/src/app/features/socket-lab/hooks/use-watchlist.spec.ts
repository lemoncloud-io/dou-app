/**
 * `hooks/use-watchlist.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { patchDevice, worstPresence } from './use-watchlist';
import type { ObservedDevice, ObservedUser } from '../mock/observed-users';

const device = (id: string, status: ObservedDevice['status'] = 'green'): ObservedDevice => ({
    id,
    name: `name-${id}`,
    platform: 'web',
    status,
    tick: 1,
    viewing: null,
    viewingFor: null,
    lastActiveAt: 0,
});

const user = (id: string, devices: ObservedDevice[]): ObservedUser => ({
    id,
    name: `user-${id}`,
    code: '',
    presence: 'green',
    devices,
});

describe('use-watchlist', () => {
    describe('worstPresence', () => {
        it('should pick the worst device status (red > yellow > green)', () => {
            expect(worstPresence([device('a'), device('b', 'yellow')], 'green')).toBe('yellow');
            expect(worstPresence([device('a', 'yellow'), device('b', 'red')], 'green')).toBe('red');
            expect(worstPresence([device('a')], 'red')).toBe('green');
        });

        it('should keep fallback when no devices', () => {
            expect(worstPresence([], 'yellow')).toBe('yellow');
        });
    });

    describe('patchDevice', () => {
        it('should update the owning user device and derive presence', () => {
            const list = [user('u1', [device('d1'), device('d2')]), user('u2', [device('d3')])];
            const next = patchDevice(list, 'd2', { id: 'd2', status: 'red', tick: 5 });
            expect(next[0].devices[1].status).toBe('red');
            expect(next[0].devices[1].tick).toBe(5);
            expect(next[0].presence).toBe('red');
            expect(next[1]).toBe(list[1]);
        });

        it('should return the same reference when device is not observed', () => {
            const list = [user('u1', [device('d1')])];
            expect(patchDevice(list, 'unknown', { id: 'unknown' })).toBe(list);
        });

        it('should return the same reference when values are unchanged', () => {
            const list = [user('u1', [device('d1')])];
            expect(
                patchDevice(list, 'd1', { id: 'd1', name: 'name-d1', platform: 'web', status: 'green', tick: 1 })
            ).toBe(list);
        });

        it('should reflect status-only change even with the same tick', () => {
            const list = [user('u1', [device('d1')])];
            const next = patchDevice(list, 'd1', {
                id: 'd1',
                name: 'name-d1',
                platform: 'web',
                status: 'yellow',
                tick: 1,
            });
            expect(next[0].devices[0].status).toBe('yellow');
            expect(next[0].presence).toBe('yellow');
        });

        it('should keep the previous display name when view has no name', () => {
            const list = [user('u1', [device('d1')])];
            const next = patchDevice(list, 'd1', { id: 'd1', tick: 2 });
            expect(next[0].devices[0].name).toBe('name-d1');
        });
    });
});
