import { resolveBaseScope, resolveScopedContext } from './policy';
import type { DataContext, DataContextProvider } from '../../repositories-v2/types';

const providerFor = (context: DataContext): DataContextProvider => ({
    getContext: () => context,
    setContext: () => undefined,
});

describe('resolveBaseScope — uid는 폴백하지 않는다', () => {
    it('세션이 있으면 {cid, uid}를 그대로 돌려준다', () => {
        expect(resolveBaseScope(providerFor({ cid: 'cloud-a', uid: 'me' }))).toEqual({
            cid: 'cloud-a',
            uid: 'me',
        });
    });

    // cid의 'default'는 실재하는 파티션(릴레이)이라 폴백이 옳다. uid에는 대응물이 없다.
    it('cid만 비면 릴레이 파티션으로 폴백한다', () => {
        expect(resolveBaseScope(providerFor({ uid: 'me' }))).toEqual({ cid: 'default', uid: 'me' });
    });

    /**
     * 이 트랙의 사고 그 자체. 릴레이 로그아웃은 uid를 null로 만드는데, 예전 코드는 그걸
     * `'default'`로 채워 유령 파티션에 읽고 썼다. 로그인하면 진짜 uid로 돌아오므로 그 사이에
     * 쓴 행과 sync 커서는 영영 다시 읽히지 않았다.
     */
    it('uid가 없으면 null — 폴백할 파티션이 없다', () => {
        expect(resolveBaseScope(providerFor({ cid: 'cloud-a' }))).toBeNull();
        expect(resolveBaseScope(providerFor({ cid: 'cloud-a', uid: '' }))).toBeNull();
        expect(resolveBaseScope(providerFor({}))).toBeNull();
    });

    it("uid를 'default'로 채우지 않는다", () => {
        expect(resolveBaseScope(providerFor({ cid: 'default' }))).not.toEqual({
            cid: 'default',
            uid: 'default',
        });
    });
});

describe('resolveScopedContext — 도메인 정책', () => {
    it('세션이 없으면 null을 전파한다', () => {
        expect(resolveScopedContext('channel', providerFor({ cid: 'cloud-a' }))).toBeNull();
        expect(resolveScopedContext('meta', providerFor({}))).toBeNull();
    });

    // 초대 링크를 연 사람은 아직 로그인 전일 수 있다. 고정 파티션이라 세션 없이도 갈 곳이 분명하다.
    it('invitecloud는 세션이 없어도 전역 파티션을 쓴다', () => {
        expect(resolveScopedContext('invitecloud', providerFor({}))).toEqual({
            cid: 'global',
            uid: 'global',
        });
    });
});
