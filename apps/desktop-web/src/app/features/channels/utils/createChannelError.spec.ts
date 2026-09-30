import { describe, expect, it, vi } from 'vitest';

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));

import { createChannelFailure } from './createChannelError';

describe('createChannelFailure', () => {
    it.each([
        // A cap can arrive as a 403; reading it as a refusal would hide where more room comes from.
        [new Error('403 NOT ALLOWED - channel limit reached'), 'limit'],
        [new Error('400 INVALID - quota exceeded'), 'limit'],
        [new Error('403 NOT ALLOWED - action[create] is invalid @doPost(channels)'), 'denied'],
        [new Error('Failed to fetch'), 'network'],
        [new Error('500 INTERNAL'), 'other'],
    ])('reads %s as %s', (error, failure) => {
        expect(createChannelFailure(error)).toBe(failure);
    });

    // Ids in the wire text must not look like a cap.
    it('does not read an id as a limit', () => {
        expect(createChannelFailure(new Error('409 CONFLICT - channels/U:1000404'))).toBe('other');
    });
});
