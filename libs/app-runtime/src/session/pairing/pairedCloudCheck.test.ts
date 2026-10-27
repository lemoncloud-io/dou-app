import { checkPairedCloud, checkPairedClouds } from './pairedCloudCheck';

const reissueCloudTokens = jest.fn();
const onTerminalExpiry = jest.fn();
const reauthenticateActiveSocket = jest.fn();
const remove = jest.fn();
let paired: string[] = [];

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../auth/cloudTokens', () => ({ reissueCloudTokens: (id: string) => reissueCloudTokens(id) }));
jest.mock('../../socket/auth/renewers', () => ({
    credentialRenewers: { forSlot: (key: string) => ({ onTerminalExpiry: () => onTerminalExpiry(key) }) },
}));
jest.mock('../../socket/auth/reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: (args: unknown) => reauthenticateActiveSocket(args),
}));
jest.mock('../../socket/auth/reauthDelegate', () => ({ createReauthDelegate: () => ({}) }));
jest.mock('../../socket/runtime', () => ({ getSocketManager: () => ({}) }));
jest.mock('../../socket/utils/slotKey', () => ({ slotKeyOf: (id: string) => id }));
jest.mock('./pairedClouds', () => ({ pairedClouds: { list: () => paired, remove: (id: string) => remove(id) } }));

const status = (code: number) => Object.assign(new Error(String(code)), { response: { status: code } });

beforeEach(() => {
    jest.clearAllMocks();
    paired = [];
    reissueCloudTokens.mockResolvedValue({});
    reauthenticateActiveSocket.mockResolvedValue(undefined);
});

describe('checkPairedCloud', () => {
    it('keeps a cloud the relay still delegates, and moves its socket to the new tokens', async () => {
        await expect(checkPairedCloud('1000002')).resolves.toBe('kept');
        expect(reauthenticateActiveSocket).toHaveBeenCalledWith(expect.objectContaining({ slot: '1000002' }));
        expect(remove).not.toHaveBeenCalled();
    });

    it('ends a cloud the relay refuses: tears its session down and drops it from the list', async () => {
        reissueCloudTokens.mockRejectedValue(status(403));

        await expect(checkPairedCloud('1000002')).resolves.toBe('ended');
        expect(onTerminalExpiry).toHaveBeenCalledWith('1000002');
        expect(remove).toHaveBeenCalledWith('1000002');
    });

    it.each([
        ['a network error', new Error('Network Error')],
        ['a server error', status(502)],
    ])('changes nothing after %s', async (_label, error) => {
        reissueCloudTokens.mockRejectedValue(error);

        await expect(checkPairedCloud('1000002')).resolves.toBe('unknown');
        expect(onTerminalExpiry).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
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
