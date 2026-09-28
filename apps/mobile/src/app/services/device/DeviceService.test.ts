import Contacts from 'react-native-contacts';
import { PermissionsAndroid, Platform } from 'react-native';

import { DeviceService } from './DeviceService';

// Mock every native import DeviceService pulls in at module load so the class can be instantiated
// under jsdom. Only the contacts path is exercised here (ADR-0099).
jest.mock('react-native', () => ({
    Linking: { openURL: jest.fn() },
    PermissionsAndroid: {
        check: jest.fn(),
        request: jest.fn(),
        PERMISSIONS: { READ_CONTACTS: 'READ_CONTACTS' },
        RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    },
    Platform: { OS: 'ios' },
    Share: { share: jest.fn() },
}));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(), types: {} }));
jest.mock('react-native-contacts', () => ({
    __esModule: true,
    default: { getAllWithoutPhotos: jest.fn(), checkPermission: jest.fn() },
}));

const getAll = Contacts.getAllWithoutPhotos as jest.Mock;
const checkPermission = Contacts.checkPermission as jest.Mock;

/** A contact with only the name fields this check reads. */
const contact = (name: Partial<{ displayName: string; givenName: string; familyName: string }>) =>
    ({ displayName: null, givenName: null, familyName: '', ...name }) as never;

describe('DeviceService.getContacts — 부분 결과 기록', () => {
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    let service: DeviceService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DeviceService(logger as never);
    });

    it('전부 이름이 있으면 모양을 info로 남긴다', async () => {
        getAll.mockResolvedValue([contact({ displayName: '가' }), contact({ givenName: '나' })]);

        await service.getContacts();

        expect(logger.info).toHaveBeenCalledWith('DEVICE', 'contacts read — 2/2 named', {
            observation: 'contacts-shape',
            total: 2,
            named: 2,
            nameless: 0,
        });
        expect(logger.warn).not.toHaveBeenCalled();
    });

    // Shape of #15: the fetch succeeds but some entries have no name — there's no exception, so it's not caught by the failure trigger.
    it('이름 없는 항목이 있으면 warn으로 올린다', async () => {
        getAll.mockResolvedValue([contact({ displayName: '가' }), contact({}), contact({})]);

        await service.getContacts();

        expect(logger.warn).toHaveBeenCalledWith('DEVICE', 'contacts read — 1/3 named', {
            observation: 'contacts-shape',
            total: 3,
            named: 1,
            nameless: 2,
        });
    });

    it('성만 있어도 이름 있는 것으로 센다', async () => {
        getAll.mockResolvedValue([contact({ familyName: '김' })]);

        await service.getContacts();

        expect(logger.info).toHaveBeenCalledWith('DEVICE', 'contacts read — 1/1 named', expect.anything());
    });

    it('이름·번호 원문은 엔트리에 싣지 않는다', async () => {
        getAll.mockResolvedValue([contact({ displayName: '비밀연락처' })]);

        await service.getContacts();

        expect(JSON.stringify(logger.info.mock.calls)).not.toContain('비밀연락처');
    });

    it('빈 목록도 모양을 남긴다 — 권한과 데이터 문제를 가르는 값이다', async () => {
        getAll.mockResolvedValue([]);

        await service.getContacts();

        expect(logger.info).toHaveBeenCalledWith('DEVICE', 'contacts read — 0/0 named', {
            observation: 'contacts-shape',
            total: 0,
            named: 0,
            nameless: 0,
        });
    });

    it('조회가 실패하면 모양을 남기지 않고 error로 던진다', async () => {
        getAll.mockRejectedValue(new Error('boom'));

        await expect(service.getContacts()).rejects.toThrow('boom');
        expect(logger.error).toHaveBeenCalledWith('DEVICE', 'Failed to get contacts', expect.any(Error));
        expect(logger.info).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });
});

describe('DeviceService.getContacts — permission travels with the list (iOS)', () => {
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    let service: DeviceService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DeviceService(logger as never);
    });

    // The library's status call never settles on iOS 18+ for undetermined or partial access, so no
    // path may await it — the fetch's own outcome is the answer.
    it('reports a successful read as granted without querying the status', async () => {
        getAll.mockResolvedValue([contact({ displayName: '가' })]);

        await expect(service.getContacts()).resolves.toEqual({ contacts: [expect.anything()], permission: 'granted' });
        expect(checkPermission).not.toHaveBeenCalled();
    });

    it('reads a denied rejection as a refusal without querying the status', async () => {
        getAll.mockRejectedValue(new Error('denied'));

        await expect(service.getContacts()).resolves.toEqual({ contacts: [], permission: 'denied' });
        expect(checkPermission).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith('DEVICE', 'Read contacts permission denied');
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('still throws any other rejection', async () => {
        getAll.mockRejectedValue(new Error('undefined'));

        await expect(service.getContacts()).rejects.toThrow('undefined');
        expect(checkPermission).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith('DEVICE', 'Failed to get contacts', expect.any(Error));
    });
});

describe('DeviceService.getContacts — permission travels with the list (Android)', () => {
    const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    const check = PermissionsAndroid.check as jest.Mock;
    const request = PermissionsAndroid.request as jest.Mock;
    let service: DeviceService;

    beforeEach(() => {
        jest.clearAllMocks();
        (Platform as { OS: string }).OS = 'android';
        getAll.mockResolvedValue([]);
        service = new DeviceService(logger as never);
    });

    afterEach(() => {
        (Platform as { OS: string }).OS = 'ios';
    });

    it('reports an empty address book as granted, not as a denial', async () => {
        check.mockResolvedValue(true);

        await expect(service.getContacts()).resolves.toEqual({ contacts: [], permission: 'granted' });
        expect(checkPermission).not.toHaveBeenCalled();
    });

    it('reports a refused prompt as denied without reading', async () => {
        check.mockResolvedValue(false);
        request.mockResolvedValue('denied');

        await expect(service.getContacts()).resolves.toEqual({ contacts: [], permission: 'denied' });
        expect(getAll).not.toHaveBeenCalled();
    });
});
