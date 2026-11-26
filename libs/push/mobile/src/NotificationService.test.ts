import notifee from '@notifee/react-native';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import { Platform } from 'react-native';

import { foregroundAPNsCopy, NotificationService } from './NotificationService';
import type { NotificationServiceOptions, PushCopyLocalizer } from './types';

const mockPermissionCheck = jest.fn();
const mockPermissionRequest = jest.fn();
const mockMessagingRequest = jest.fn();
const mockGetInitialNotification = jest.fn(async (..._args: unknown[]) => null);
const mockApnsGetInitial = jest.fn(async (..._args: unknown[]) => null);
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
        getInitialNotification: (...args: unknown[]) => mockGetInitialNotification(...args),
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
    default: {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        FetchResult: { NoData: 'NoData' },
        getInitialNotification: (...args: unknown[]) => mockApnsGetInitial(...args),
    },
}));

const COPY: Record<string, string> = {
    push_chat_message_title: '{0}',
    push_chat_image_body: 'Sent a photo',
    push_chat_images_body: 'Sent {0} photos',
};

const fakeLocalize: PushCopyLocalizer = (locKey, locArgs) => {
    const args = Array.isArray(locArgs) ? locArgs.map(String) : [];
    return (COPY[locKey] ?? locKey).replace(/\{(\d+)\}/g, (_, index: string) => args[Number(index)] ?? '');
};

const setBaseMock = jest.fn().mockResolvedValue(undefined);

const options = (overrides: Partial<NotificationServiceOptions> = {}): NotificationServiceOptions => ({
    copy: { channelName: channel => `channel.${channel}`, localize: fakeLocalize },
    badgeMirror: { setBase: setBaseMock },
    ...overrides,
});

const notifeeSetBadge = notifee.setBadgeCount as jest.Mock;

describe('NotificationService badge — native base mirror', () => {
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    let service: NotificationService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new NotificationService(logger, options());
    });

    it('setBadgeCount writes the same count to notifee and the badge mirror', async () => {
        await service.setBadgeCount(7);
        expect(notifeeSetBadge).toHaveBeenCalledWith(7);
        expect(setBaseMock).toHaveBeenCalledWith(7);
    });

    it('clearBadge resets notifee and the badge mirror to 0', async () => {
        await service.clearBadge();
        expect(notifeeSetBadge).toHaveBeenCalledWith(0);
        expect(setBaseMock).toHaveBeenCalledWith(0);
    });
});

describe('foregroundAPNsCopy', () => {
    it('builds the title and body from the loc keys and args through the localizer', () => {
        const localize = jest.fn(fakeLocalize);
        const data = {
            loc_key: 'push_chat_images_body',
            loc_args: ['3'],
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };

        expect(foregroundAPNsCopy(data, 'chat', '', localize)).toEqual({ title: 'Raine', body: 'Sent 3 photos' });
        expect(localize).toHaveBeenCalledWith('push_chat_message_title', ['Raine'], 'title');
        expect(localize).toHaveBeenCalledWith('push_chat_images_body', ['3'], 'body');
    });

    it('keeps the APNs alert for a payload with no loc keys, without asking the localizer', () => {
        const localize = jest.fn(fakeLocalize);

        expect(foregroundAPNsCopy({}, 'Test title', 'Test body', localize)).toEqual({
            title: 'Test title',
            body: 'Test body',
        });
        expect(localize).not.toHaveBeenCalled();
    });

    it('keeps the APNs alert title when the title template formats to nothing', () => {
        expect(foregroundAPNsCopy({ title_loc_key: 'push_chat_message_title' }, 'chat', 'x', fakeLocalize).title).toBe(
            'chat'
        );
    });

    it('leaves a silent push without copy', () => {
        const data = {
            loc_key: 'push_chat_image_body',
            title_loc_key: 'push_chat_message_title',
            title_loc_args: ['Raine'],
        };

        expect(foregroundAPNsCopy({ ...data, silent: true }, undefined, undefined, fakeLocalize)).toEqual({
            title: undefined,
            body: undefined,
        });
        expect(foregroundAPNsCopy({ ...data, silent: 'true' }, undefined, undefined, fakeLocalize)).toEqual({
            title: undefined,
            body: undefined,
        });
        expect(foregroundAPNsCopy({ ...data, silent: false }, undefined, undefined, fakeLocalize).body).toBe(
            'Sent a photo'
        );
    });

    it('reads the camelCase aliases the extension also accepts', () => {
        const localize = jest.fn(fakeLocalize);
        const data = {
            bodyLocKey: 'push_chat_files_body',
            bodyLocArgs: '["2"]',
            titleLocKey: 'push_chat_message_title',
        };

        foregroundAPNsCopy(data, 'Raine', '', localize);

        expect(localize).toHaveBeenCalledWith('push_chat_files_body', '["2"]', 'body');
        expect(localize).toHaveBeenCalledWith('push_chat_message_title', undefined, 'title');
    });
});

describe('NotificationService onMessage — iOS foreground', () => {
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    const addEventListener = PushNotificationIOS.addEventListener as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        (Platform as { OS: string }).OS = 'ios';
    });

    afterEach(() => {
        (Platform as { OS: string }).OS = 'android';
    });

    it('hands the callback the copy built from the payload, not the bare APNs alert', () => {
        const callback = jest.fn();
        new NotificationService(logger, options()).onMessage(callback);
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
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        mockPermissionRequest.mockResolvedValue('granted');
        mockMessagingRequest.mockResolvedValue(1);
    });

    it('waits for the launch splash before raising the OS prompt', async () => {
        mockPermissionCheck.mockResolvedValue(false);
        let lift!: () => void;
        const beforePrompt = jest.fn(() => new Promise<void>(resolve => (lift = resolve)));
        const service = new NotificationService(logger, options({ beforePrompt }));

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
        const service = new NotificationService(logger, options({ beforePrompt }));

        await expect(service.requestPermission()).resolves.toBe(true);
        expect(beforePrompt).not.toHaveBeenCalled();
    });
});

describe('NotificationService cold-start capture', () => {
    const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() };
    let service: NotificationService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetInitialNotification.mockResolvedValue(null);
        mockApnsGetInitial.mockResolvedValue(null);
        service = new NotificationService(logger, options());
    });

    it('returns null and logs when the FCM cold-start lookup rejects', async () => {
        mockGetInitialNotification.mockRejectedValueOnce(new Error('fcm not ready'));

        await expect(service.getInitialNotification()).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledWith('NOTIFICATION', 'Get initial notification error.', expect.anything());
    });

    it('returns null and logs when the iOS cold-start lookup throws', async () => {
        (Platform as unknown as { OS: string }).OS = 'ios';
        try {
            mockApnsGetInitial.mockRejectedValueOnce(new Error('no bridge'));

            await expect(service.getInitialNotification()).resolves.toBeNull();
            expect(logger.error).toHaveBeenCalledWith(
                'NOTIFICATION',
                'Get initial notification error.',
                expect.anything()
            );
        } finally {
            (Platform as unknown as { OS: string }).OS = 'android';
        }
    });

    it('names each channel with the copy it was handed', async () => {
        const notifeeModule = jest.requireMock('@notifee/react-native').default;
        notifeeModule.createChannel = jest.fn().mockResolvedValue(undefined);

        await service.createNotificationChannel();

        expect(
            notifeeModule.createChannel.mock.calls.map(([channel]: [{ id: string; name: string }]) => channel)
        ).toEqual([
            expect.objectContaining({ id: 'dou_chat', name: 'channel.chat', importance: 4 }),
            expect.objectContaining({ id: 'dou_chat_muted', name: 'channel.chat', importance: 2 }),
            expect.objectContaining({ id: 'dou_notice', name: 'channel.notice', importance: 3 }),
            expect.objectContaining({ id: 'dou_marketing', name: 'channel.marketing', importance: 2 }),
            expect.objectContaining({ id: 'dou_cloud', name: 'channel.cloud', importance: 4 }),
        ]);
    });

    it('logs and resolves when creating notification channels fails', async () => {
        const notifeeModule = jest.requireMock('@notifee/react-native').default;
        notifeeModule.createChannel = jest.fn().mockRejectedValue(new Error('oem'));

        await expect(service.createNotificationChannel()).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith('NOTIFICATION', 'Create channel error.', expect.anything());
    });
});
