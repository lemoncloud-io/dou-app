import { describe, expect, it } from 'vitest';

import { isNotifiableChat } from './notifiableChat';

describe('isNotifiableChat', () => {
    it('allows a message a person wrote', () => {
        expect(isNotifiableChat({ stereo: 'user' })).toBe(true);
    });

    it('allows a chat with no stereo at all — older rows predate the field', () => {
        expect(isNotifiableChat({})).toBe(true);
    });

    // Join/leave rows carry no readable body, so a banner for one shows an empty message.
    it('silences server-generated system events', () => {
        expect(isNotifiableChat({ stereo: 'system' })).toBe(false);
    });
});
