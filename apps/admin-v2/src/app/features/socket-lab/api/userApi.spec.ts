/**
 * `api/userApi.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { mapDeviceView } from './userApi';

describe('userApi', () => {
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
