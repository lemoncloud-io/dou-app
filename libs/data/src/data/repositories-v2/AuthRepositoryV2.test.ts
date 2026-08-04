import { AuthRepositoryV2 } from './AuthRepositoryV2';

describe('AuthRepositoryV2', () => {
    const createRepository = () => {
        // Remote-only: session-identity commands have no cached counterpart.
        const authRemoteDataSource = {
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
        const repository = new AuthRepositoryV2(authRemoteDataSource as any, contextProvider as any);

        return { repository, authRemoteDataSource };
    };

    it('sendPhoneCode는 번호와 옵션을 그대로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        authRemoteDataSource.sendPhoneCode.mockResolvedValue({ sent: true, expiredAt: 123 });

        const result = await repository.sendPhoneCode('01012345678', { mode: 'login', resend: true });

        expect(authRemoteDataSource.sendPhoneCode).toHaveBeenCalledWith('01012345678', {
            mode: 'login',
            resend: true,
        });
        expect(result).toEqual({ sent: true, expiredAt: 123 });
    });

    it('verifyPhoneCode는 mode와 countryCode를 그대로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        await repository.verifyPhoneCode('01012345678', '123456', { mode: 'link', countryCode: 'KR' });

        expect(authRemoteDataSource.verifyPhoneCode).toHaveBeenCalledWith('01012345678', '123456', {
            mode: 'link',
            countryCode: 'KR',
        });
    });

    it('verifyPhoneCode의 linkable=false는 에러로 바꾸지 않고 응답으로 돌려준다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        const blocked = { step: 'verify', linkable: false, reason: 'occupied' };
        authRemoteDataSource.verifyPhoneCode.mockResolvedValue(blocked);

        const result = await repository.verifyPhoneCode('01012345678', '123456', { mode: 'link' });

        // 막는 이유는 verify에서만 응답 자리로 온다 — confirm은 같은 상황을 409/403으로 던진다.
        expect(result).toBe(blocked);
    });

    it('세션 전환 토큰은 해석하지 않고 그대로 반환한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        const confirmResult = {
            step: 'confirm',
            mode: 'login',
            loggedIn: true,
            isNew: false,
            $token: { identityToken: 'tok' },
        };
        authRemoteDataSource.confirmPhoneCode.mockResolvedValue(confirmResult);

        const result = await repository.confirmPhoneCode('01012345678', '123456', { mode: 'login' });

        // 토큰 설치는 web-core 소유다 (data-access.md "auth 승격의 경계").
        expect(result).toBe(confirmResult);
    });

    it('verifySocialAccount는 토큰 묶음을 그대로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        await repository.verifySocialAccount({ provider: 'apple', identityToken: 'tok' });

        expect(authRemoteDataSource.verifySocialAccount).toHaveBeenCalledWith({
            provider: 'apple',
            identityToken: 'tok',
        });
    });

    it('confirmSocialAccount는 토큰 묶음을 그대로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        const result = await repository.confirmSocialAccount({ provider: 'apple', identityToken: 'tok' });

        expect(authRemoteDataSource.confirmSocialAccount).toHaveBeenCalledWith({
            provider: 'apple',
            identityToken: 'tok',
        });
        expect(result).toEqual({ step: 'confirm', linked: true });
    });

    it('원격 실패는 삼키지 않고 그대로 reject한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        const failure = new Error('429');
        authRemoteDataSource.sendPhoneCode.mockRejectedValue(failure);

        await expect(repository.sendPhoneCode('01012345678', { mode: 'login' })).rejects.toBe(failure);
    });
});
