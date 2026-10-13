import { check, request, requestNotifications } from 'react-native-permissions';

import { PermissionService } from './PermissionService';

jest.mock('react-native', () => ({
    Platform: {
        OS: 'ios',
        Version: '17.0',
        select: <T>(options: { ios?: T; default?: T }): T | undefined => options.ios ?? options.default,
    },
}));

jest.mock('react-native-permissions', () => ({
    check: jest.fn(),
    checkNotifications: jest.fn(),
    request: jest.fn(),
    requestNotifications: jest.fn(),
    PERMISSIONS: {
        IOS: { CONTACTS: 'ios.contacts', CAMERA: 'ios.camera', PHOTO_LIBRARY: 'ios.photo', MICROPHONE: 'ios.mic' },
        ANDROID: { READ_CONTACTS: 'and.contacts', CAMERA: 'and.camera', READ_MEDIA_IMAGES: 'and.images' },
    },
    RESULTS: { GRANTED: 'granted', LIMITED: 'limited', DENIED: 'denied', BLOCKED: 'blocked' },
}));

const logger = { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as never;

describe('PermissionService check', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('treats LIMITED photo library access as granted', async () => {
        (check as jest.Mock).mockResolvedValue('limited');
        const service = new PermissionService(logger);

        await expect(service.check('PHOTO_LIBRARY')).resolves.toBe(true);
    });

    it('grants GRANTED access', async () => {
        (check as jest.Mock).mockResolvedValue('granted');
        const service = new PermissionService(logger);

        await expect(service.check('PHOTO_LIBRARY')).resolves.toBe(true);
    });

    it('still denies DENIED access', async () => {
        (check as jest.Mock).mockResolvedValue('denied');
        const service = new PermissionService(logger);

        await expect(service.check('PHOTO_LIBRARY')).resolves.toBe(false);
    });

    it('still denies BLOCKED access', async () => {
        (check as jest.Mock).mockResolvedValue('blocked');
        const service = new PermissionService(logger);

        await expect(service.check('PHOTO_LIBRARY')).resolves.toBe(false);
    });

});

describe('PermissionService request', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reports LIMITED access as GRANTED', async () => {
        (request as jest.Mock).mockResolvedValue('limited');
        const service = new PermissionService(logger);

        await expect(service.request('PHOTO_LIBRARY')).resolves.toBe('GRANTED');
    });

    it('reports a denial the OS will prompt for again as DENIED', async () => {
        (request as jest.Mock).mockResolvedValue('denied');
        const service = new PermissionService(logger);

        await expect(service.request('CAMERA')).resolves.toBe('DENIED');
    });

    // On Android the library's `check` never answers BLOCKED, so the blocked state has to come
    // from the request itself — a separate check after a denial always read DENIED there.
    it('reports BLOCKED from the request answer without a separate check', async () => {
        (request as jest.Mock).mockResolvedValue('blocked');
        (check as jest.Mock).mockResolvedValue('denied');
        const service = new PermissionService(logger);

        await expect(service.request('CAMERA')).resolves.toBe('BLOCKED');
    });

    it('reports blocked notifications as BLOCKED', async () => {
        (requestNotifications as jest.Mock).mockResolvedValue({ status: 'blocked' });
        const service = new PermissionService(logger);

        await expect(service.request('NOTIFICATIONS')).resolves.toBe('BLOCKED');
    });

    it('reports DENIED when the request throws', async () => {
        (request as jest.Mock).mockRejectedValue(new Error('boom'));
        const service = new PermissionService(logger);

        await expect(service.request('CAMERA')).resolves.toBe('DENIED');
    });
});
