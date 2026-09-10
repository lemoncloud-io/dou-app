import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PushScreen } from './PushScreen';

const deleteFcmToken = jest.fn();
const requestPermission = jest.fn();
const showNotification = jest.fn();
const fetchBadgeCount = jest.fn();
const setBadgeCount = jest.fn();
const openURL = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: {
        deleteFcmToken: () => deleteFcmToken(),
        requestPermission: (p: unknown) => requestPermission(p),
        showNotification: (p: unknown) => showNotification(p),
        fetchBadgeCount: () => fetchBadgeCount(),
        setBadgeCount: (c: number) => setBadgeCount(c),
        openURL: (u: string) => openURL(u),
    },
}));
jest.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { warn: jest.fn() } }));
jest.mock('../../hooks', () => ({
    usePushRegistration: () => ({ state: 'idle', token: null, summary: null, error: null, check: jest.fn() }),
    useReceivedPushLog: () => ({ entries: [], clear: jest.fn() }),
}));
jest.mock('../../lib', () => ({ copyText: jest.fn(), formatRegisteredAt: () => '—' }));
jest.mock('../overlayStore', () => ({ debugOverlayActions: { selectScreen: jest.fn() } }));

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));

describe('PushScreen — 조작 (ADR-0080 결정 11)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('토큰 삭제는 앱에 명령을 보내고 결과를 적는다', async () => {
        deleteFcmToken.mockResolvedValue({ data: { success: true } });
        render(<PushScreen />);

        await click('토큰 삭제');

        expect(deleteFcmToken).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/토큰 삭제 →/)).toBeInTheDocument();
    });

    it('알림 권한은 계약의 토큰으로 요청한다', async () => {
        requestPermission.mockResolvedValue({ data: { permission: 'NOTIFICATIONS', status: 'GRANTED' } });
        render(<PushScreen />);

        await click('알림 권한 요청');

        expect(requestPermission).toHaveBeenCalledWith('NOTIFICATIONS');
    });

    it('로컬 알림은 딥링크를 함께 실어 보낸다 — 탭 경로까지 확인하려고', async () => {
        showNotification.mockResolvedValue({ data: { success: true } });
        render(<PushScreen />);

        await click('로컬 알림 띄우기');

        expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ deeplink: 'chatic://chats' }));
    });

    // 구버전 앱은 명령을 몰라 reject한다. 실패를 성공으로 뭉개지 않는 것이 이 화면의 요점이다.
    it('앱이 거부하면 실패를 그대로 적는다', async () => {
        deleteFcmToken.mockRejectedValue(new Error('NOT_FOUND'));
        render(<PushScreen />);

        await click('토큰 삭제');

        expect(await screen.findByText(/실패: NOT_FOUND/)).toBeInTheDocument();
    });

    // post 기반이라 확인 응답이 없다 — 받은 척하면 결정 10을 어긴다.
    it('확인 응답이 없는 조작은 "확인 없음"이라고 밝힌다', async () => {
        render(<PushScreen />);

        await click('뱃지 0으로');

        expect(setBadgeCount).toHaveBeenCalledWith(0);
        expect(await screen.findByText(/확인 없음/)).toBeInTheDocument();
    });

    it('푸시 탭 재현은 앱 스킴을 열어 OS 왕복을 만든다', async () => {
        render(<PushScreen />);

        await click('푸시 탭 재현');

        expect(openURL).toHaveBeenCalledWith('chatic://chats');
    });
});
