import { act, render } from '@testing-library/react';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useActiveCloudUnreads, useOtherCloudUnread } from '../../hooks';
import { divergenceReporter } from '../../runtime/logging/divergenceReporter';
import { UnreadBadgeRunner } from './UnreadBadgeRunner';

const mockReadBadge = jest.fn();
let mockIconBadge = true;
jest.mock('@chatic/runtime-react', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        get appShell() {
            return { ...browserAppShell(), iconBadge: mockIconBadge ? { read: () => mockReadBadge() } : null };
        },
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'cloud_1' }),
        },
    });
});
jest.mock('../../bridge/appBridge', () => ({ appBridge: { setBadgeCount: jest.fn() } }));
jest.mock('../../bridge/useHandleAppMessage', () => ({ useOnBackgroundStatusChanged: jest.fn() }));
jest.mock('../../runtime/logging/divergenceReporter', () => ({ divergenceReporter: { badge: jest.fn() } }));
jest.mock('../../hooks', () => ({
    useActiveCloudUnreads: jest.fn(),
    useOtherCloudUnread: jest.fn(),
}));

const setBadge = appBridge.setBadgeCount as jest.Mock;
const useBg = useOnBackgroundStatusChanged as jest.Mock;
const unreadsMock = useActiveCloudUnreads as jest.Mock;
const otherMock = useOtherCloudUnread as jest.Mock;
const fetchBadge = mockReadBadge;
const badgeDivergence = divergenceReporter.badge as jest.Mock;

const latestForegroundHandler = () => useBg.mock.calls[useBg.mock.calls.length - 1][0];

describe('UnreadBadgeRunner — 앱 뱃지 동기화', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIconBadge = true;
        mockReadBadge.mockResolvedValue(null);
        unreadsMock.mockReturnValue({ total: 3 });
        otherMock.mockReturnValue({ byCloud: { cloud_2: 2 }, total: 2 });
    });

    it('활성 클라우드(관측) + 비활성 클라우드(캐시)를 더해 네이티브 뱃지로 push한다', () => {
        render(<UnreadBadgeRunner />);
        expect(setBadge).toHaveBeenCalledWith(5);
    });

    it('비활성 클라우드에 안읽음이 없으면 활성 클라우드 값만 남는다', () => {
        otherMock.mockReturnValue({ byCloud: {}, total: 0 });

        render(<UnreadBadgeRunner />);

        expect(setBadge).toHaveBeenCalledWith(3);
    });

    it('전부 읽으면 뱃지가 0이 된다', () => {
        unreadsMock.mockReturnValue({ total: 0 });
        otherMock.mockReturnValue({ byCloud: {}, total: 0 });

        render(<UnreadBadgeRunner />);

        expect(setBadge).toHaveBeenCalledWith(0);
    });

    it("pushes again when another cloud's count moves while the active one stays put", () => {
        const { rerender } = render(<UnreadBadgeRunner />);
        setBadge.mockClear();

        otherMock.mockReturnValue({ byCloud: { cloud_2: 4 }, total: 4 });
        rerender(<UnreadBadgeRunner />);

        expect(setBadge).toHaveBeenCalledWith(7);
    });

    it('포그라운드 복귀 시 total이 그대로여도 다시 읽고 뱃지를 push해 네이티브 드리프트를 정정한다', () => {
        render(<UnreadBadgeRunner />);
        setBadge.mockClear();

        latestForegroundHandler()({ data: { isForeground: true } });

        expect(setBadge).toHaveBeenCalledWith(5);
    });

    it('백그라운드 전환(isForeground=false)에는 뱃지를 push하지 않는다', () => {
        render(<UnreadBadgeRunner />);
        setBadge.mockClear();

        latestForegroundHandler()({ data: { isForeground: false } });

        expect(setBadge).not.toHaveBeenCalled();
    });

    describe('뱃지 정합성 대조 (ADR-0099)', () => {
        beforeEach(() => fetchBadge.mockResolvedValue(null));

        it('첫 push 전에 아이콘 값을 읽어 곧 쓸 총합과 대조한다', async () => {
            fetchBadge.mockResolvedValue(2);
            unreadsMock.mockReturnValue({ total: 0 });
            otherMock.mockReturnValue({ byCloud: {}, total: 0 });

            await act(async () => {
                render(<UnreadBadgeRunner />);
            });

            expect(badgeDivergence).toHaveBeenCalledWith({ web: 0, native: 2, active: 0, others: 0 });
        });

        it('포그라운드 복귀 시 마지막으로 push한 값과 대조한다', async () => {
            await act(async () => {
                render(<UnreadBadgeRunner />);
            });
            badgeDivergence.mockClear();
            fetchBadge.mockResolvedValue(9);

            await act(async () => {
                latestForegroundHandler()({ data: { isForeground: true } });
            });

            expect(badgeDivergence).toHaveBeenCalledWith({ web: 5, native: 9, active: 3, others: 2 });
        });

        it('reports the icon as unknown where the frame has no icon badge to read', async () => {
            mockIconBadge = false;

            await act(async () => {
                render(<UnreadBadgeRunner />);
            });

            expect(fetchBadge).not.toHaveBeenCalled();
            expect(badgeDivergence).toHaveBeenCalledWith({ web: 5, native: null, active: 3, others: 2 });
        });

        it('total이 바뀔 때마다 대조하지는 않는다 (fire-and-forget 쓰기와 경합한다)', async () => {
            const { rerender } = await act(async () => render(<UnreadBadgeRunner />));
            badgeDivergence.mockClear();

            unreadsMock.mockReturnValue({ total: 7 });
            await act(async () => {
                rerender(<UnreadBadgeRunner />);
            });

            expect(badgeDivergence).not.toHaveBeenCalled();
        });
    });
});
