import type { createCoreSessionCommands as CreateCommands } from './commands';

const mockAuth = {
    relaySession: {
        loginUser: jest.fn(),
        loginBySocialToken: jest.fn(),
        loginGuestByDevice: jest.fn(),
        loginByOAuthCode: jest.fn(),
    },
    confirmPhoneLogin: jest.fn(),
    retryPhoneLogin: jest.fn(),
    cancelPhoneLogin: jest.fn(),
    registerUserWithInviteCode: jest.fn(),
    forgetInviteLogin: jest.fn(),
    switchCloudSession: jest.fn(),
    switchSite: jest.fn(),
    clearSiteSelection: jest.fn(),
    logoutSession: jest.fn(),
    logoutCloudSession: jest.fn(),
    applyPairingSession: jest.fn(),
    pairedCloudSessions: { prepareEntry: jest.fn() },
    checkPairedClouds: jest.fn(),
    endPairedCloud: jest.fn(),
};
jest.mock('@chatic/auth', () => {
    const actual = jest.requireActual('@chatic/auth');
    return {
        ...mockAuth,
        // The real ones: what a command answers with is the point of these tests.
        withoutToken: actual.withoutToken,
        holdPairingClaim: actual.holdPairingClaim,
    };
});

const mockPatchRelaySessionUser = jest.fn();
jest.mock('@chatic/session', () => ({
    patchRelaySessionUser: (patch: unknown) => mockPatchRelaySessionUser(patch),
}));

const mockClaimPairing = jest.fn();
jest.mock('../data/runtime', () => ({
    getRepositories: () => ({ pairing: { claimPairing: (id: string) => mockClaimPairing(id) } }),
}));

// Required after the mocks: their factories read the `mock*` objects above, which an import would
// reach before they are initialised.
const { createCoreSessionCommands } = require('./commands') as { createCoreSessionCommands: typeof CreateCommands };

// What a login answers with, as the backend sends it: the account, and the token that signs it.
const tokenView = { uid: 'u1', name: 'Me', Token: { identityToken: 'secret-identity' } };
const account = { uid: 'u1', name: 'Me' };

describe('the core session commands', () => {
    const commands = createCoreSessionCommands();

    beforeEach(() => jest.clearAllMocks());

    describe('signing in', () => {
        it('answers each login with the account, never its token', async () => {
            mockAuth.relaySession.loginUser.mockResolvedValue(tokenView);
            mockAuth.relaySession.loginBySocialToken.mockResolvedValue(tokenView);
            mockAuth.relaySession.loginGuestByDevice.mockResolvedValue(tokenView);
            mockAuth.relaySession.loginByOAuthCode.mockResolvedValue(tokenView);

            await expect(commands.loginUser({ uid: 'me', pwd: 'pw' } as never, { email: true })).resolves.toEqual(
                account
            );
            await expect(commands.loginBySocialToken({} as never, 'apple')).resolves.toEqual(account);
            await expect(commands.loginGuestByDevice('device-1')).resolves.toEqual(account);
            await expect(commands.loginByOAuthCode('google', 'code-1', { linkCurrentSession: true })).resolves.toEqual(
                account
            );

            expect(mockAuth.relaySession.loginUser).toHaveBeenCalledWith({
                body: { uid: 'me', pwd: 'pw' },
                email: true,
            });
            expect(mockAuth.relaySession.loginBySocialToken).toHaveBeenCalledWith({ body: {}, provider: 'apple' });
            expect(mockAuth.relaySession.loginGuestByDevice).toHaveBeenCalledWith('device-1');
            expect(mockAuth.relaySession.loginByOAuthCode).toHaveBeenCalledWith('google', 'code-1', {
                linkCurrentSession: true,
            });
        });

        it("runs the phone login's three steps", async () => {
            mockAuth.confirmPhoneLogin.mockResolvedValue({ isNew: true });
            mockAuth.retryPhoneLogin.mockResolvedValue({ isNew: false });

            await expect(commands.confirmPhoneLogin('+14155550142', '0000', { countryCode: 'US' })).resolves.toEqual({
                isNew: true,
            });
            await expect(commands.retryPhoneLogin()).resolves.toEqual({ isNew: false });
            await expect(commands.cancelPhoneLogin()).resolves.toBeUndefined();

            expect(mockAuth.confirmPhoneLogin).toHaveBeenCalledWith('+14155550142', '0000', { countryCode: 'US' });
            expect(mockAuth.cancelPhoneLogin).toHaveBeenCalledTimes(1);
        });

        it('logs in with an invite code and drops a handle it is told to', async () => {
            const login = { handle: 'invite-login-1', cloudId: 'aws-1' };
            mockAuth.registerUserWithInviteCode.mockResolvedValue(login);

            await expect(commands.loginWithInviteCode('code-1', 'delegator-1', 'https://cloud')).resolves.toBe(login);
            await expect(commands.forgetInviteLogin('invite-login-1')).resolves.toBeUndefined();

            expect(mockAuth.registerUserWithInviteCode).toHaveBeenCalledWith('code-1', 'delegator-1', 'https://cloud');
            expect(mockAuth.forgetInviteLogin).toHaveBeenCalledWith('invite-login-1');
        });
    });

    describe('moving and leaving', () => {
        it('switches clouds and places, and clears the selection', async () => {
            const inviteLogin = { handle: 'invite-login-1', cloudId: 'aws-1' };

            await commands.switchCloud('cloud-1', { inviteLogin });
            await commands.switchSite('site-1');
            await expect(commands.clearSiteSelection()).resolves.toBeUndefined();

            expect(mockAuth.switchCloudSession).toHaveBeenCalledWith('cloud-1', { inviteLogin });
            expect(mockAuth.switchSite).toHaveBeenCalledWith('site-1');
            expect(mockAuth.clearSiteSelection).toHaveBeenCalledTimes(1);
        });

        it('signs out of the relay and leaves a cloud', async () => {
            await commands.logout({ preserveUrl: true });
            await commands.logoutCloud();

            expect(mockAuth.logoutSession).toHaveBeenCalledWith({ preserveUrl: true });
            expect(mockAuth.logoutCloudSession).toHaveBeenCalledTimes(1);
        });

        it('patches the relay user, and rejects rather than throws when the patch does', async () => {
            await commands.patchRelayUser({ name: 'New' });
            expect(mockPatchRelaySessionUser).toHaveBeenCalledWith({ name: 'New' });

            mockPatchRelaySessionUser.mockImplementationOnce(() => {
                throw new Error('no relay token');
            });
            const call = commands.patchRelayUser({ name: 'Again' });
            await expect(call).rejects.toThrow('no relay token');
        });
    });

    describe('an optional argument that crossed the bridge left out', () => {
        it('reaches the use case as missing, not as null — a default parameter does not take null', async () => {
            mockAuth.confirmPhoneLogin.mockResolvedValue({ isNew: false });
            mockAuth.registerUserWithInviteCode.mockResolvedValue({ handle: 'h', cloudId: null });
            mockAuth.relaySession.loginByOAuthCode.mockResolvedValue(tokenView);
            mockAuth.relaySession.loginUser.mockResolvedValue(tokenView);
            const none = null as never;

            await commands.switchCloud('cloud-1', none);
            await commands.confirmPhoneLogin('+14155550142', '0000', none);
            await commands.loginWithInviteCode('code-1', 'delegator-1', none);
            await commands.loginByOAuthCode('google', 'code-1', none);
            await commands.loginUser({} as never, none);
            await commands.logout(none);

            expect(mockAuth.switchCloudSession).toHaveBeenCalledWith('cloud-1', undefined);
            expect(mockAuth.confirmPhoneLogin).toHaveBeenCalledWith('+14155550142', '0000', undefined);
            expect(mockAuth.registerUserWithInviteCode).toHaveBeenCalledWith('code-1', 'delegator-1', undefined);
            expect(mockAuth.relaySession.loginByOAuthCode).toHaveBeenCalledWith('google', 'code-1', undefined);
            expect(mockAuth.relaySession.loginUser).toHaveBeenCalledWith({ body: {}, email: undefined });
            expect(mockAuth.logoutSession).toHaveBeenCalledWith(undefined);
        });
    });

    describe('pairing', () => {
        it("claims with the session held back — the answer carries a handle in the token's place", async () => {
            mockClaimPairing.mockResolvedValue({
                status: 'approved',
                target: { type: 'relay' },
                approver: { name: 'Phone' },
                session: tokenView,
            });

            const answer = await commands.claimPairing('p-1');

            expect(mockClaimPairing).toHaveBeenCalledWith('p-1');
            expect(answer).toEqual({
                status: 'approved',
                target: { type: 'relay' },
                approver: { name: 'Phone' },
                sessionHandle: expect.any(String),
            });
            expect(JSON.stringify(answer)).not.toContain('secret-identity');
        });

        it('applies a held session, prepares a paired cloud, checks and ends paired clouds', async () => {
            mockAuth.checkPairedClouds.mockResolvedValue(['c-ended']);
            mockAuth.endPairedCloud.mockReturnValue(true);

            await commands.applyPairingSession('pairing-session-1');
            await commands.preparePairedCloudEntry('c-1');
            await expect(commands.checkPairedClouds()).resolves.toEqual(['c-ended']);
            await expect(commands.endPairedCloud('c-1')).resolves.toBe(true);

            expect(mockAuth.applyPairingSession).toHaveBeenCalledWith('pairing-session-1');
            expect(mockAuth.pairedCloudSessions.prepareEntry).toHaveBeenCalledWith('c-1');
            expect(mockAuth.endPairedCloud).toHaveBeenCalledWith('c-1');
        });
    });
});
