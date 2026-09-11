import { handleRevokedRelaySession, isRevokedSessionError, resetRevokedSessionHandling } from './revokedSession';
import { relaySession } from '../../session/auth/relaySession';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../session/auth/relaySession', () => ({
    relaySession: { clearAndRedirect: jest.fn().mockResolvedValue(undefined) },
}));

const mockedClear = relaySession.clearAndRedirect as jest.Mock;

/**
 * The shape the SDK actually hands us: `AuthSwitchError` says only which PHASE failed, and the
 * server's sentence — the only place the word "revoked" appears — rides in `cause`
 * (chatic-sockets-api `client-socket-v2/auth-controller.ts`). Reproduced from the live failure in
 * `.claude/20260910/DEBUG-17-30-25.md`.
 */
const authSwitchError = (causeMessage: string): Error => {
    const error = new Error('auth.switch failed: server') as Error & { cause?: unknown };
    error.cause = new Error(causeMessage);
    return error;
};

const REVOKED = '403 NOT ALLOWED - session revoked @refreshAccessToken(d0642018-6f0a-42cd-9f7c-e6625dabbf0a)';

describe('isRevokedSessionError', () => {
    it('reads the verdict out of the cause chain, where the SDK leaves it', () => {
        expect(isRevokedSessionError(authSwitchError(REVOKED))).toBe(true);
    });

    it('matches a revoked rejection that arrives without a wrapper', () => {
        expect(isRevokedSessionError(new Error(REVOKED))).toBe(true);
    });

    it('does not fire on the other auth failures, which are all recoverable', () => {
        // Terminal-looking but renewable: a refresh that lost the server error, a stale-authId
        // signature reject, and a switch on a dropped socket.
        expect(isRevokedSessionError(new Error('auth.refresh failed: server'))).toBe(false);
        expect(
            isRevokedSessionError(authSwitchError('403 NOT ALLOWED - invalid sign @refreshAccessToken(old-id)'))
        ).toBe(false);
        expect(isRevokedSessionError(new Error('auth.switch failed: not-connected'))).toBe(false);
        expect(isRevokedSessionError(null)).toBe(false);
        expect(isRevokedSessionError('session revoked')).toBe(true);
    });

    it('terminates on a cyclic cause instead of hanging', () => {
        const error = new Error('boom') as Error & { cause?: unknown };
        error.cause = error;

        expect(isRevokedSessionError(error)).toBe(false);
    });
});

describe('handleRevokedRelaySession', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetRevokedSessionHandling();
    });

    it('clears the dead session locally so the keep-alive can log in again', async () => {
        await handleRevokedRelaySession('auth.switch');

        expect(mockedClear).toHaveBeenCalledTimes(1);
    });

    it('tears down once even though a revoked session fails every request', async () => {
        await handleRevokedRelaySession('auth.switch');
        await handleRevokedRelaySession('auth.switch');

        expect(mockedClear).toHaveBeenCalledTimes(1);
    });
});
