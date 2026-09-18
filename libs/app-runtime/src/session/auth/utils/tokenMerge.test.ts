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
        // relay-signed HTTP sends it as x-lemon-identity, and the next register reads it back.
        expect(mergeRefreshedRelayToken(stored(), slim()).Token?.identityToken).toBe('idt-old');
        // When it IS carried, the new value wins.
        expect(mergeRefreshedRelayToken(stored(), slim({ identityToken: 'idt-new' })).Token?.identityToken).toBe(
            'idt-new'
        );
    });

    it('identityPoolId: 뷰가 안 실어 보내면 저장된 것을 유지한다', () => {
        // This merge feeds both stores — on the lemon side, saveOAuthToken overwrites this field with
        // '', so if it dropped here, the pool id would vanish from every copy after the first socket
        // refresh.
        expect(mergeRefreshedRelayToken(stored(), slim()).Token?.identityPoolId).toBe('pool-1');
        expect(mergeRefreshedRelayToken(stored(), slim({ identityPoolId: 'pool-2' })).Token?.identityPoolId).toBe(
            'pool-2'
        );
    });

    it('credential: 뷰가 안 실어 보내면 저장된 것을 유지한다 — 스토어가 서명자와 어긋나지 않게', () => {
        // If the view has no credential, the caller leaves the lemon cache as the previous one. If
        // this field dropped, the store would lose track of "what's currently signing", and the
        // credential clock would answer "can't measure".
        expect(mergeRefreshedRelayToken(stored(), slim()).Token?.credential).toEqual({
            AccessKeyId: 'AKIA-old',
            SecretKey: 's-old',
        });
        const fresh = { AccessKeyId: 'AKIA-new', SecretKey: 's-new' };
        expect(mergeRefreshedRelayToken(stored(), slim({ credential: fresh })).Token?.credential).toEqual(fresh);
    });

    it('프로필 필드: 슬림한 refresh 가 name/photo/email 을 지우지 않는다', () => {
        // The relay token also doubles as the source for account profile display (getRelaySessionUser).
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
        // On a refresh carrying a target, the server sends a sub-auth with no identityId as $auth.
        // Signing with that id makes the server compute identityId='' and produce a permanent
        // 403 invalid sign.
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
        // An $auth without an id can't sign or register anything — there's nothing worth preserving.
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
        // There's no per-field preservation — Token is replaced wholesale. Nothing signs with the
        // cloud credential (signing.md §3), so there's nothing to keep.
        expect((merged.Token as Record<string, unknown>).identityPoolId).toBeUndefined();
    });

    it('저장된 것이 없으면 뷰를 그대로 돌려준다', () => {
        const view = { Token: { identityToken: 'only' } } as unknown as UserTokenView;
        expect(mergeRefreshedCloudToken(null, view)).toBe(view);
    });
});
