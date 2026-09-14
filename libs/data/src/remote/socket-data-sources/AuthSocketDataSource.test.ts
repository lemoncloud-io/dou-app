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
        it('the basic call goes out as type=phone, step=send and carries mode through', async () => {
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

        it('mode=link uses the same slot — what differs is the outcome of confirmation', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'link' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ mode: 'link' }));
        });

        it('resend changes the step and does not ride as a switch', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'login', resend: true });

            const [payload] = mockGateways.auth.linkAccount.mock.calls[0];
            expect(payload).toMatchObject({ step: 'resend' });
            expect(payload).not.toHaveProperty('resend');
        });

        it('a delivery switch left unset is omitted from the payload (preserving the server default)', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'login', sms: false });

            const [payload] = mockGateways.auth.linkAccount.mock.calls[0];
            // Only what was stated goes through. Shipping `slack` as false would switch that channel off.
            expect(payload).toMatchObject({ sms: false });
            expect(payload).not.toHaveProperty('slack');
            expect(payload).not.toHaveProperty('dryRun');
        });

        it('a code from an invite context rides through unchanged', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ sent: true } as any);

            await dataSource.sendPhoneCode('01012345678', { mode: 'login', code: 'invt:1:secret' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(
                expect.objectContaining({ code: 'invt:1:secret' })
            );
        });
    });

    describe('verifyPhoneCode', () => {
        it('sends the otp with step=verify and commits nothing', async () => {
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

        it('passes the blocking reason (linkable=false, reason) straight back as the response', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({
                step: 'verify',
                linkable: false,
                reason: 'type-linked',
            } as any);

            const result = await dataSource.verifyPhoneCode('01012345678', '123456', { mode: 'link' });

            // This is a response slot, not an error — neither the socket nor this layer turns it into :error.
            expect(result).toMatchObject({ linkable: false, reason: 'type-linked' });
        });

        it('an invite code does not ride on the proof step (the contract has no slot for it)', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ verified: true } as any);

            await dataSource.verifyPhoneCode('01012345678', '123456', { mode: 'login' });

            const [payload] = mockGateways.auth.linkAccount.mock.calls[0];
            expect(payload).not.toHaveProperty('code');
        });
    });

    describe('confirmPhoneCode', () => {
        it('sends with step=confirm and returns the session-switch token as is', async () => {
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
            // Interpreting and installing the token is not this layer's job — it is passed through as is.
            expect(result).toMatchObject({ $token: { identityToken: 'tok' } });
        });

        it('confirming mode=link carries no token (the session is unchanged)', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ step: 'confirm', linked: true, hint: '5678' } as any);

            const result = await dataSource.confirmPhoneCode('01012345678', '123456', { mode: 'link' });

            expect(result).not.toHaveProperty('$token');
            expect(result).toMatchObject({ linked: true });
        });

        it('sends the same countryCode that was used for delivery', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ linked: true } as any);

            await dataSource.confirmPhoneCode('09012345678', '123456', { mode: 'link', countryCode: 'JP' });

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'JP' }));
        });
    });

    describe('social', () => {
        it('verifySocialAccount goes out as type=social, mode=link, step=verify', async () => {
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

        it('confirmSocialAccount confirms by carrying the native token bundle through unchanged', async () => {
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

        it('social has no login mode — it always goes out as link', async () => {
            mockGateways.auth.linkAccount.mockResolvedValue({ linked: true } as any);

            // The contract is that a caller cannot choose the mode (social login for a device user goes down the REST path).
            await dataSource.confirmSocialAccount({ provider: 'google', idToken: 'tok', mode: 'login' } as any);

            expect(mockGateways.auth.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ mode: 'link' }));
        });
    });
});
