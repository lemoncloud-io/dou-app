import { AuthRepositoryV2 } from './AuthRepositoryV2';

describe('AuthRepositoryV2', () => {
    const createRepository = () => {
        // Remote-only: session-identity commands have no cached counterpart.
        const authRemoteDataSource = {
            updateSocketAuth: jest.fn(),
            sendHashAliasOtp: jest.fn().mockResolvedValue({ sent: true }),
            checkHashAliasOtp: jest.fn().mockResolvedValue({ attached: true }),
            attachSocial: jest.fn().mockResolvedValue({ attached: true }),
        };
        const contextProvider = {
            getContext: () => ({ cid: 'cloud-a', sid: 'site-1', uid: 'me' }),
            setContext: () => undefined,
        };
        const repository = new AuthRepositoryV2(authRemoteDataSource as any, contextProvider as any);

        return { repository, authRemoteDataSource };
    };

    it('sendPhoneVerification은 번호와 옵션을 그대로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        authRemoteDataSource.sendHashAliasOtp.mockResolvedValue({ sent: true, expiredAt: 123 });

        const result = await repository.sendPhoneVerification('01012345678', { resend: true });

        expect(authRemoteDataSource.sendHashAliasOtp).toHaveBeenCalledWith('01012345678', { resend: true });
        expect(result).toEqual({ sent: true, expiredAt: 123 });
    });

    it('sendPhoneVerification은 옵션이 없으면 undefined로 위임한다 (빈 객체를 만들지 않는다)', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        await repository.sendPhoneVerification('01012345678');

        expect(authRemoteDataSource.sendHashAliasOtp).toHaveBeenCalledWith('01012345678', undefined);
    });

    it('checkPhoneVerification은 code를 풀어서 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        await repository.checkPhoneVerification('01012345678', '123456', { code: 'invt:1:secret' });

        expect(authRemoteDataSource.checkHashAliasOtp).toHaveBeenCalledWith('01012345678', '123456', 'invt:1:secret');
    });

    it('checkPhoneVerification은 code가 없으면 undefined로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        await repository.checkPhoneVerification('01012345678', '123456');

        expect(authRemoteDataSource.checkHashAliasOtp).toHaveBeenCalledWith('01012345678', '123456', undefined);
    });

    it('세션 전환 토큰은 해석하지 않고 그대로 반환한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        const checkResult = { attached: true, $token: { identityToken: 'tok' } };
        authRemoteDataSource.checkHashAliasOtp.mockResolvedValue(checkResult);

        const result = await repository.checkPhoneVerification('01012345678', '123456');

        // 토큰 설치는 web-core 소유다 (data-access.md "auth 승격의 경계").
        expect(result).toBe(checkResult);
    });

    it('attachSocial은 토큰 묶음을 그대로 위임한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();

        const result = await repository.attachSocial({ provider: 'apple', identityToken: 'tok' });

        expect(authRemoteDataSource.attachSocial).toHaveBeenCalledWith({ provider: 'apple', identityToken: 'tok' });
        expect(result).toEqual({ attached: true });
    });

    it('원격 실패는 삼키지 않고 그대로 reject한다', async () => {
        const { repository, authRemoteDataSource } = createRepository();
        const failure = new Error('429');
        authRemoteDataSource.sendHashAliasOtp.mockRejectedValue(failure);

        await expect(repository.sendPhoneVerification('01012345678')).rejects.toBe(failure);
    });
});
