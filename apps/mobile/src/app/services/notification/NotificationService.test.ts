import notifee from '@notifee/react-native';

import { BadgeSyncBridge } from '../../bridge';
import { NotificationService } from './NotificationService';

// Mock every native import NotificationService pulls in at module load so the class can be
// instantiated under jsdom. Only the badge path is exercised here.
jest.mock('react-native', () => ({ PermissionsAndroid: {}, Platform: { OS: 'android' } }));
jest.mock('@react-native-firebase/messaging', () => ({
    __esModule: true,
    default: jest.fn(() => ({})),
    AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
}));
jest.mock('@notifee/react-native', () => ({
    __esModule: true,
    default: { setBadgeCount: jest.fn().mockResolvedValue(undefined), getBadgeCount: jest.fn() },
    AndroidImportance: { HIGH: 4, LOW: 2, DEFAULT: 3 },
}));
jest.mock('@react-native-community/push-notification-ios', () => ({ __esModule: true, default: {} }));
jest.mock('../../bridge', () => ({ BadgeSyncBridge: { setBase: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../utils', () => ({ t: (key: string) => key }));

const notifeeSetBadge = notifee.setBadgeCount as jest.Mock;
const setBaseMock = BadgeSyncBridge.setBase as jest.Mock;

describe('NotificationService 뱃지 — 네이티브 base 동기화', () => {
    // Minimal ILogService stand-in; only error() is touched on failure paths.
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as never;
    let service: NotificationService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new NotificationService(logger);
    });

    it('setBadgeCount는 notifee와 네이티브 base를 같은 값으로 갱신한다', async () => {
        await service.setBadgeCount(7);
        expect(notifeeSetBadge).toHaveBeenCalledWith(7);
        expect(setBaseMock).toHaveBeenCalledWith(7);
    });

    it('clearBadge는 notifee와 네이티브 base를 모두 0으로 되돌린다', async () => {
        await service.clearBadge();
        expect(notifeeSetBadge).toHaveBeenCalledWith(0);
        expect(setBaseMock).toHaveBeenCalledWith(0);
    });
});
