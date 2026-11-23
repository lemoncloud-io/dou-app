import { logger } from '@chatic/logger';

import { readCapabilityDeclaration, resolveCapability } from './capabilities';

describe('readCapabilityDeclaration', () => {
    it.each([undefined, null])('reads %p as no declaration', raw => {
        expect(readCapabilityDeclaration(raw)).toEqual({ kind: 'absent' });
    });

    it.each([
        ['a string', 'checkout'],
        ['a list', [1]],
        ['an object without a version', { checkout: ['apple'] }],
        ['version 0', { version: 0 }],
        ['a fractional version', { version: 1.5 }],
        ['a version given as text', { version: '1' }],
    ])('reads %s as malformed', (_name, raw) => {
        expect(readCapabilityDeclaration(raw)).toEqual({ kind: 'malformed' });
    });

    it('reads an object with a positive integer version as declared, without the version among the values', () => {
        expect(readCapabilityDeclaration({ version: 2, alpha: ['x'] })).toEqual({
            kind: 'declared',
            version: 2,
            values: { alpha: ['x'] },
        });
    });
});

describe('resolveCapability', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it('leaves a shell that declares nothing to the legacy rule', () => {
        expect(resolveCapability({ kind: 'absent' }, 'alpha', 1)).toEqual({ from: 'legacy' });
    });

    it('answers unavailable, never a guess, when the declaration is unreadable', () => {
        expect(resolveCapability({ kind: 'malformed' }, 'alpha', 1)).toEqual({
            from: 'unavailable',
            reason: 'malformed',
        });
    });

    it('reads a declared key', () => {
        const declaration = readCapabilityDeclaration({ version: 1, alpha: ['x'] });

        expect(resolveCapability(declaration, 'alpha', 1)).toEqual({ from: 'declaration', value: ['x'] });
    });

    it('reads an empty declared value as declared — an empty list is an answer', () => {
        const declaration = readCapabilityDeclaration({ version: 1, alpha: [] });

        expect(resolveCapability(declaration, 'alpha', 1)).toEqual({ from: 'declaration', value: [] });
    });

    it('treats a key missing at a version that carries it as a shell bug: unavailable, and logged', () => {
        const declaration = readCapabilityDeclaration({ version: 2 });

        expect(resolveCapability(declaration, 'alpha', 2)).toEqual({ from: 'unavailable', reason: 'missing' });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('leaves a key newer than the declared version to the legacy rule, without logging', () => {
        const declaration = readCapabilityDeclaration({ version: 1 });

        expect(resolveCapability(declaration, 'beta', 2)).toEqual({ from: 'legacy' });
        expect(warn).not.toHaveBeenCalled();
    });

    it('reads the keys it knows from a declaration newer than it knows, and ignores the rest', () => {
        const declaration = readCapabilityDeclaration({ version: 9, alpha: ['x'], fromTheFuture: true });

        expect(resolveCapability(declaration, 'alpha', 1)).toEqual({ from: 'declaration', value: ['x'] });
    });
});
