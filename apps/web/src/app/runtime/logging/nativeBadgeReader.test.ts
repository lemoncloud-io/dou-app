import { isNative } from '@chatic/bridges';

import { appBridge } from '../../bridge/appBridge';
import { nativeBadgeReader } from './nativeBadgeReader';

jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('../../bridge/appBridge', () => ({
    appBridge: { fetchBadgeCount: jest.fn(), fetchBadgeBase: jest.fn() },
}));

const isNativeMock = isNative as jest.Mock;
const fetchCount = appBridge.fetchBadgeCount as jest.Mock;
const fetchBase = appBridge.fetchBadgeBase as jest.Mock;

const setPlatform = (platform?: string) => {
    if (platform === undefined) delete window.CHATIC_APP_PLATFORM;
    else window.CHATIC_APP_PLATFORM = platform;
};

beforeEach(() => {
    jest.clearAllMocks();
    nativeBadgeReader.reset();
    isNativeMock.mockReturnValue(true);
    setPlatform('ios');
});

describe('nativeBadgeReader — 기기가 실제로 보여주는 뱃지', () => {
    it('네이티브가 아니면 null이다 — 브라우저에는 아이콘 뱃지가 없다', async () => {
        isNativeMock.mockReturnValue(false);

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

        it('NOT_FOUND를 한 번 받으면 세션 내내 다시 묻지 않는다', async () => {
            fetchBase.mockRejectedValue({ code: 'NOT_FOUND' });

            await expect(nativeBadgeReader.read()).resolves.toBeNull();
            await expect(nativeBadgeReader.read()).resolves.toBeNull();

            expect(fetchBase).toHaveBeenCalledTimes(1);
        });

        // Learning a timeout as a capability verdict would let one slow round trip silence the whole session.
        it('일시적 실패는 학습하지 않고 다음에 다시 묻는다', async () => {
            fetchBase
                .mockRejectedValueOnce(new Error('timeout'))
                .mockResolvedValueOnce({ success: true, data: { base: 2 } });

            await expect(nativeBadgeReader.read()).resolves.toBeNull();
            await expect(nativeBadgeReader.read()).resolves.toBe(2);
        });
    });
});
