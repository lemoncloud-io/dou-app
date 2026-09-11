import { mergeRefreshedCloudToken, mergeRefreshedRelayToken } from './tokenMerge';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

type Relay = Parameters<typeof mergeRefreshedRelayToken>[1];

const stored = (over: Record<string, unknown> = {}) =>
    ({
        name: 'Neo',
        photo: 'me.png',
        email: 'neo@example.com',
        Token: {
            identityToken: 'idt-old',
            identityPoolId: 'pool-1',
            credential: { AccessKeyId: 'AKIA-old', SecretKey: 's-old' },
            accountId: 'acct',
        },
        ...over,
    }) as unknown as UserTokenView;

/** A slim socket refresh view — what the SDK actually emits. */
const slim = (token: Record<string, unknown> = {}) => ({ Token: { accountId: 'acct', ...token } }) as unknown as Relay;

describe('mergeRefreshedRelayToken — 보존 불변식 3개', () => {
    it('identityToken: 뷰가 안 실어 보내면 저장된 것을 유지한다', () => {
        // relay 서명 HTTP 가 x-lemon-identity 로 보내고 다음 register 가 다시 읽는다.
        expect(mergeRefreshedRelayToken(stored(), slim()).Token?.identityToken).toBe('idt-old');
        // 실어 보내면 새 값이 이긴다.
        expect(mergeRefreshedRelayToken(stored(), slim({ identityToken: 'idt-new' })).Token?.identityToken).toBe(
            'idt-new'
        );
    });

    it('identityPoolId: 뷰가 안 실어 보내면 저장된 것을 유지한다', () => {
        // 이 병합이 두 스토어를 먹인다 — lemon 쪽은 saveOAuthToken 이 이 필드를 ''로 덮으므로,
        // 여기서 떨어지면 첫 소켓 refresh 이후 모든 사본에서 pool id 가 사라진다.
        expect(mergeRefreshedRelayToken(stored(), slim()).Token?.identityPoolId).toBe('pool-1');
        expect(mergeRefreshedRelayToken(stored(), slim({ identityPoolId: 'pool-2' })).Token?.identityPoolId).toBe(
            'pool-2'
        );
    });

    it('credential: 뷰가 안 실어 보내면 저장된 것을 유지한다 — 스토어가 서명자와 어긋나지 않게', () => {
        // 뷰에 자격증명이 없으면 호출부는 lemon 캐시를 이전 것으로 남긴다. 이 필드가 떨어지면
        // 스토어가 "무엇이 서명 중인지"를 잃고 자격증명 시계가 "측정 불가"를 답한다.
        expect(mergeRefreshedRelayToken(stored(), slim()).Token?.credential).toEqual({
            AccessKeyId: 'AKIA-old',
            SecretKey: 's-old',
        });
        const fresh = { AccessKeyId: 'AKIA-new', SecretKey: 's-new' };
        expect(mergeRefreshedRelayToken(stored(), slim({ credential: fresh })).Token?.credential).toEqual(fresh);
    });

    it('프로필 필드: 슬림한 refresh 가 name/photo/email 을 지우지 않는다', () => {
        // relay 토큰은 계정 프로필 표시 원천이기도 하다 (getRelaySessionUser).
        const merged = mergeRefreshedRelayToken(stored(), slim()) as unknown as Record<string, unknown>;
        expect(merged.name).toBe('Neo');
        expect(merged.photo).toBe('me.png');
        expect(merged.email).toBe('neo@example.com');
    });

    it('저장된 것이 없으면 뷰가 그대로 통과한다', () => {
        const merged = mergeRefreshedRelayToken(null, slim({ identityToken: 'idt-new' }));
        expect(merged.Token?.identityToken).toBe('idt-new');
        expect(merged.Token?.identityPoolId).toBeUndefined();
    });
});

describe('mergeRefreshedRelayToken — $auth 는 보존하고 채택하지 않는다', () => {
    const authed = (id: string) => stored({ $auth: { id } });
    const withAuth = (merged: UserTokenView) => (merged as UserTokenView & { $auth?: { id?: string } }).$auth;

    it('사이트 전환이 돌려준 하위 auth 를 채택하지 않는다', () => {
        // 서버는 target 이 실린 refresh 에 identityId 없는 하위 auth 를 $auth 로 실어 보낸다.
        // 그 id 로 서명하면 서버가 identityId='' 로 계산해 영구 403 invalid sign 이 된다.
        const merged = mergeRefreshedRelayToken(
            authed('parent-auth'),
            slim({ identityToken: 'idt-new' }) as Relay & { $auth: { id: string } }
        );
        expect(withAuth(merged)?.id).toBe('parent-auth');

        const switched = mergeRefreshedRelayToken(authed('parent-auth'), {
            ...slim(),
            $auth: { id: 'child-auth' },
        } as unknown as Relay);
        expect(withAuth(switched)?.id).toBe('parent-auth');
    });

    it('저장된 $auth 가 없으면 뷰의 것을 받는다', () => {
        const merged = mergeRefreshedRelayToken(stored(), {
            ...slim(),
            $auth: { id: 'first-auth' },
        } as unknown as Relay);
        expect(withAuth(merged)?.id).toBe('first-auth');
    });

    it('저장된 $auth 에 id 가 없으면 붙들지 않고 뷰의 것을 받는다', () => {
        // id 없는 $auth 로는 register 도 서명도 못 한다 — 보존할 가치가 없다.
        const merged = mergeRefreshedRelayToken(stored({ $auth: {} }), {
            ...slim(),
            $auth: { id: 'usable-auth' },
        } as unknown as Relay);
        expect(withAuth(merged)?.id).toBe('usable-auth');
    });

    it('양쪽 다 없으면 undefined 로 남는다', () => {
        expect(withAuth(mergeRefreshedRelayToken(stored(), slim()))).toBeUndefined();
    });

    it('보존이 Token 병합을 건드리지 않는다', () => {
        const merged = mergeRefreshedRelayToken(authed('parent-auth'), {
            ...slim({ identityToken: 'idt-new' }),
            $auth: { id: 'child-auth' },
        } as unknown as Relay);
        expect(merged.Token?.identityToken).toBe('idt-new');
        expect(merged.Token?.identityPoolId).toBe('pool-1');
    });
});

describe('mergeRefreshedCloudToken — 얕은 병합만', () => {
    it('저장된 것 위에 뷰를 얕게 덮는다 (프로필 필드 유지)', () => {
        const merged = mergeRefreshedCloudToken(stored(), {
            Token: { identityToken: 'cloud-new' },
        } as unknown as UserTokenView) as unknown as Record<string, unknown>;
        expect(merged.name).toBe('Neo');
        // 필드별 보존은 없다 — Token 은 통째로 교체된다. 클라우드 자격증명으로 서명하는 것이
        // 아무것도 없으므로(signing.md §3) 유지할 것이 없다.
        expect((merged.Token as Record<string, unknown>).identityPoolId).toBeUndefined();
    });

    it('저장된 것이 없으면 뷰를 그대로 돌려준다', () => {
        const view = { Token: { identityToken: 'only' } } as unknown as UserTokenView;
        expect(mergeRefreshedCloudToken(null, view)).toBe(view);
    });
});
