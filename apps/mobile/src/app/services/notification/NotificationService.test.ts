import notifee from '@notifee/react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import { Platform } from 'react-native';

import { BadgeSyncBridge } from '../../bridge';
import { foregroundAPNsCopy, NotificationService } from './NotificationService';

// Mock every native import NotificationService pulls in at module load so the class can be
// instantiated under jsdom.
const mockPermissionCheck = jest.fn();
const mockPermissionRequest = jest.fn();
const mockMessagingRequest = jest.fn();
jest.mock('react-native', () => ({
    PermissionsAndroid: {
        PERMISSIONS: { POST_NOTIFICATIONS: 'post' },
        RESULTS: { GRANTED: 'granted' },
        check: (...args: unknown[]) => mockPermissionCheck(...args),
        request: (...args: unknown[]) => mockPermissionRequest(...args),
    },
    Platform: { OS: 'android', Version: 34 },
}));
jest.mock('@react-native-firebase/messaging', () => ({
    __esModule: true,
    default: jest.fn(() => ({
        onMessage: jest.fn(() => jest.fn()),
        requestPermission: () => mockMessagingRequest(),
    })),
    AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2, NOT_DETERMINED: -1 },
}));
jest.mock('@notifee/react-native', () => ({
    __esModule: true,
    default: { setBadgeCount: jest.fn().mockResolvedValue(undefined), getBadgeCount: jest.fn() },
    AndroidImportance: { HIGH: 4, LOW: 2, DEFAULT: 3 },
}));
jest.mock('@react-native-community/push-notification-ios', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn(), removeEventListener: jest.fn(), FetchResult: { NoData: 'NoData' } },
}));
jest.mock('../../bridge', () => ({ BadgeSyncBridge: { setBase: jest.fn().mockResolvedValue(undefined) } }));
// The real formatter (it only reads the locale tables); the utils entry point itself pulls in
// react-native-device-info, which jest cannot load.
let mockLanguage = 'ko';
jest.mock('../../utils', () => ({
    t: (key: string) => key,
    getEffectiveLanguage: () => mockLanguage,
    formatPushCopy: jest.requireActual('../../utils/i18n/formatPushCopy').formatPushCopy,
}));

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

describe('foregroundAPNsCopy', () => {
    beforeEach(() => {
        mockLanguage = 'ko';
    });

    it('builds an attachment body from loc_key and loc_args in the shell language', () => {
        const data = {
            loc_key: 'push_chat_images_body',
            loc_args: ['3'],
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };

        expect(foregroundAPNsCopy(data, 'chat', '')).toEqual({ title: 'Raine', body: '사진 3장을 보냈습니다' });

        mockLanguage = 'en';
        expect(foregroundAPNsCopy(data, 'chat', '')).toEqual({ title: 'Raine', body: 'Sent 3 photos' });
    });

    // Today's payload for an attachment-only message: the APNs alert body is empty and the text key
    // has no args, so both the old and the naive reading would show nothing or "{0}".
    it('shows the fallback copy for a text key that arrived without its arg', () => {
        expect(foregroundAPNsCopy({ loc_key: 'push_chat_message_body' }, 'Raine', '').body).toBe('새 메시지');
    });

    it('keeps the APNs alert for a payload with no loc keys', () => {
        expect(foregroundAPNsCopy({}, 'Test title', 'Test body')).toEqual({ title: 'Test title', body: 'Test body' });
    });

    it('keeps the APNs alert title when the title template formats to nothing', () => {
        expect(foregroundAPNsCopy({ title_loc_key: 'push_chat_message_title' }, 'chat', 'x').title).toBe('chat');
    });

    // The server sends silent pushes with the same loc keys and no alert; the web drops a push with
    // neither title nor body, so building copy here would turn it into a banner.
    it('leaves a silent push without copy', () => {
        const data = {
            loc_key: 'push_chat_image_body',
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };

        expect(foregroundAPNsCopy({ ...data, silent: true }, undefined, undefined)).toEqual({
            title: undefined,
            body: undefined,
        });
        expect(foregroundAPNsCopy({ ...data, silent: 'true' }, undefined, undefined)).toEqual({
            title: undefined,
            body: undefined,
        });
        expect(foregroundAPNsCopy({ ...data, silent: false }, undefined, undefined).body).toBe('사진을 보냈습니다');
    });

    it('reads the camelCase aliases the extension also accepts', () => {
        const data = { bodyLocKey: 'push_chat_files_body', bodyLocArgs: '["2"]' };

        expect(foregroundAPNsCopy(data, 'Raine', '').body).toBe('파일 2개를 보냈습니다');
    });
});

describe('NotificationService onMessage — iOS foreground', () => {
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as never;
    const addEventListener = PushNotificationIOS.addEventListener as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLanguage = 'en';
        (Platform as { OS: string }).OS = 'ios';
    });

    afterEach(() => {
        (Platform as { OS: string }).OS = 'android';
    });

    it('hands the callback the copy built from the payload, not the bare APNs alert', () => {
        const callback = jest.fn();
        new NotificationService(logger).onMessage(callback);
        const [event, handleAPNs] = addEventListener.mock.calls[0];
        const data = {
            loc_key: 'push_chat_image_body',
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };
        const finish = jest.fn();

        handleAPNs({ getTitle: () => 'chat', getMessage: () => '', getData: () => data, finish });

        expect(event).toBe('notification');
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({ notification: { title: 'Raine', body: 'Sent a photo' }, data })
        );
        expect(finish).toHaveBeenCalledWith('NoData');
    });
});

describe('NotificationService permission prompt', () => {
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as never;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPermissionRequest.mockResolvedValue('granted');
        mockMessagingRequest.mockResolvedValue(1);
    });

    it('waits for the launch splash before raising the OS prompt', async () => {
        mockPermissionCheck.mockResolvedValue(false);
        let lift!: () => void;
        const beforePrompt = jest.fn(() => new Promise<void>(resolve => (lift = resolve)));
        const service = new NotificationService(logger, beforePrompt);

        const result = service.requestPermission();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(beforePrompt).toHaveBeenCalledTimes(1);
        expect(mockPermissionRequest).not.toHaveBeenCalled();

        lift();
        await expect(result).resolves.toBe(true);
        expect(mockPermissionRequest).toHaveBeenCalledTimes(1);
    });

    it('does not wait when the permission is already decided, since no prompt will show', async () => {
        mockPermissionCheck.mockResolvedValue(true);
        const beforePrompt = jest.fn(() => Promise.resolve());
        const service = new NotificationService(logger, beforePrompt);

        await expect(service.requestPermission()).resolves.toBe(true);
        expect(beforePrompt).not.toHaveBeenCalled();
    });
});
