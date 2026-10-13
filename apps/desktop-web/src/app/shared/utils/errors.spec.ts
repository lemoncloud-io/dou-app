import { describe, expect, it } from 'vitest';

import { classifyWireError, socketErrorStatus } from './errors';

describe('classifyWireError', () => {
    it('reads the wire text the backend actually sends', () => {
        expect(classifyWireError('403 NOT ALLOWED - action[update] is invalid @doPut(channels/U:1001095)')).toBe(
            'denied'
        );
        expect(classifyWireError('400 INVALID - @code[invt:bogus] is invalid (not-found)')).toBe('notFound');
        expect(classifyWireError('400 INVALID - invite is expired')).toBe('expired');
        expect(classifyWireError('409 CONFLICT - already joined')).toBe('conflict');
        expect(classifyWireError('Network Error')).toBe('network');
        expect(classifyWireError('400 INVALID - bad input')).toBe('invalid');
    });

    it('matches status codes as whole numbers, not inside ids', () => {
        expect(classifyWireError('500 ERROR @doGet(channels/U:1000404)')).toBe('unknown');
    });
});

describe('socketErrorStatus', () => {
    it('reads the leading status of a socket rejection', () => {
        expect(socketErrorStatus(new Error('403 FORBIDDEN - wrong code'))).toBe(403);
        expect(socketErrorStatus(new Error('429 TOO MANY REQUESTS'))).toBe(429);
    });

    it('prefers a carried errorCode and gives up on text without a leading status', () => {
        expect(socketErrorStatus(Object.assign(new Error('x'), { errorCode: 409 }))).toBe(409);
        expect(socketErrorStatus(new Error('failed @doGet(channels/U:1000404)'))).toBeUndefined();
        expect(socketErrorStatus('nope')).toBeUndefined();
    });
});
