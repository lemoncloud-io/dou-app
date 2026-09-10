import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeviceInfoScreen } from './DeviceInfoScreen';

const openCamera = jest.fn();
const openPhotoLibrary = jest.fn();
const openDocument = jest.fn();
const getContacts = jest.fn();
const copyToClipboard = jest.fn();
const requestPermission = jest.fn();
const openSettings = jest.fn();
const openShareSheet = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        openCamera: (p: unknown) => openCamera(p),
        openPhotoLibrary: (p: unknown) => openPhotoLibrary(p),
        openDocument: (p: unknown) => openDocument(p),
        getContacts: () => getContacts(),
        copyToClipboard: (t: string) => copyToClipboard(t),
        requestPermission: (p: unknown) => requestPermission(p),
        openSettings: () => openSettings(),
        openShareSheet: (u: string) => openShareSheet(u),
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));
jest.mock('@chatic/device-utils', () => ({ useDeviceInfo: () => ({ versionInfo: null, deviceInfo: null }) }));
jest.mock('../../lib', () => ({ buildDeviceInfoRows: () => [], copyText: jest.fn() }));

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));

describe('DeviceInfoScreen — 조작 (ADR-0080 결정 11)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('카메라와 앨범은 payload를 실어 부른다', async () => {
        openCamera.mockResolvedValue({ data: { assets: [] } });
        openPhotoLibrary.mockResolvedValue({ data: { assets: [] } });
        render(<DeviceInfoScreen />);

        await click('카메라');
        await click('앨범');

        expect(openCamera).toHaveBeenCalledWith({ mediaType: 'photo' });
        expect(openPhotoLibrary).toHaveBeenCalledWith({ selectionLimit: 1, mediaType: 'photo' });
    });

    it('연락처 결과를 화면에 적는다', async () => {
        getContacts.mockResolvedValue({ data: { contacts: [{ name: '홍길동' }] } });
        render(<DeviceInfoScreen />);

        await click('연락처');

        expect(await screen.findByText(/홍길동/)).toBeInTheDocument();
    });

    // MICROPHONE은 계약 union이 사본으로 갈라져 웹에서 못 부르던 권한이다 — 그게 이번 확장의 요점.
    it('권한 버튼 네 개가 계약의 토큰으로 요청한다 (MICROPHONE 포함)', async () => {
        requestPermission.mockResolvedValue({ data: { permission: 'CAMERA', status: 'GRANTED' } });
        render(<DeviceInfoScreen />);

        for (const token of ['CAMERA', 'PHOTO_LIBRARY', 'CONTACTS', 'MICROPHONE']) {
            await click(token);
            expect(requestPermission).toHaveBeenCalledWith(token);
        }
    });

    it('앱이 거부하면 실패를 그대로 적는다', async () => {
        openDocument.mockRejectedValue(new Error('CANCELLED'));
        render(<DeviceInfoScreen />);

        await click('파일');

        expect(await screen.findByText(/실패: CANCELLED/)).toBeInTheDocument();
    });

    // post 기반이라 응답이 없다 — 받은 척하지 않는다.
    it('확인 응답이 없는 조작은 "확인 없음"이라고 밝힌다', async () => {
        render(<DeviceInfoScreen />);

        await click('OS 설정');

        expect(openSettings).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/확인 없음/)).toBeInTheDocument();
    });
});
