import { describe, expect, it } from 'vitest';

import { classifyWireError } from './errors';

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
