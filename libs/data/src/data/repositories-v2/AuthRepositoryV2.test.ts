import { AuthRepositoryV2 } from './AuthRepositoryV2';

describe('AuthRepositoryV2', () => {
    const createRepository = () => {
        // Remote-only: session-identity commands have no cached counterpart.
        const authSocketDataSource = {
            updateSocketAuth: jest.fn(),
            sendPhoneCode: jest.fn().mockResolvedValue({ sent: true }),
            verifyPhoneCode: jest.fn().mockResolvedValue({ step: 'verify', linkable: true }),
            confirmPhoneCode: jest.fn().mockResolvedValue({ step: 'confirm', linked: true }),
            verifySocialAccount: jest.fn().mockResolvedValue({ step: 'verify', linkable: true }),
            confirmSocialAccount: jest.fn().mockResolvedValue({ step: 'confirm', linked: true }),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new AuthRepositoryV2(authSocketDataSource as any, contextProvider as any);

        return { repository, authSocketDataSource };
    };

    it('sendPhoneCode는 번호와 옵션을 그대로 위임한다', async () => {
        const { repository, authSocketDataSource } = createRepository();
        authSocketDataSource.sendPhoneCode.mockResolvedValue({ sent: true, expiredAt: 123 });

        const result = await repository.sendPhoneCode('01012345678', { mode: 'login', resend: true });

        expect(authSocketDataSource.sendPhoneCode).toHaveBeenCalledWith('01012345678', {
            mode: 'login',
            resend: true,
        });
        expect(result).toEqual({ sent: true, expiredAt: 123 });
    });

    it('verifyPhoneCode는 mode와 countryCode를 그대로 위임한다', async () => {
        const { repository, authSocketDataSource } = createRepository();

        await repository.verifyPhoneCode('01012345678', '123456', { mode: 'link', countryCode: 'KR' });

        expect(authSocketDataSource.verifyPhoneCode).toHaveBeenCalledWith('01012345678', '123456', {
            mode: 'link',
            countryCode: 'KR',
        });
    });

    it('verifyPhoneCode의 linkable=false는 에러로 바꾸지 않고 응답으로 돌려준다', async () => {
        const { repository, authSocketDataSource } = createRepository();
        const blocked = { step: 'verify', linkable: false, reason: 'occupied' };
        authSocketDataSource.verifyPhoneCode.mockResolvedValue(blocked);

        const result = await repository.verifyPhoneCode('01012345678', '123456', { mode: 'link' });

        // 막는 이유는 verify에서만 응답 자리로 온다 — confirm은 같은 상황을 409/403으로 던진다.
        expect(result).toBe(blocked);
    });

    it('세션 전환 토큰은 해석하지 않고 그대로 반환한다', async () => {
        const { repository, authSocketDataSource } = createRepository();
        const confirmResult = {
            step: 'confirm',
            mode: 'login',
            loggedIn: true,
            isNew: false,
            $token: { identityToken: 'tok' },
        };
        authSocketDataSource.confirmPhoneCode.mockResolvedValue(confirmResult);

        const result = await repository.confirmPhoneCode('01012345678', '123456', { mode: 'login' });

        // 토큰 설치는 app-runtime session/auth 소유다 (libs/app-runtime/docs/session/architecture.md).
        expect(result).toBe(confirmResult);
    });

    it('verifySocialAccount는 토큰 묶음을 그대로 위임한다', async () => {
        const { repository, authSocketDataSource } = createRepository();

        await repository.verifySocialAccount({ provider: 'apple', identityToken: 'tok' });

        expect(authSocketDataSource.verifySocialAccount).toHaveBeenCalledWith({
            provider: 'apple',
            identityToken: 'tok',
        });
    });

    it('confirmSocialAccount는 토큰 묶음을 그대로 위임한다', async () => {
        const { repository, authSocketDataSource } = createRepository();

        const result = await repository.confirmSocialAccount({ provider: 'apple', identityToken: 'tok' });

        expect(authSocketDataSource.confirmSocialAccount).toHaveBeenCalledWith({
            provider: 'apple',
            identityToken: 'tok',
        });
        expect(result).toEqual({ step: 'confirm', linked: true });
    });

    it('원격 실패는 삼키지 않고 그대로 reject한다', async () => {
        const { repository, authSocketDataSource } = createRepository();
        const failure = new Error('429');
        authSocketDataSource.sendPhoneCode.mockRejectedValue(failure);

        await expect(repository.sendPhoneCode('01012345678', { mode: 'login' })).rejects.toBe(failure);
    });
});

describe('AuthRepositoryV2 — HTTP account/alias/invite surface (ADR-0070 2단계 후반)', () => {
    const contextProvider = { getContext: () => ({ cid: 'cloud-a', uid: 'me' }), setContext: () => undefined };
    const createAuthHttpDataSource = () => ({
        registerUser: jest.fn(),
        registerUserV2: jest.fn(),
        findAlias: jest.fn(),
        verifyAlias: jest.fn(),
        loginWithInviteCode: jest.fn(),
        fetchInviteInfo: jest.fn(),
    });

    it('throws a clear error when IAuthHttpDataSource is not injected', async () => {
        const repository = new AuthRepositoryV2({} as any, contextProvider as any);

        await expect(repository.registerUser({} as any)).rejects.toThrow('not injected');
        await expect(repository.findAlias({} as any)).rejects.toThrow('not injected');
    });

    it('delegates to the injected http data source', async () => {
        const http = createAuthHttpDataSource();
        http.findAlias.mockResolvedValue({ hasUser: true });
        const repository = new AuthRepositoryV2({} as any, contextProvider as any, http as any);

        await expect(repository.findAlias({ type: 'email', alias: 'a@b.com' })).resolves.toEqual({ hasUser: true });
        expect(http.findAlias).toHaveBeenCalledWith({ type: 'email', alias: 'a@b.com' });
    });
});
