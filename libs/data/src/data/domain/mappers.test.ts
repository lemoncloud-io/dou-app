import type { DataContext } from '../repositories-v2/types';
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
describe('domain 매퍼 (API View → Domain)', () => {
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'user-1' };

    describe('toDomainChannel', () => {
        it('cid는 context를 따르고 sid는 view 우선, 없으면 context를 따른다', () => {
            const withSid = toDomainChannel({ id: 'ch-1', sid: 'site-9' } as any, context);
            expect(withSid).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-9' });

            const withoutSid = toDomainChannel({ id: 'ch-2' } as any, context);
            expect(withoutSid.sid).toBe('site-1');
        });

        it('isNotificationEnabled 기본값은 true이다', () => {
            const domain = toDomainChannel({ id: 'ch-1', updatedAt: 100 } as any, context);
            expect(domain.isNotificationEnabled).toBe(true);
        });

        it('서버의 lastChat$을 보지 않는다 — 마지막 메시지 시각은 chat 캐시 소관', () => {
            const domain = toDomainChannel(
                { id: 'ch-1', updatedAt: 100, lastChat$: { createdAt: 500 } } as any,
                context
            );
            expect(domain).toMatchObject({ id: 'ch-1', cid: 'cloud-a', sid: 'site-1' });
        });

        it('원본 API 필드를 보존한다 (View↔Domain 호환성)', () => {
            const domain = toDomainChannel({ id: 'ch-1', name: 'General', stereo: 'group' } as any, context);
            expect(domain).toMatchObject({ name: 'General', stereo: 'group' });
        });
    });

    describe('toDomainChat', () => {
        it('전송 상태 플래그는 기본 false, 타임스탬프(ms)는 createdAt/updatedAt에서 파생된다', () => {
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
        it('joined 기본값 1, readNo 기본값 0으로 보정한다', () => {
            const domain = toDomainJoin({ id: 'j1', channelId: 'ch-1', userId: 'user-1' } as any, context);
            expect(domain).toMatchObject({ id: 'j1', cid: 'cloud-a', joined: 1, readNo: 0 });
        });
    });

    describe('toDomainUser', () => {
        it('channelId와 내장 $join.channelId를 channelIds 배열로 합친다', () => {
            const domain = toDomainUser({ id: 'u1', channelId: 'ch-1', $join: { channelId: 'ch-2' } } as any, context);
            expect(domain.cid).toBe('cloud-a');
            expect(domain.channelIds).toEqual(expect.arrayContaining(['ch-1', 'ch-2']));
            expect(domain.channelIds).toHaveLength(2);
        });
    });

    describe('toDomainPlace', () => {
        it('order 누락 시 최댓값으로, type은 site/user만 허용한다', () => {
            const domain = toDomainPlace({ id: 'site-1', type: 'invalid' } as any, context);
            expect(domain.cid).toBe('cloud-a');
            expect(domain.order).toBe(Number.MAX_SAFE_INTEGER);
            expect(domain.type).toBeUndefined();
        });
    });

    describe('toDomainProfile', () => {
        it('id가 없으면 sid@uid로 합성하고 siteId/userId를 정규화한다', () => {
            const domain = toDomainProfile({ siteId: 'site-1', userId: 'user-1' } as any, context);
            expect(domain).toMatchObject({
                id: 'site-1@user-1',
                cid: 'cloud-a',
                sid: 'site-1',
                uid: 'user-1',
                userId: 'user-1',
            });
        });

        it('view에 식별자가 없으면 context의 sid/uid를 따른다', () => {
            const domain = toDomainProfile({ nick: 'me' } as any, context);
            expect(domain).toMatchObject({ id: 'site-1@user-1', sid: 'site-1', uid: 'user-1' });
        });
    });

    describe('toDomainCloud', () => {
        it('cloudType은 invited/owner만 허용하고 그 외는 undefined로 만든다', () => {
            expect(toDomainCloud({ id: 'cloud-a', cloudType: 'owner' } as any, context).cloudType).toBe('owner');
            expect(toDomainCloud({ id: 'cloud-a', cloudType: 'bogus' } as any, context).cloudType).toBeUndefined();
        });

        it('cid는 context를 따른다', () => {
            expect(toDomainCloud({ id: 'cloud-a' } as any, context).cid).toBe('cloud-a');
        });
    });
});
