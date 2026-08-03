import { describe, expect, it } from 'vitest';

import type { DomainChat } from '@chatic/data';

import { systemMessageText } from './systemMessage';

const systemChat = (over: Partial<DomainChat> = {}): DomainChat =>
    ({ id: 'C1:7', channelId: 'C1', chatNo: 7, stereo: 'system', ...over }) as DomainChat;

describe('systemMessageText', () => {
    it('maps join to its own key and carries the author name', () => {
        expect(systemMessageText(systemChat({ subType: 'join' }), 'Ada')).toEqual({
            kind: 'i18n',
            key: 'chat.system.join',
            name: 'Ada',
        });
    });

    it('maps leave to a different key', () => {
        expect(systemMessageText(systemChat({ subType: 'leave' }), 'Ada')?.kind).toBe('i18n');
        expect(systemMessageText(systemChat({ subType: 'leave' }), 'Ada')).toMatchObject({
            key: 'chat.system.leave',
        });
    });

    // The contract package gains subtypes ahead of this build ('reaction' is already
    // in the server source). An unrecognised one must not print its key.
    it('falls back to the raw content for a subtype this build does not know', () => {
        const result = systemMessageText(
            systemChat({ subType: 'reaction' as DomainChat['subType'], content: 'Ada reacted' }),
            'Ada'
        );
        expect(result).toEqual({ kind: 'raw', text: 'Ada reacted' });
    });

    it('falls back to the raw content for legacy rows with no subType at all', () => {
        expect(systemMessageText(systemChat({ content: 'Ada joined' }), 'Ada')).toEqual({
            kind: 'raw',
            text: 'Ada joined',
        });
    });

    it('falls back to the content when the author never resolved, rather than printing a headless sentence', () => {
        expect(systemMessageText(systemChat({ subType: 'join', content: 'Ada joined' }), '  ')).toEqual({
            kind: 'raw',
            text: 'Ada joined',
        });
    });

    it('returns null when there is nothing printable, so no blank line renders', () => {
        expect(systemMessageText(systemChat({ content: '   ' }), 'Ada')).toBeNull();
        expect(systemMessageText(systemChat(), 'Ada')).toBeNull();
        expect(systemMessageText(systemChat({ subType: 'join' }), '')).toBeNull();
    });
});
