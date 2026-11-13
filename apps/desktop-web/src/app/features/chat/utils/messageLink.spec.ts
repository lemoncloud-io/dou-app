import { describe, expect, it } from 'vitest';

import { parsePushDeeplink } from '../../../shared/utils/parsePushDeeplink';
import { buildMessageLink } from './messageLink';

describe('buildMessageLink', () => {
    it('addresses a message by cloud, place, channel and number, in the shell scheme', () => {
        expect(
            buildMessageLink({ cloudId: '1000004', placeId: 'site 1', channelId: 'chan/1', chatNo: 42 }, 'chatic')
        ).toBe('chatic://message/1000004/site%201/chan%2F1/42');
    });

    it('carries the thread root of a reply, and leaves an unknown cloud empty', () => {
        expect(buildMessageLink({ placeId: 'p1', channelId: 'c1', chatNo: 7, rootId: '3' }, 'chatic-dev')).toBe(
            'chatic-dev://message//p1/c1/7?root=3'
        );
    });

    it('reads back as the same target', () => {
        const target = { cloudId: 'c', placeId: 'p', channelId: 'ch', chatNo: 9, rootId: '1' };
        expect(parsePushDeeplink(buildMessageLink(target, 'chatic'))).toEqual(target);
    });
});
