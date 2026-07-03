import { render } from '@testing-library/react';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useChannelUnreads } from './hooks';
import { sumSnapshot, writeCloudUnread } from './lib';
import { UnreadBadgeRunner } from './UnreadBadgeRunner';

jest.mock('@chatic/web-core', () => ({ useSessionSelection: () => ({ selectedCloudId: 'cloud_1' }) }));
jest.mock('../../bridge/appBridge', () => ({ appBridge: { setBadgeCount: jest.fn() } }));
jest.mock('../../bridge/useHandleAppMessage', () => ({ useOnBackgroundStatusChanged: jest.fn() }));
jest.mock('./hooks', () => ({
    useActiveCloudChannels: () => [],
    useChannelUnreads: jest.fn(),
}));
jest.mock('./lib', () => ({
    writeCloudUnread: jest.fn(() => ({ cloud_1: 3 })),
    sumSnapshot: jest.fn(() => 3),
}));

const setBadge = appBridge.setBadgeCount as jest.Mock;
const useBg = useOnBackgroundStatusChanged as jest.Mock;
const unreadsMock = useChannelUnreads as jest.Mock;

// Pull the latest foreground handler the component registered so tests can fire it directly.
const latestForegroundHandler = () => useBg.mock.calls[useBg.mock.calls.length - 1][0];

describe('UnreadBadgeRunner — 앱 뱃지 동기화', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        unreadsMock.mockReturnValue({ total: 3 });
    });

    it('마운트 시 활성 클라우드 total을 스냅샷에 쓰고 합계를 네이티브 뱃지로 push한다', () => {
        render(<UnreadBadgeRunner />);
        expect(writeCloudUnread).toHaveBeenCalledWith('cloud_1', 3);
        expect(setBadge).toHaveBeenCalledWith(3);
    });

    it('포그라운드 복귀 시 total이 그대로여도 뱃지를 다시 push해 네이티브 드리프트를 정정한다', () => {
        render(<UnreadBadgeRunner />);
        setBadge.mockClear();

        latestForegroundHandler()({ data: { isForeground: true } });

        expect(sumSnapshot).toHaveBeenCalled();
        expect(setBadge).toHaveBeenCalledWith(3);
    });

    it('백그라운드 전환(isForeground=false)에는 뱃지를 push하지 않는다', () => {
        render(<UnreadBadgeRunner />);
        setBadge.mockClear();

        latestForegroundHandler()({ data: { isForeground: false } });

        expect(setBadge).not.toHaveBeenCalled();
    });
});
