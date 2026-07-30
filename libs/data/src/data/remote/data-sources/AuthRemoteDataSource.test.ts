import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { AuthUpdateInput } from '@lemoncloud/chatic-sockets-api';
describe('AuthRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: AuthRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new AuthRemoteDataSource(mockGateways.auth);
    });

    it('updateSocketAuth 호출 시 auth.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: AuthUpdateInput = { token: 'new-token' } as any;
        mockGateways.auth.update.mockResolvedValue({ status: 'ok' } as any);

        const result = await dataSource.updateSocketAuth(payload);

        expect(mockGateways.auth.update).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });

    describe('sendHashAliasOtp', () => {
        it('기본 호출은 kind=phone·step=send로 나간다', async () => {
            mockGateways.auth.verifyHashAlias.mockResolvedValue({ sent: true, expiredAt: 1 } as any);

            const result = await dataSource.sendHashAliasOtp('01012345678');

            expect(mockGateways.auth.verifyHashAlias).toHaveBeenCalledWith({
                kind: 'phone',
                step: 'send',
                phone: '01012345678',
            });
            expect(result).toEqual({ sent: true, expiredAt: 1 });
        });

        it('resend는 step을 바꾸고 스위치로는 실리지 않는다', async () => {
            mockGateways.auth.verifyHashAlias.mockResolvedValue({ sent: true } as any);

            await dataSource.sendHashAliasOtp('01012345678', { resend: true });

            const [payload] = mockGateways.auth.verifyHashAlias.mock.calls[0];
            expect(payload).toMatchObject({ step: 'resend' });
            expect(payload).not.toHaveProperty('resend');
        });

        it('지정하지 않은 발송 스위치는 페이로드에서 빠진다 (서버 기본값 보존)', async () => {
            mockGateways.auth.verifyHashAlias.mockResolvedValue({ sent: true } as any);

            await dataSource.sendHashAliasOtp('01012345678', { sms: false });

            const [payload] = mockGateways.auth.verifyHashAlias.mock.calls[0];
            // 명시한 것만 넘어간다. slack이 false로 실리면 채널이 꺼져버린다.
            expect(payload).toMatchObject({ sms: false });
            expect(payload).not.toHaveProperty('slack');
            expect(payload).not.toHaveProperty('dryRun');
        });

        it('초대 맥락의 code는 그대로 실린다', async () => {
            mockGateways.auth.verifyHashAlias.mockResolvedValue({ sent: true } as any);

            await dataSource.sendHashAliasOtp('01012345678', { code: 'invt:1:secret' });

            expect(mockGateways.auth.verifyHashAlias).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'invt:1:secret' })
            );
        });
    });

    describe('checkHashAliasOtp', () => {
        it('step=check으로 otp를 보내고 세션 전환 토큰을 그대로 반환한다', async () => {
            mockGateways.auth.verifyHashAlias.mockResolvedValue({
                attached: true,
                $token: { identityToken: 'tok' },
            } as any);

            const result = await dataSource.checkHashAliasOtp('01012345678', '123456');

            expect(mockGateways.auth.verifyHashAlias).toHaveBeenCalledWith({
                kind: 'phone',
                step: 'check',
                phone: '01012345678',
                otp: '123456',
                code: undefined,
            });
            // 토큰 해석·설치는 이 계층의 일이 아니다 — 그대로 넘긴다.
            expect(result.$token).toEqual({ identityToken: 'tok' });
        });

        it('초대 코드가 있으면 대조용으로 함께 보낸다', async () => {
            mockGateways.auth.verifyHashAlias.mockResolvedValue({ attached: true } as any);

            await dataSource.checkHashAliasOtp('01012345678', '123456', 'invt:1:secret');

            expect(mockGateways.auth.verifyHashAlias).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'invt:1:secret' })
            );
        });
    });

    it('attachSocial은 native token 묶음을 그대로 위임한다', async () => {
        mockGateways.auth.attachSocial.mockResolvedValue({ attached: true } as any);

        const result = await dataSource.attachSocial({ provider: 'apple', identityToken: 'tok' });

        expect(mockGateways.auth.attachSocial).toHaveBeenCalledWith({ provider: 'apple', identityToken: 'tok' });
        expect(result).toEqual({ attached: true });
    });
});
