import { renewCloudSession } from './renewCloudSession';
import { slotKeyOf } from '../utils/slotKey';

const mockReissue = jest.fn();
const mockReauthenticate = jest.fn();
const mockGetSocketManager = jest.fn();
const mockGetCommittedCloudId = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../session/auth/cloudTokens', () => ({
    reissueCommittedCloudTokens: (...args: unknown[]) => mockReissue(...args),
}));
jest.mock('../../session/store', () => ({
    getCommittedCloudId: (...args: unknown[]) => mockGetCommittedCloudId(...args),
}));
jest.mock('./reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: (...args: unknown[]) => mockReauthenticate(...args),
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

beforeEach(() => {
    jest.resetAllMocks();
    mockGetSocketManager.mockReturnValue({ manager: true });
    mockGetCommittedCloudId.mockReturnValue('cloud-1');
    mockReissue.mockResolvedValue(true);
    mockReauthenticate.mockResolvedValue(undefined);
});

describe('renewCloudSession', () => {
    it('스토어를 먼저 커밋하고 소켓이 따라간다 — 커밋된 cloud의 슬롯을 명시해서', async () => {
        await expect(renewCloudSession()).resolves.toBe(true);

        expect(mockReissue).toHaveBeenCalled();
        expect(mockReauthenticate).toHaveBeenCalledWith({
            manager: { manager: true },
            delegate: { delegate: true },
            slot: slotKeyOf('cloud-1'),
        });
        expect(mockReissue.mock.invocationCallOrder[0]).toBeLessThan(mockReauthenticate.mock.invocationCallOrder[0]);
    });

    it('leaves the socket alone when the re-issue succeeded but no cloud is committed', async () => {
        mockGetCommittedCloudId.mockReturnValue(null);

        await expect(renewCloudSession()).resolves.toBe(true);

        expect(mockReauthenticate).not.toHaveBeenCalled();
        // Skipped, but not silently: the store was renewed and the socket half was not attempted.
        expect(mockLoggerWarn).toHaveBeenCalledWith('SESSION', expect.stringContaining('re-registration skipped'));
    });

    it('커밋된 클라우드가 없으면 소켓을 건드리지 않는다', async () => {
        mockReissue.mockResolvedValue(false);

        await expect(renewCloudSession()).resolves.toBe(false);

        expect(mockReauthenticate).not.toHaveBeenCalled();
    });

    it('재발급 실패는 false로 보고하고 던지지 않는다 (relay 자격증명이 함께 상했을 때)', async () => {
        mockReissue.mockRejectedValue(new Error('403'));

        await expect(renewCloudSession()).resolves.toBe(false);

        expect(mockReauthenticate).not.toHaveBeenCalled();
        expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('소켓 재등록 실패는 갱신을 실패시키지 않는다 — HTTP는 이미 고쳐졌다', async () => {
        mockReauthenticate.mockRejectedValue(new Error('socket down'));

        await expect(renewCloudSession()).resolves.toBe(true);

        expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('동시 호출은 한 번의 교환으로 합쳐진다 (타이머 + 포그라운드 동시 발화)', async () => {
        let release: (value: boolean) => void = () => undefined;
        mockReissue.mockReturnValue(
            new Promise<boolean>(resolve => {
                release = resolve;
            })
        );

        const first = renewCloudSession();
        const second = renewCloudSession();
        release(true);

        await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
        expect(mockReissue).toHaveBeenCalledTimes(1);
        expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    });

    it('직전 호출이 끝난 뒤에는 다시 교환한다 — 단일 비행이 영구 잠금이 되면 안 된다', async () => {
        await renewCloudSession();
        await renewCloudSession();

        expect(mockReissue).toHaveBeenCalledTimes(2);
    });
});
