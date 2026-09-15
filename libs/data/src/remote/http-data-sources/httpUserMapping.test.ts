import type { UserView as BackendUserView } from '@lemoncloud/chatic-backend-api';
import type { DataContext } from '../../repositories/types';
import { toDomainUserFromHttp } from './httpUserMapping';

/**
 * The bridge from the HTTP axis's `UserView` to the socket-typed `toDomainUser`. Its cast is
 * invisible at runtime, so what is actually worth watching is the thing the cast could hide: an
 * HTTP-only field arriving in the domain model unchanged, and the identity fields surviving the
 * trip. The day a `stereo` value needs branching, the third test below is what says so.
 */
describe('toDomainUserFromHttp', () => {
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'user-1' };

    const view = (extra: Record<string, unknown> = {}): BackendUserView =>
        ({ id: 'u1', name: 'Sam', ...extra }) as unknown as BackendUserView;

    it('maps the identity fields and stamps the context cid', () => {
        expect(toDomainUserFromHttp(view(), context)).toMatchObject({ id: 'u1', name: 'Sam', cid: 'cloud-a' });
    });

    it('falls back to the default partition when the context names no cloud', () => {
        expect(toDomainUserFromHttp(view(), {}).cid).toBe('default');
    });

    it('carries the HTTP-only stereo values through untouched', () => {
        // '#alias' · 'session' · '#code' are OAuth-internal markers the socket axis never sees.
        // Passing them through unread is exactly what makes reusing the socket mapper safe here.
        for (const stereo of ['#alias', 'session', '#code']) {
            expect(toDomainUserFromHttp(view({ stereo }), context)).toMatchObject({ stereo });
        }
    });

    it('collects channel ids from the view and its embedded $join, and drops $join itself', () => {
        const domain = toDomainUserFromHttp(view({ channelId: 'ch-1', $join: { channelId: 'ch-2' } }), context);

        expect(domain.channelIds).toEqual(['ch-1', 'ch-2']);
        expect(domain).not.toHaveProperty('$join');
    });

    it('leaves channelIds empty when the view names no channel', () => {
        expect(toDomainUserFromHttp(view(), context).channelIds).toEqual([]);
    });

    it('gives a missing id the empty string rather than undefined', () => {
        // A user row is keyed by id downstream; `undefined` would key a cache row as "undefined".
        expect(toDomainUserFromHttp({} as BackendUserView, context).id).toBe('');
    });
});
