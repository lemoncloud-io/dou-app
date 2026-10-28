import { checkPairedCloud, checkPairedClouds, reissuePairedCloud } from './pairedCloudCheck';

const reissueCloudTokens = jest.fn();
const onTerminalExpiry = jest.fn();
const reauthenticateActiveSocket = jest.fn();
const alignSessionSite = jest.fn();
const endPairedCloud = jest.fn();
let paired: string[] = [];

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../auth/cloudTokens', () => ({ reissueCloudTokens: (id: string) => reissueCloudTokens(id) }));
jest.mock('../../socket/auth/renewers', () => ({
    credentialRenewers: { forSlot: (key: string) => ({ onTerminalExpiry: () => onTerminalExpiry(key) }) },
}));
jest.mock('../../socket/auth/reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: (args: unknown) => reauthenticateActiveSocket(args),
}));
jest.mock('../../socket/auth/alignSessionSite', () => ({
    alignSessionSite: (cid: string, site: string | undefined) => alignSessionSite(cid, site),
}));
jest.mock('../../socket/auth/reauthDelegate', () => ({ createReauthDelegate: () => ({}) }));
jest.mock('../../socket/runtime', () => ({ getSocketManager: () => ({}) }));
jest.mock('../../socket/utils/slotKey', () => ({ slotKeyOf: (id: string) => id }));
jest.mock('./pairedClouds', () => ({ pairedClouds: { list: () => paired } }));
jest.mock('./pairedCloudRefusal', () => ({
    ...jest.requireActual('./pairedCloudRefusal'),
    endPairedCloud: (id: string) => endPairedCloud(id),
}));

const status = (code: number, data?: string) =>
    Object.assign(new Error(String(code)), { response: { status: code, data } });
const revoked = () => status(403, '403 NOT ALLOWED - pairing revoked @doPostDelegateCloud(users/0)');

beforeEach(() => {
    jest.clearAllMocks();
    paired = [];
    reissueCloudTokens.mockResolvedValue({ cloudToken: { $site: { id: 'site-landed' } } });
    alignSessionSite.mockResolvedValue(undefined);
    reauthenticateActiveSocket.mockResolvedValue(undefined);
});

describe('checkPairedCloud', () => {
    it('keeps a cloud the relay still delegates, and moves its socket to the new tokens', async () => {
        await expect(checkPairedCloud('1000002')).resolves.toBe('kept');
        expect(reauthenticateActiveSocket).toHaveBeenCalledWith(expect.objectContaining({ slot: '1000002' }));
        expect(endPairedCloud).not.toHaveBeenCalled();
    });

    it('ends a cloud the relay refuses: tears its session down and ends the paired cloud', async () => {
        reissueCloudTokens.mockRejectedValue(revoked());

        await expect(checkPairedCloud('1000002')).resolves.toBe('ended');
        expect(onTerminalExpiry).toHaveBeenCalledWith('1000002');
        expect(endPairedCloud).toHaveBeenCalledWith('1000002');
    });

    it.each([
        ['a network error', new Error('Network Error')],
        ['a server error', status(502)],
        [
            'a 403 that says nothing of the pairing (stale relay credentials)',
            status(403, 'The security token is expired'),
        ],
    ])('changes nothing after %s', async (_label, error) => {
        reissueCloudTokens.mockRejectedValue(error);

        await expect(checkPairedCloud('1000002')).resolves.toBe('unknown');
        expect(onTerminalExpiry).not.toHaveBeenCalled();
        expect(endPairedCloud).not.toHaveBeenCalled();
    });
});

describe('reissuePairedCloud', () => {
    it('re-registers the socket and brings the committed cloud back to the selected place', async () => {
        await reissuePairedCloud('1000002');

        expect(reauthenticateActiveSocket).toHaveBeenCalledWith(expect.objectContaining({ slot: '1000002' }));
        expect(alignSessionSite).toHaveBeenCalledWith('1000002', 'site-landed');
    });

    it('does not fail when the socket cannot re-register', async () => {
        reauthenticateActiveSocket.mockRejectedValueOnce(new Error('socket down'));

        await expect(reissuePairedCloud('1000002')).resolves.toBeUndefined();
        expect(alignSessionSite).toHaveBeenCalled();
    });

    it('throws when the relay refuses the re-issue, touching nothing else', async () => {
        reissueCloudTokens.mockRejectedValueOnce(revoked());

        await expect(reissuePairedCloud('1000002')).rejects.toMatchObject({ response: { status: 403 } });
        expect(reauthenticateActiveSocket).not.toHaveBeenCalled();
    });
});

describe('checkPairedClouds', () => {
    it('checks each paired cloud and returns the ones that ended', async () => {
        paired = ['a', 'b', 'c'];
        const check = jest.fn(async (id: string): Promise<'ended' | 'kept'> => (id === 'b' ? 'ended' : 'kept'));

        await expect(checkPairedClouds(check)).resolves.toEqual(['b']);
        expect(check).toHaveBeenCalledTimes(3);
    });
});
