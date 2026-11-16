import { PAIRING_SESSION_UNKNOWN, applyPairingSession, holdPairingClaim, resetPairingClaims } from './pairingClaims';

const mockApplySessionToken = jest.fn(async (_token: unknown) => undefined);
jest.mock('../socket/applySessionToken', () => ({
    applySessionToken: (token: unknown) => mockApplySessionToken(token),
}));

const session = { id: 'u-1', Token: { identityToken: 'secret-identity' } };
const approvedRelay = { status: 'approved', target: { type: 'relay' }, approver: { name: 'Phone' }, session } as never;

beforeEach(() => {
    jest.clearAllMocks();
    resetPairingClaims();
});

describe('holdPairingClaim', () => {
    it("answers a relay approval with a handle in the session's place — never the token", () => {
        const answer = holdPairingClaim(approvedRelay);

        expect(answer).toEqual({
            status: 'approved',
            target: { type: 'relay' },
            approver: { name: 'Phone' },
            sessionHandle: expect.any(String),
        });
        expect(JSON.stringify(answer)).not.toContain('secret-identity');
    });

    it('keeps no session a cloud approval carries — a cloud is entered by delegation', async () => {
        const cloud = {
            status: 'approved',
            target: { type: 'cloud', cloudId: 'c-1' },
            approver: {},
            session,
        } as never;

        const answer = holdPairingClaim(cloud);

        expect(answer).toEqual({ status: 'approved', target: { type: 'cloud', cloudId: 'c-1' }, approver: {} });
        expect(JSON.stringify(answer)).not.toContain('secret-identity');
    });

    it('passes every answer without a session through as it is', () => {
        const cloud = { status: 'approved', target: { type: 'cloud', cloudId: 'c-1' }, approver: {} } as never;

        expect(holdPairingClaim({ status: 'pending' })).toEqual({ status: 'pending' });
        expect(holdPairingClaim(cloud)).toEqual(cloud);
    });
});

describe('applyPairingSession', () => {
    it('signs in with the session the handle stands for, once', async () => {
        const answer = holdPairingClaim(approvedRelay) as { sessionHandle: string };

        await applyPairingSession(answer.sessionHandle);

        expect(mockApplySessionToken).toHaveBeenCalledWith(session);
        await expect(applyPairingSession(answer.sessionHandle)).rejects.toMatchObject({
            code: PAIRING_SESSION_UNKNOWN,
        });
    });

    it('drops the session when applying it fails — the code screen starts over rather than retry', async () => {
        mockApplySessionToken.mockRejectedValueOnce(new Error('$auth.id missing'));
        const answer = holdPairingClaim(approvedRelay) as { sessionHandle: string };

        await expect(applyPairingSession(answer.sessionHandle)).rejects.toThrow('$auth.id missing');
        await expect(applyPairingSession(answer.sessionHandle)).rejects.toMatchObject({
            code: PAIRING_SESSION_UNKNOWN,
        });
    });

    it('keeps two approvals that land together — a code replaced while its claim was out', async () => {
        const first = holdPairingClaim(approvedRelay) as { sessionHandle: string };
        const second = holdPairingClaim(approvedRelay) as { sessionHandle: string };

        await applyPairingSession(first.sessionHandle);
        await applyPairingSession(second.sessionHandle);

        expect(mockApplySessionToken).toHaveBeenCalledTimes(2);
    });

    it('drops the oldest session past the cap', async () => {
        const handles = [1, 2, 3].map(
            () => (holdPairingClaim(approvedRelay) as { sessionHandle: string }).sessionHandle
        );

        await expect(applyPairingSession(handles[0])).rejects.toMatchObject({ code: PAIRING_SESSION_UNKNOWN });
        await applyPairingSession(handles[2]);
        expect(mockApplySessionToken).toHaveBeenCalledTimes(1);
    });

    it('refuses a handle it never gave', async () => {
        await expect(applyPairingSession('pairing-session-404')).rejects.toMatchObject({
            code: PAIRING_SESSION_UNKNOWN,
        });
        expect(mockApplySessionToken).not.toHaveBeenCalled();
    });
});
