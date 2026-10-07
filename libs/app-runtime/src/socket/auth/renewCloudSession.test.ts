import { renewCloudSession } from './renewCloudSession';
import { slotKeyOf } from '../utils/slotKey';

const mockReissue = jest.fn();
const mockReauthenticate = jest.fn();
const mockGetSocketManager = jest.fn();
const mockLoggerWarn = jest.fn();
const mockAlign = jest.fn();

jest.mock('../../session/auth/cloudTokens', () => ({
    reissueCloudTokens: (...args: unknown[]) => mockReissue(...args),
}));
jest.mock('./reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: (...args: unknown[]) => mockReauthenticate(...args),
}));
jest.mock('./alignSessionSite', () => ({
    alignSessionSite: (...args: unknown[]) => mockAlign(...args),
}));
jest.mock('./reauthDelegate', () => ({
    createReauthDelegate: () => ({ delegate: true }),
}));
jest.mock('../runtime', () => ({
    getSocketManager: (...args: unknown[]) => mockGetSocketManager(...args),
}));
jest.mock('@chatic/bridges', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
        error: jest.fn(),
    },
}));

const issued = {
    delegationToken: { cloudId: 'cloud-1' },
    cloudToken: { Token: { identityToken: 'fresh' }, $site: { id: 'site-picked-by-server' } },
};

beforeEach(() => {
    jest.resetAllMocks();
    mockGetSocketManager.mockReturnValue({ manager: true });
    mockReissue.mockResolvedValue(issued);
    mockReauthenticate.mockResolvedValue(undefined);
    mockAlign.mockResolvedValue(undefined);
});

describe('renewCloudSession', () => {
    it('re-issues the cloud it is given first, then re-registers THAT cloud’s slot', async () => {
        await expect(renewCloudSession('cloud-1')).resolves.toBe(true);

        expect(mockReissue).toHaveBeenCalledWith('cloud-1');
        expect(mockReauthenticate).toHaveBeenCalledWith({
            manager: { manager: true },
            delegate: { delegate: true },
            slot: slotKeyOf('cloud-1'),
        });
        expect(mockReissue.mock.invocationCallOrder[0]).toBeLessThan(mockReauthenticate.mock.invocationCallOrder[0]);
    });

    it('재발급 실패는 false로 보고하고 던지지 않는다 (relay 자격증명이 함께 상했을 때)', async () => {
        mockReissue.mockRejectedValue(new Error('403'));

        await expect(renewCloudSession('cloud-1')).resolves.toBe(false);

        expect(mockReauthenticate).not.toHaveBeenCalled();
        expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('소켓 재등록 실패는 갱신을 실패시키지 않는다 — HTTP는 이미 고쳐졌다', async () => {
        mockReauthenticate.mockRejectedValue(new Error('socket down'));

        await expect(renewCloudSession('cloud-1')).resolves.toBe(true);

        expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('동시 호출은 한 번의 교환으로 합쳐진다 (타이머 + 포그라운드 동시 발화)', async () => {
        let release: (value: typeof issued) => void = () => undefined;
        mockReissue.mockReturnValue(
            new Promise<typeof issued>(resolve => {
                release = resolve;
            })
        );

        const first = renewCloudSession('cloud-1');
        const second = renewCloudSession('cloud-1');
        release(issued);

        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
        expect(mockReissue).toHaveBeenCalledTimes(1);
        expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    });

    it('two different clouds renew side by side — the single flight is per cloud', async () => {
        let release: (value: typeof issued) => void = () => undefined;
        mockReissue.mockImplementation((cid: string) =>
            cid === 'cloud-1'
                ? new Promise<typeof issued>(resolve => {
                      release = resolve;
                  })
                : Promise.resolve(issued)
        );

        const first = renewCloudSession('cloud-1');
        await expect(renewCloudSession('cloud-2')).resolves.toBe(true);
        release(issued);
        await expect(first).resolves.toBe(true);

        expect(mockReissue).toHaveBeenCalledTimes(2);
        expect(mockReauthenticate).toHaveBeenCalledWith(expect.objectContaining({ slot: slotKeyOf('cloud-2') }));
    });

    it('직전 호출이 끝난 뒤에는 다시 교환한다 — 단일 비행이 영구 잠금이 되면 안 된다', async () => {
        await renewCloudSession('cloud-1');
        await renewCloudSession('cloud-1');

        expect(mockReissue).toHaveBeenCalledTimes(2);
    });
    it('after re-registering, checks the place the server re-issued for against the selection', async () => {
        await expect(renewCloudSession('cloud-1')).resolves.toBe(true);

        expect(mockAlign).toHaveBeenCalledWith('cloud-1', 'site-picked-by-server');
        expect(mockReauthenticate.mock.invocationCallOrder[0]).toBeLessThan(mockAlign.mock.invocationCallOrder[0]);
    });

    it('does not check the place when the re-issue failed', async () => {
        mockReissue.mockRejectedValue(new Error('403'));

        await renewCloudSession('cloud-1');

        expect(mockAlign).not.toHaveBeenCalled();
    });
});
