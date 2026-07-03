import { describe, expect, it } from 'vitest';

import { parsePushDeeplink } from './parsePushDeeplink';

describe('parsePushDeeplink', () => {
    it('parses the same-cloud chatic-open format with place and channel', () => {
        expect(parsePushDeeplink('chatic-open:place%201|chan%2F1')).toEqual({
            placeId: 'place 1',
            channelId: 'chan/1',
        });
    });

    it('parses chatic-open with an empty place', () => {
        expect(parsePushDeeplink('chatic-open:|c1')).toEqual({ placeId: '', channelId: 'c1' });
    });

    it('parses the cross-cloud chatic-open format with cloud, place and channel', () => {
        expect(parsePushDeeplink('chatic-open:1000004|site%201|chan%2F1')).toEqual({
            cloudId: '1000004',
            placeId: 'site 1',
            channelId: 'chan/1',
        });
    });

    it('omits cloudId when the leading segment is empty in the 3-part form', () => {
        expect(parsePushDeeplink('chatic-open:|site1|c1')).toEqual({
            cloudId: undefined,
            placeId: 'site1',
            channelId: 'c1',
        });
    });

    it('rejects the 3-part form without a channel', () => {
        expect(parsePushDeeplink('chatic-open:cloud|place|')).toBeNull();
    });

    it('rejects chatic-open without a channel', () => {
        expect(parsePushDeeplink('chatic-open:place|')).toBeNull();
        expect(parsePushDeeplink('chatic-open:')).toBeNull();
    });

    it('parses the server FCM link format channel?channelId=', () => {
        expect(parsePushDeeplink('channel?channelId=abc123')).toEqual({ placeId: '', channelId: 'abc123' });
    });

    it('parses a bare channelId query', () => {
        expect(parsePushDeeplink('channelId=abc123')).toEqual({ placeId: '', channelId: 'abc123' });
    });

    it('URL-decodes the channelId query value', () => {
        expect(parsePushDeeplink('channel?channelId=a%3A1')).toEqual({ placeId: '', channelId: 'a:1' });
    });

    it('parses the server path form /channels/<id>/room', () => {
        expect(parsePushDeeplink('/channels/1000002/room')).toEqual({ placeId: '', channelId: '1000002' });
    });

    it('ignores unrelated deeplinks', () => {
        expect(parsePushDeeplink('chatic://oauth?code=xyz')).toBeNull();
        expect(parsePushDeeplink('https://example.com')).toBeNull();
        expect(parsePushDeeplink('')).toBeNull();
        expect(parsePushDeeplink(undefined)).toBeNull();
    });
});
