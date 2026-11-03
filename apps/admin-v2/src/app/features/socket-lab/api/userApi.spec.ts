/**
 * `api/userApi.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getUsersBase, mapDeviceView } from './userApi';

describe('userApi', () => {
    describe('getUsersBase', () => {
        afterEach(() => vi.unstubAllEnvs());

        // The old rule stripped `/d1` off the backend endpoint, which left a production backend
        // (`…/v1`) untouched and produced `…/v1/skt-v1`.
        it("reads each stage's presence service from its own key", () => {
            vi.stubEnv('VITE_D1_PRESENCE_ENDPOINT', 'https://dev.example.com/skt-d1');
            vi.stubEnv('VITE_V1_PRESENCE_ENDPOINT', 'https://prod.example.com/skt-v1/');

            expect(getUsersBase('d1')).toBe('https://dev.example.com/skt-d1');
            expect(getUsersBase('v1')).toBe('https://prod.example.com/skt-v1');
        });

        it('throws, naming the key, instead of building a same-origin path', () => {
            vi.stubEnv('VITE_V1_PRESENCE_ENDPOINT', '');

            expect(() => getUsersBase('v1')).toThrow(/VITE_V1_PRESENCE_ENDPOINT is not set/);
        });
    });

    describe('mapDeviceView', () => {
        it('should keep lastActiveAt as absolute epoch ms (0 when unknown)', () => {
            const at = Date.now() - 5000;
            expect(mapDeviceView({ id: 'd1', lastActiveAt: at }).lastActiveAt).toBe(at);
            expect(mapDeviceView({ id: 'd2', updatedAt: at }).lastActiveAt).toBe(at);
            expect(mapDeviceView({ id: 'd3' }).lastActiveAt).toBe(0);
        });

        it('should narrow unknown/empty status to green', () => {
            expect(mapDeviceView({ id: 'd', status: 'red' }).status).toBe('red');
            expect(mapDeviceView({ id: 'd', status: 'yellow' }).status).toBe('yellow');
            expect(mapDeviceView({ id: 'd', status: '' }).status).toBe('green');
            expect(mapDeviceView({ id: 'd' }).status).toBe('green');
        });

        it('should map channel viewing only', () => {
            expect(mapDeviceView({ id: 'd', viewingType: 'channel', viewingId: 'ch1' }).viewing).toBe('ch1');
            expect(mapDeviceView({ id: 'd', viewingType: '', viewingId: 'ch1' }).viewing).toBeNull();
        });

        it('should hide viewing when status is red', () => {
            expect(
                mapDeviceView({ id: 'd', status: 'red', viewingType: 'channel', viewingId: 'ch1' }).viewing
            ).toBeNull();
            expect(mapDeviceView({ id: 'd', status: 'yellow', viewingType: 'channel', viewingId: 'ch1' }).viewing).toBe(
                'ch1'
            );
        });
    });
});
