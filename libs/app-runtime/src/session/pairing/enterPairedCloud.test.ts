import { enterPairedCloud } from './enterPairedCloud';

const calls: string[] = [];
let inFlight = false;
const issueCloudTokens = jest.fn(async (id: string) => void calls.push(`join:${id}`));
const reissuePairedCloud = jest.fn(async (id: string) => void calls.push(`reissue:${id}`));
const switchCloud = jest.fn(async (id: string) => void calls.push(`switch:${id}`));
const add = jest.fn((id: string) => void calls.push(`add:${id}`));

jest.mock('../auth/cloudTokens', () => ({
    isExchangeInFlight: () => inFlight,
    issueCloudTokens: (id: string) => issueCloudTokens(id),
}));
jest.mock('./pairedCloudCheck', () => ({ reissuePairedCloud: (id: string) => reissuePairedCloud(id) }));
jest.mock('./pairedClouds', () => ({ pairedClouds: { add: (id: string) => add(id) } }));

const status = (code: number) => Object.assign(new Error(String(code)), { response: { status: code } });

beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    inFlight = false;
});

describe('enterPairedCloud', () => {
    it('re-issues through the delegation before switching, so the switch cannot replay older tokens', async () => {
        await enterPairedCloud('1000004', switchCloud);

        expect(calls).toEqual(['reissue:1000004', 'switch:1000004', 'add:1000004']);
    });

    it('lets an exchange that began before the approval finish, then re-issues its own', async () => {
        inFlight = true;

        await enterPairedCloud('1000004', switchCloud);

        expect(calls).toEqual(['join:1000004', 'reissue:1000004', 'switch:1000004', 'add:1000004']);
    });

    it('re-issues even when the exchange it waited for failed', async () => {
        inFlight = true;
        issueCloudTokens.mockRejectedValueOnce(new Error('network'));

        await enterPairedCloud('1000004', switchCloud);

        expect(reissuePairedCloud).toHaveBeenCalledWith('1000004');
        expect(add).toHaveBeenCalledWith('1000004');
    });

    it('neither switches nor remembers the cloud when the relay refuses the delegation', async () => {
        reissuePairedCloud.mockRejectedValueOnce(status(403));

        await expect(enterPairedCloud('1000004', switchCloud)).rejects.toMatchObject({ response: { status: 403 } });
        expect(switchCloud).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
    });

    it('does not remember the cloud when the switch fails', async () => {
        switchCloud.mockRejectedValueOnce(new Error('switch failed'));

        await expect(enterPairedCloud('1000004', switchCloud)).rejects.toThrow('switch failed');
        expect(add).not.toHaveBeenCalled();
    });
});
