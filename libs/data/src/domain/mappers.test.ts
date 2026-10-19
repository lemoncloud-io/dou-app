import type { DataContext } from '../repositories/types';
import {
    toDomainChannel,
    toDomainChat,
    toDomainCloud,
    toDomainJoin,
    toDomainPlace,
    toDomainProfile,
    toDomainUser,
} from './mappers';

// All mappers convert an API view into a domain model. These tests pin three guarantees:
// (1) cid/sid/uid follow the passed-in context, (2) missing fields get safe defaults,
// (3) View↔Domain compatibility — original API fields survive the spread.
describe('domain mappers (API View → Domain)', () => {
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'user-1' };

    describe('toDomainChannel', () => {
        it('cid follows the context; sid prefers the view and falls back to the context', () => {
            const withSid = toDomainChannel({ id: 'ch-1', sid: 'site-9' } as any, context);
            expect(withSid).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-9' });

            const withoutSid = toDomainChannel({ id: 'ch-2' } as any, context);
            expect(withoutSid.sid).toBe('site-1');
        });

        // A cloud 1:1 belongs to the place the server stamped on it; the context names the reader's.
        it('a cloud 1:1 takes the place its id names, never the context', () => {
            expect(toDomainChannel({ id: 'site-7@u1@u2', stereo: 'dm' } as any, context).sid).toBe('site-7');
            expect(toDomainChannel({ id: 'u1@u2', stereo: 'dm' } as any, context).sid).toBe('');
            expect(toDomainChannel({ id: 'u1@u2', stereo: 'dm', sid: 'site-9' } as any, context).sid).toBe('site-9');
        });

        it('a relay 1:1 still falls back to the context', () => {
            const relay = toDomainChannel({ id: 'u1@u2', stereo: 'dm' } as any, { cid: 'default', sid: '0000' });
            expect(relay.sid).toBe('0000');
        });

        it('isNotificationEnabled defaults to true', () => {
            const domain = toDomainChannel({ id: 'ch-1', updatedAt: 100 } as any, context);
            expect(domain.isNotificationEnabled).toBe(true);
        });

        it('does not read lastChat$ from the server — the last message time belongs to the chat cache', () => {
            const domain = toDomainChannel(
                { id: 'ch-1', updatedAt: 100, lastChat$: { createdAt: 500 } } as any,
                context
            );
            expect(domain).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-1' });
        });

        it('preserves the original API fields (View↔Domain compatibility)', () => {
            const domain = toDomainChannel({ id: 'ch-1', name: 'General', stereo: 'group' } as any, context);
            expect(domain).toMatchObject({ name: 'General', stereo: 'group' });
        });
    });

    describe('toDomainChat', () => {
        it('send-state flags default to false, and the millisecond timestamps derive from createdAt/updatedAt', () => {
            const domain = toDomainChat(
                { id: 'm1', channelId: 'ch-1', createdAt: 100, updatedAt: 200 } as any,
                context
            );
            expect(domain).toMatchObject({
                id: 'm1',
                cid: 'cloud-a',
                channelId: 'ch-1',
                isPending: false,
                isFailed: false,
            });
            expect(domain.createdAtMs).toBe(100);
            expect(domain.updatedAtMs).toBe(200);
        });
    });

    describe('toDomainJoin', () => {
        it('normalizes joined to 1 and readNo to 0 by default', () => {
            const domain = toDomainJoin({ id: 'j1', channelId: 'ch-1', userId: 'user-1' } as any, context);
            expect(domain).toMatchObject({ id: 'j1', cid: 'cloud-a', joined: 1, readNo: 0 });
        });

        // A place-keyed 1:1 id holds `@` itself, so its join id is `<sid>@<uidA>@<uidB>@<uid>`. It is
        // kept as the server sent it rather than re-derived.
        it('keeps the join id of a place-keyed 1:1 as it is', () => {
            const domain = toDomainJoin({ id: 'S1@u1@u2@u1', channelId: 'S1@u1@u2', userId: 'u1' } as any, context);
            expect(domain).toMatchObject({ id: 'S1@u1@u2@u1', channelId: 'S1@u1@u2', userId: 'u1' });
        });
    });

    describe('toDomainUser', () => {
        it('merges channelId and the embedded $join.channelId into a channelIds array', () => {
            const domain = toDomainUser({ id: 'u1', channelId: 'ch-1', $join: { channelId: 'ch-2' } } as any, context);
            expect(domain.cid).toBe('cloud-a');
            expect(domain.channelIds).toEqual(expect.arrayContaining(['ch-1', 'ch-2']));
            expect(domain.channelIds).toHaveLength(2);
        });

        it('$join is only read and never placed on the result', () => {
            // A user record is channel-global, so a per-channel read cursor must not be laid onto it —
            // the cursor is owned by the join cache (`channelId@userId`).
            const domain = toDomainUser({ id: 'u1', $join: { channelId: 'ch-2', chatNo: 7 } } as any, context);
            expect('$join' in domain).toBe(false);
        });
    });

    describe('toDomainPlace', () => {
        it('a missing order becomes the maximum, and type allows only site/user', () => {
            const domain = toDomainPlace({ id: 'site-1', type: 'invalid' } as any, context);
            expect(domain.cid).toBe('cloud-a');
            expect(domain.order).toBe(Number.MAX_SAFE_INTEGER);
            expect(domain.type).toBeUndefined();
        });
    });

    describe('toDomainProfile', () => {
        it('a missing id is synthesized as sid@uid, and siteId/userId are normalized', () => {
            const domain = toDomainProfile({ siteId: 'site-1', userId: 'user-1' } as any, context);
            expect(domain).toMatchObject({
                id: 'site-1@user-1',
                cid: 'cloud-a',
                sid: 'site-1',
                uid: 'user-1',
                userId: 'user-1',
            });
        });

        it('falls back to sid/uid from the context when the view carries no identifier', () => {
            const domain = toDomainProfile({ nick: 'me' } as any, context);
            expect(domain).toMatchObject({ id: 'site-1@user-1', sid: 'site-1', uid: 'user-1' });
        });
    });

    describe('toDomainCloud', () => {
        it('cloudType allows only invited/owner and turns anything else into undefined', () => {
            expect(toDomainCloud({ id: 'cloud-a', cloudType: 'owner' } as any, context).cloudType).toBe('owner');
            expect(toDomainCloud({ id: 'cloud-a', cloudType: 'bogus' } as any, context).cloudType).toBeUndefined();
        });

        it('cid follows the context', () => {
            expect(toDomainCloud({ id: 'cloud-a' } as any, context).cid).toBe('cloud-a');
        });
    });
});
