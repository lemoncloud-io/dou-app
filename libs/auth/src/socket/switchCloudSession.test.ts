import { switchCloudSession } from './switchCloudSession';
import { INVITE_LOGIN_UNKNOWN, keepInviteLogin, readInviteLogin, resetInviteLogins } from '../session/inviteLogins';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockSwitchTo = jest.fn();
jest.mock('../session/cloudSession', () => ({
    cloudSession: { switchTo: (...args: unknown[]) => mockSwitchTo(...args) },
}));

const mockSlotKeys = jest.fn((): string[] => []);
jest.mock('@chatic/transport/socket/runtime', () => ({
    getSocketManager: () => ({ getSlotKeys: () => mockSlotKeys() }),
}));

const mockTimeToExpiry = jest.fn((): number | null => 60 * 60_000);
const mockRenew = jest.fn(async () => true);
jest.mock('./renewers', () => ({
    credentialRenewers: { forSlot: () => ({ timeToExpiry: () => mockTimeToExpiry(), renew: () => mockRenew() }) },
}));

const mockReauthenticate = jest.fn(async (_args: unknown) => undefined);
jest.mock('./reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: (args: unknown) => mockReauthenticate(args),
}));
jest.mock('./reauthDelegate', () => ({ createReauthDelegate: () => ({}) }));

const inviteAnswer = { id: 'invitee', Token: { identityToken: 'invitee-identity' } };
const endpoints = { backend: 'https://cloud.example.com', wss: 'wss://cloud.example.com' };
/** The handle the runtime hands a screen for an invite login's answer, as the switch takes it. */
const handleFor = (answer: unknown) => ({ ...keepInviteLogin(answer as never), ...endpoints });
let inviteLogin: ReturnType<typeof handleFor>;

describe('switchCloudSession', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSwitchTo.mockResolvedValue({ cloudId: 'cloud-1' });
        mockSlotKeys.mockReturnValue([]);
        mockTimeToExpiry.mockReturnValue(60 * 60_000);
        resetInviteLogins();
        inviteLogin = handleFor(inviteAnswer);
    });

    it("switches through the session service and resolves with nothing — the service's answer carries a token", async () => {
        await expect(switchCloudSession('cloud-1')).resolves.toBeUndefined();
        expect(mockSwitchTo).toHaveBeenCalledWith('cloud-1', { hasLiveSlot: false });
    });

    it('tells the service when the target cloud already has a socket slot bound', async () => {
        mockSlotKeys.mockReturnValue(['default', 'cloud-1']);

        await switchCloudSession('cloud-1');

        expect(mockSwitchTo).toHaveBeenCalledWith('cloud-1', { hasLiveSlot: true });
        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('renews at once after landing on a live slot whose token ran low — e.g. after sleep', async () => {
        mockSlotKeys.mockReturnValue(['default', 'cloud-1']);
        mockTimeToExpiry.mockReturnValue(60_000);

        await switchCloudSession('cloud-1');

        expect(mockRenew).toHaveBeenCalledTimes(1);
    });

    it('leaves a switch without a live slot to its own fresh exchange', async () => {
        mockTimeToExpiry.mockReturnValue(60_000);

        await switchCloudSession('cloud-1');

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it("enters with the answer the invite login's handle stands for, instead of re-issuing", async () => {
        await switchCloudSession('cloud-1', { inviteLogin });

        expect(mockSwitchTo).toHaveBeenCalledWith('cloud-1', {
            hasLiveSlot: false,
            issuedTokens: expect.objectContaining({
                cloudToken: inviteAnswer,
                delegationToken: expect.objectContaining({ cloudId: 'cloud-1', wss: 'wss://cloud.example.com' }),
            }),
        });
        expect(mockReauthenticate).not.toHaveBeenCalled();
    });

    it('re-registers a live slot with the invite answer, and does not renew it', async () => {
        mockSlotKeys.mockReturnValue(['default', 'cloud-1']);
        mockTimeToExpiry.mockReturnValue(60_000);

        await switchCloudSession('cloud-1', { inviteLogin });

        expect(mockReauthenticate).toHaveBeenCalledWith(expect.objectContaining({ slot: 'cloud-1' }));
        // A renewal re-issues through delegate-cloud — the very identity the answer replaced.
        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('still switches when the live slot will not re-register — the store already holds the answer', async () => {
        mockSlotKeys.mockReturnValue(['default', 'cloud-1']);
        mockReauthenticate.mockRejectedValueOnce(new Error('socket down'));

        await expect(switchCloudSession('cloud-1', { inviteLogin })).resolves.toBeUndefined();
    });

    it('forgets the answer once the cloud is entered', async () => {
        await switchCloudSession('cloud-1', { inviteLogin });

        expect(readInviteLogin(inviteLogin.handle)).toBeNull();
    });

    it('keeps the answer for a retry after a switch that failed, and enters with it then', async () => {
        mockSwitchTo.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));

        await expect(switchCloudSession('cloud-1', { inviteLogin })).rejects.toThrow('Network Error');
        await switchCloudSession('cloud-1', { inviteLogin });

        expect(mockSwitchTo).toHaveBeenLastCalledWith('cloud-1', {
            hasLiveSlot: false,
            issuedTokens: expect.objectContaining({ cloudToken: inviteAnswer }),
        });
    });

    it('refuses a handle the runtime does not hold, rather than enter as the relay user', async () => {
        await expect(
            switchCloudSession('cloud-1', { inviteLogin: { handle: 'invite-login-404', cloudId: null, ...endpoints } })
        ).rejects.toMatchObject({ code: INVITE_LOGIN_UNKNOWN });
        expect(mockSwitchTo).not.toHaveBeenCalled();
    });

    it('falls back to an ordinary switch when the invite answer cannot be entered with', async () => {
        await switchCloudSession('cloud-1', { inviteLogin: handleFor({ id: 'invitee', Token: {} }) });

        expect(mockSwitchTo).toHaveBeenCalledWith('cloud-1', { hasLiveSlot: false, issuedTokens: undefined });
    });
});
