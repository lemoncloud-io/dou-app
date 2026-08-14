import { render } from '@testing-library/react';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useActiveCloudUnreads, useOtherCloudUnread } from '../../hooks';
import { UnreadBadgeRunner } from './UnreadBadgeRunner';

jest.mock('@chatic/web-core', () => ({ useSessionSelection: () => ({ selectedCloudId: 'cloud_1' }) }));
jest.mock('../../bridge/appBridge', () => ({ appBridge: { setBadgeCount: jest.fn() } }));
jest.mock('../../bridge/useHandleAppMessage', () => ({ useOnBackgroundStatusChanged: jest.fn() }));
jest.mock('../../hooks', () => ({
    useActiveCloudUnreads: jest.fn(),
    useOtherCloudUnread: jest.fn(),
}));

const setBadge = appBridge.setBadgeCount as jest.Mock;
const useBg = useOnBackgroundStatusChanged as jest.Mock;
const unreadsMock = useActiveCloudUnreads as jest.Mock;
const otherMock = useOtherCloudUnread as jest.Mock;
const refreshOther = jest.fn();

// Pull the latest foreground handler the component registered so tests can fire it directly.
const latestForegroundHandler = () => useBg.mock.calls[useBg.mock.calls.length - 1][0];

describe('UnreadBadgeRunner — 앱 뱃지 동기화', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        unreadsMock.mockReturnValue({ total: 3 });
        otherMock.mockReturnValue({ byCloud: { cloud_2: 2 }, total: 2, refresh: refreshOther });
    });

    it('활성 클라우드(관측) + 비활성 클라우드(캐시)를 더해 네이티브 뱃지로 push한다', () => {
        render(<UnreadBadgeRunner />);
        expect(setBadge).toHaveBeenCalledWith(5);
    });

    // 유령 뱃지의 정체: 비활성 클라우드 몫이 박제된 숫자였던 시절에는 전부 읽어도 그 값이 남았다.
    // 이제는 캐시에서 재계산되므로, 그쪽이 0이면 활성 값만 남는다.
    it('비활성 클라우드에 안읽음이 없으면 활성 클라우드 값만 남는다', () => {
        otherMock.mockReturnValue({ byCloud: {}, total: 0, refresh: refreshOther });

        render(<UnreadBadgeRunner />);

        expect(setBadge).toHaveBeenCalledWith(3);
    });

    it('전부 읽으면 뱃지가 0이 된다', () => {
        unreadsMock.mockReturnValue({ total: 0 });
        otherMock.mockReturnValue({ byCloud: {}, total: 0, refresh: refreshOther });

        render(<UnreadBadgeRunner />);

        expect(setBadge).toHaveBeenCalledWith(0);
    });

    // 활성 클라우드 수치가 움직였다는 것은 캐시가 바뀌었다는 앱의 유일한 힌트다. 그 박자에
    // 비활성 쪽도 다시 읽지 않으면, 백그라운드에서 동기화된 클라우드는 전환할 때까지 안 보인다.
    it('활성 클라우드 수치가 바뀌면 비활성 클라우드를 다시 읽는다', () => {
        const { rerender } = render(<UnreadBadgeRunner />);
        refreshOther.mockClear();

        unreadsMock.mockReturnValue({ total: 1 });
        rerender(<UnreadBadgeRunner />);

        expect(refreshOther).toHaveBeenCalled();
    });

    it('포그라운드 복귀 시 total이 그대로여도 다시 읽고 뱃지를 push해 네이티브 드리프트를 정정한다', () => {
        render(<UnreadBadgeRunner />);
        setBadge.mockClear();
        refreshOther.mockClear();

        latestForegroundHandler()({ data: { isForeground: true } });

        expect(refreshOther).toHaveBeenCalled();
        expect(setBadge).toHaveBeenCalledWith(5);
    });

    it('백그라운드 전환(isForeground=false)에는 뱃지를 push하지 않는다', () => {
        render(<UnreadBadgeRunner />);
        setBadge.mockClear();

        latestForegroundHandler()({ data: { isForeground: false } });

        expect(setBadge).not.toHaveBeenCalled();
    });
});
