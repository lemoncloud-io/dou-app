import { appBridge } from '../../bridge/appBridge';
import { nativeBadgeReader } from './nativeBadgeReader';

const mockIsNative = jest.fn((): boolean => true);
let mockPlatform: string | undefined;
// The host's `appShell` port: the app runs the frame where `mockIsNative()`, and its `os` is the
// platform the shell injected, lower-cased, as `@chatic/host` resolves it.
jest.mock('@chatic/host', () => ({
    host: {
        get ports() {
            const kind = mockIsNative() ? 'shell' : 'browser';
            const platform = mockPlatform?.toLowerCase();
            const os = kind === 'shell' && (platform === 'ios' || platform === 'android') ? platform : null;
            return { appShell: { kind, os } };
        },
    },
}));
jest.mock('../../bridge/appBridge', () => ({
    appBridge: { fetchBadgeCount: jest.fn(), fetchBadgeBase: jest.fn() },
}));

const fetchCount = appBridge.fetchBadgeCount as jest.Mock;
const fetchBase = appBridge.fetchBadgeBase as jest.Mock;

const setPlatform = (platform?: string) => {
    mockPlatform = platform;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockIsNative.mockReturnValue(true);
    setPlatform('ios');
});

describe('nativeBadgeReader — 기기가 실제로 보여주는 뱃지', () => {
    it('네이티브가 아니면 null이다 — 브라우저에는 아이콘 뱃지가 없다', async () => {
        mockIsNative.mockReturnValue(false);

        await expect(nativeBadgeReader.read()).resolves.toBeNull();
        expect(fetchCount).not.toHaveBeenCalled();
        expect(fetchBase).not.toHaveBeenCalled();
    });

    describe('iOS', () => {
        it('아이콘 값을 그대로 읽는다', async () => {
            fetchCount.mockResolvedValue({ success: true, data: { count: 4 } });

            await expect(nativeBadgeReader.read()).resolves.toBe(4);
            expect(fetchBase).not.toHaveBeenCalled();
        });

        it('조회가 실패하면 null이다 — 0으로 위장하지 않는다', async () => {
            fetchCount.mockRejectedValue(new Error('timeout'));

            await expect(nativeBadgeReader.read()).resolves.toBeNull();
        });
    });

    describe('Android', () => {
        beforeEach(() => setPlatform('android'));

        // notifee's badge API is iOS-only, so on Android the real value lives only in the shared counter.
        it('공유 카운터를 읽는다 — notifee 쪽은 쓰지 않는다', async () => {
            fetchBase.mockResolvedValue({ success: true, data: { base: 6 } });

            await expect(nativeBadgeReader.read()).resolves.toBe(6);
            expect(fetchCount).not.toHaveBeenCalled();
        });

        it('셸이 답을 모른다고 하면(base=null) null이다', async () => {
            fetchBase.mockResolvedValue({ success: true, data: { base: null } });

            await expect(nativeBadgeReader.read()).resolves.toBeNull();
        });

        // Since the web ships ahead of the app, there are shells out there that don't know this message.
        // The facade returns the raw response as-is, so a rejection can arrive as success:false instead of an exception.
        it('셸이 success:false로 답하면 null이다', async () => {
            fetchBase.mockResolvedValue({ success: false, error: { code: 'BADGE_ERROR' } });

            await expect(nativeBadgeReader.read()).resolves.toBeNull();
        });

        it('asks again after a failed read', async () => {
            fetchBase
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValueOnce({ success: true, data: { base: 2 } });

            await expect(nativeBadgeReader.read()).resolves.toBeNull();
            await expect(nativeBadgeReader.read()).resolves.toBe(2);
        });
    });
});
