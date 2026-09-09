import { AuthSocketDataSource } from './AuthSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';

describe('AuthSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: AuthSocketDataSource;

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new AuthSocketDataSource(mockGateways.auth);
    });

    describe('sendPhoneCode', () => {
        it('기본 호출은 type=phone·step=send로 나가고 mode를 그대로 싣는다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ step: 'send', sent: true, expiredAt: 1 } as any);

            const result = await dataSource.sendPhoneCode('01012345678', { mode: 'login' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith({
                type: 'phone',
                mode: 'login',
                step: 'send',
                phone: '01012345678',
            });
            expect(result).toEqual({ step: 'send', sent: true, expiredAt: 1 });
        });

        it('mode=link도 같은 자리를 쓴다 — 갈리는 것은 확정의 결과다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'link' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ mode: 'link' }));
        });

        it('resend는 step을 바꾸고 스위치로는 실리지 않는다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'login', resend: true });

            const [payload] = mockGateways.auth.linkAccount.mock.calls[0];
            expect(payload).toMatchObject({ step: 'resend' });
            expect(payload).not.toHaveProperty('resend');
        });

        it('지정하지 않은 발송 스위치는 페이로드에서 빠진다 (서버 기본값 보존)', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'login', sms: false });

            const [payload] = mockGateways.auth.linkAccount.mock.calls[0];
            // 명시한 것만 넘어간다. slack이 false로 실리면 채널이 꺼져버린다.
            expect(payload).toMatchObject({ sms: false });
            expect(payload).not.toHaveProperty('slack');
            expect(payload).not.toHaveProperty('dryRun');
        });

        it('초대 맥락의 code는 그대로 실린다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'login', code: 'invt:1:secret' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'invt:1:secret' })
            );
        });
    });

    describe('verifyPhoneCode', () => {
        it('step=verify로 otp를 보내고 아무것도 커밋하지 않는다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ step: 'verify', linkable: true } as any);

            const result = await dataSource.verifyPhoneCode('01012345678', '123456', { mode: 'link' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith({
                type: 'phone',
                mode: 'link',
                step: 'verify',
                phone: '01012345678',
                otp: '123456',
                countryCode: undefined,
            });
            expect(result).toEqual({ step: 'verify', linkable: true });
        });

        it('막는 이유(linkable=false·reason)를 응답으로 그대로 넘긴다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({
                step: 'verify',
                linkable: false,
                reason: 'type-linked',
            } as any);

            const result = await dataSource.verifyPhoneCode('01012345678', '123456', { mode: 'link' });

            // 에러가 아니라 응답 자리다 — 소켓도 이 계층도 :error로 바꾸지 않는다.
            expect(result).toMatchObject({ linkable: false, reason: 'type-linked' });
        });

        it('초대 코드는 증명 단계에 실리지 않는다 (계약에 자리가 없다)', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ verified: true } as any);

            await dataSource.verifyPhoneCode('01012345678', '123456', { mode: 'login' });

            const [payload] = mockGateways.auth.linkAccount.mock.calls[0];
            expect(payload).not.toHaveProperty('code');
        });
    });

    describe('confirmPhoneCode', () => {
        it('step=confirm으로 보내고 세션 전환 토큰을 그대로 반환한다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({
                step: 'confirm',
                mode: 'login',
                loggedIn: true,
                isNew: false,
                $token: { identityToken: 'tok' },
            } as any);

            const result = await dataSource.confirmPhoneCode('01012345678', '123456', { mode: 'login' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith({
                type: 'phone',
                mode: 'login',
                step: 'confirm',
                phone: '01012345678',
                otp: '123456',
                countryCode: undefined,
            });
            // 토큰 해석·설치는 이 계층의 일이 아니다 — 그대로 넘긴다.
            expect(result).toMatchObject({ $token: { identityToken: 'tok' } });
        });

        it('mode=link의 확정에는 토큰이 없다 (세션 불변)', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ step: 'confirm', linked: true, hint: '5678' } as any);

            const result = await dataSource.confirmPhoneCode('01012345678', '123456', { mode: 'link' });

            expect(result).not.toHaveProperty('$token');
            expect(result).toMatchObject({ linked: true });
        });

        it('발송에 쓴 countryCode를 같은 값으로 보낸다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ linked: true } as any);

            await dataSource.confirmPhoneCode('09012345678', '123456', { mode: 'link', countryCode: 'JP' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'JP' }));
        });
    });

    describe('social', () => {
        it('verifySocialAccount는 type=social·mode=link·step=verify로 나간다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ step: 'verify', linkable: true } as any);

            await dataSource.verifySocialAccount({ provider: 'apple', identityToken: 'tok' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith({
                provider: 'apple',
                identityToken: 'tok',
                type: 'social',
                mode: 'link',
                step: 'verify',
            });
        });

        it('confirmSocialAccount는 native token 묶음을 그대로 실어 확정한다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ step: 'confirm', linked: true } as any);

            const result = await dataSource.confirmSocialAccount({ provider: 'apple', identityToken: 'tok' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith({
                provider: 'apple',
                identityToken: 'tok',
                type: 'social',
                mode: 'link',
                step: 'confirm',
            });
            expect(result).toEqual({ step: 'confirm', linked: true });
        });

        it('소셜에는 login 모드가 없다 — 항상 link로 나간다', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ linked: true } as any);

            // 호출부가 mode를 고를 수 없는 것이 계약이다(디바이스 유저의 소셜 로그인은 REST 경로).
            await dataSource.confirmSocialAccount({ provider: 'google', idToken: 'tok', mode: 'login' } as any);

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ mode: 'link' }));
        });
    });
});
