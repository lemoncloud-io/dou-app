/**
 * `api/unicastApi.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { buildSimplePush, buildUnicastEvent } from './unicastApi';

describe('unicastApi', () => {
    describe('buildUnicastEvent', () => {
        it('should auto-fill id/source/ts/version/subject', () => {
            const ev = buildUnicastEvent({ targetType: 'device', targetId: 'd1', type: 'admin.test', data: { a: 1 } });
            expect(ev.id).toMatch(/^adm-\d+-[a-z0-9]+$/);
            expect(ev.source).toBe('admin-v2');
            expect(ev.version).toBe(1);
            expect(ev.ts).toBeGreaterThan(0);
            expect(ev.subject).toBe('device:d1');
            expect(ev.targetType).toBe('device');
            expect(ev.targetId).toBe('d1');
            expect(ev.data).toEqual({ a: 1 });
        });

        it('should generate a fresh id per call', () => {
            const input = { targetType: 'user' as const, targetId: 'u1', type: 'admin.test', data: {} };
            expect(buildUnicastEvent(input).id).not.toBe(buildUnicastEvent(input).id);
            expect(buildUnicastEvent(input).subject).toBe('user:u1');
        });

        it('should include push$/viewing$ only when provided', () => {
            const base = { targetType: 'device' as const, targetId: 'd1', type: 'admin.test', data: {} };
            const bare = buildUnicastEvent(base);
            expect('push$' in bare).toBe(false);
            expect('viewing$' in bare).toBe(false);
            const full = buildUnicastEvent({
                ...base,
                push: buildSimplePush('admin.test', 'me', 'hi'),
                viewing: { type: 'channel', id: 'ch1' },
            });
            expect(full.push$).toMatchObject({ type: 'admin.test', silent: false });
            expect(full.viewing$).toEqual({ type: 'channel', id: 'ch1' });
        });
    });

    describe('buildSimplePush', () => {
        it('should fill l10n args with sender/content on fixed keys', () => {
            expect(buildSimplePush('admin.test', '야호', 'hello')).toEqual({
                title_loc_key: 'push_chat_message_title',
                title_loc_args: ['야호'],
                loc_key: 'push_chat_message_body',
                loc_args: ['hello'],
                link: '',
                type: 'admin.test',
                silent: false,
                data: { content: 'hello' },
            });
        });
    });
});
