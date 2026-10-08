import { describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { isAtPlaceLimit, PLACE_MAX, placeFailure } from './createPlace';

describe('placeFailure', () => {
    it('reads a refusal as one a second try cannot fix', () => {
        expect(placeFailure(new Error('403 NOT ALLOWED - action[create] is invalid'), 'CreatePlace')).toBe('denied');
    });

    it('reads an unreachable server as a network failure', () => {
        expect(placeFailure(new Error('Network timeout'), 'CreatePlace')).toBe('network');
    });

    it('leaves anything else as a failure that may pass on a retry', () => {
        expect(placeFailure(new Error('500 INTERNAL'), 'CreatePlace')).toBe('other');
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
