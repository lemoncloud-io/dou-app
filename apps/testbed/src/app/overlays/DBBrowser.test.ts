import { describe, expect, it } from 'vitest';

import { TEMPLATES } from './DBBrowser';

const ALL_TYPES = ['channel', 'chat', 'user', 'join', 'site', 'invitecloud', 'profile'] as const;

describe('DBBrowser TEMPLATES', () => {
    it('produces a row with a non-empty id for every cache type', () => {
        for (const type of ALL_TYPES) {
            const row = TEMPLATES[type]();
            expect(typeof row.id).toBe('string');
            expect((row.id as string).length).toBeGreaterThan(0);
        }
    });

    it('generates a fresh unique id on each call (one-click create never collides)', () => {
        const a = TEMPLATES.channel().id;
        const b = TEMPLATES.channel().id;
        expect(a).not.toBe(b);
    });

    it('is JSON-serializable so it can pre-fill the write panel', () => {
        const row = TEMPLATES.chat();
        const json = JSON.stringify(row);
        expect(JSON.parse(json)).toEqual(row);
        // chat needs channelId + chatNo to be useful — present (empty/zero) in the template
        expect(row).toHaveProperty('channelId');
        expect(row).toHaveProperty('chatNo');
    });
});
