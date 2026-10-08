import { describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { createPlaceFailure, isAtPlaceLimit, PLACE_MAX } from './createPlace';

describe('createPlaceFailure', () => {
    it('reads a refusal as one a second try cannot fix', () => {
        expect(createPlaceFailure(new Error('403 NOT ALLOWED - action[create] is invalid'))).toBe('denied');
    });

    it('reads an unreachable server as a network failure', () => {
        expect(createPlaceFailure(new Error('Network timeout'))).toBe('network');
    });

    it('leaves anything else as a failure that may pass on a retry', () => {
        expect(createPlaceFailure(new Error('500 INTERNAL'))).toBe('other');
    });
});

describe('isAtPlaceLimit', () => {
    const places = (count: number) => Array.from({ length: count }, () => ({ stereo: undefined }));

    it('is not reached below the cap', () => {
        expect(isAtPlaceLimit(places(PLACE_MAX - 1))).toBe(false);
    });

    it('is reached at the cap', () => {
        expect(isAtPlaceLimit(places(PLACE_MAX))).toBe(true);
    });

    it('does not count a relay subscription row as a place', () => {
        expect(isAtPlaceLimit([...places(PLACE_MAX - 1), { stereo: 'place' as const }])).toBe(false);
    });
});
