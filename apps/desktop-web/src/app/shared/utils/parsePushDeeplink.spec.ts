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

    it('ignores unrelated deeplinks', () => {
        expect(parsePushDeeplink('chatic://oauth?code=xyz')).toBeNull();
        expect(parsePushDeeplink('https://example.com')).toBeNull();
        expect(parsePushDeeplink('')).toBeNull();
        expect(parsePushDeeplink(undefined)).toBeNull();
    });
});
