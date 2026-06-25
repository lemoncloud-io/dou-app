import { describe, expect, it } from 'vitest';

import { type InvitePayload, decodeInvite, encodeInvite, parseInviteLocation } from './inviteCode';

const payload: InvitePayload = {
    code: 'uuid-123',
    cid: 'cloud-a',
    sid: 'site-1',
    channelId: 'ch-9',
    backend: 'https://cloud.example.com',
    wss: 'wss://cloud.example.com',
    cloudName: '클라우드 A',
};

describe('inviteCode', () => {
    it('round-trips an invite payload through encode/decode', () => {
        expect(decodeInvite(encodeInvite(payload))).toEqual(payload);
    });

    it('preserves non-ASCII cloud names (unicode-safe base64)', () => {
        const decoded = decodeInvite(encodeInvite(payload));
        expect(decoded?.cloudName).toBe('클라우드 A');
    });

    it('returns null for empty or malformed input', () => {
        expect(decodeInvite('')).toBeNull();
        expect(decodeInvite('   ')).toBeNull();
        expect(decodeInvite('not-base64-!@#')).toBeNull();
        expect(decodeInvite(btoa('{"not":"json'))).toBeNull();
    });

    it('returns null when a required target field is missing', () => {
        const missingSid = btoa(JSON.stringify({ code: 'x', cid: 'c', channelId: 'ch' }));
        expect(decodeInvite(missingSid)).toBeNull();
    });
});

describe('parseInviteLocation', () => {
    it('extracts code/_backend/_siteId from a deeplink URL', () => {
        const loc = 'https://app.example.com/invite?code=abc-123&_backend=https://be.example.com&_siteId=site-1';
        expect(parseInviteLocation(loc)).toEqual({
            code: 'abc-123',
            backend: 'https://be.example.com',
            siteId: 'site-1',
        });
    });

    it('returns empty for undefined and code-only for an unparseable string', () => {
        expect(parseInviteLocation(undefined)).toEqual({});
        expect(parseInviteLocation('weird?code=xyz')).toEqual({ code: 'xyz' });
    });
});
