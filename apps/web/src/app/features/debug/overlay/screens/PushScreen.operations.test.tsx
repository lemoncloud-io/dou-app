import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PushScreen } from './PushScreen';
import { resetUnsupportedCommands } from '../../hooks';
import { setDebugLanguageForTests } from '../../i18n';

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
jest.mock('@chatic/bridges', () => ({ isNative: () => true, logger: { warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../hooks', () => ({
    usePushRegistration: () => ({ state: 'idle', token: null, summary: null, error: null, check: jest.fn() }),
    useReceivedPushLog: () => ({ entries: [], clear: jest.fn() }),
    // Uses the real implementation — mocking it would leave this hook's contract, like "no confirmation", unverified.
    useDebugOperation: jest.requireActual('../../hooks/useDebugOperation').useDebugOperation,
    resetUnsupportedCommands: jest.requireActual('../../hooks/useDebugOperation').resetUnsupportedCommands,
}));
// A fake that returns the DEV scheme — this distinguishes whether the screen resolves the scheme, versus having it hardcoded somewhere.
jest.mock('../../lib', () => ({
    copyText: jest.fn(),
    formatRegisteredAt: () => '—',
    buildAppDeeplink: (input: string) => `chatic-dev://${input.replace(/^\/+/, '')}`,
}));
jest.mock('../overlayStore', () => ({ debugOverlayActions: { selectScreen: jest.fn() } }));

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));

describe('PushScreen — 조작 (ADR-0080 결정 11)', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        resetUnsupportedCommands();
        restoreLanguage = setDebugLanguageForTests('en');
    });

    afterEach(() => restoreLanguage());

    it('토큰 삭제는 앱에 명령을 보내고 결과를 적는다', async () => {
        deleteFcmToken.mockResolvedValue({ data: { success: true } });
        render(<PushScreen />);

        await click('Delete token');

        expect(deleteFcmToken).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/Delete token →/)).toBeInTheDocument();
    });

    it('알림 권한은 계약의 토큰으로 요청한다', async () => {
        requestPermission.mockResolvedValue({ data: { permission: 'NOTIFICATIONS', status: 'GRANTED' } });
        render(<PushScreen />);

        await click('Request notification permission');

        expect(requestPermission).toHaveBeenCalledWith('NOTIFICATIONS');
    });

    it('로컬 알림은 딥링크를 함께 실어 보낸다 — 탭 경로까지 확인하려고', async () => {
        showNotification.mockResolvedValue({ data: { success: true } });
        render(<PushScreen />);

        await click('Show local notification');

        // It has to be this build's scheme. Getting 'chatic://…' would be that bug where a dev device opens the prod app.
        expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ deeplink: 'chatic-dev://chats' }));
    });

    // An older app doesn't know the command and rejects. Not smoothing a failure over as a success is the whole point of this screen.
    it('앱이 거부하면 실패를 그대로 적는다', async () => {
        deleteFcmToken.mockRejectedValue(new Error('NOT_FOUND'));
        render(<PushScreen />);

        await click('Delete token');

        expect(await screen.findByText(/failed: NOT_FOUND/)).toBeInTheDocument();
    });

    // Post-based, so there's no confirmation reply — pretending it was acknowledged would violate decision 10.
    it('확인 응답이 없는 조작은 "확인 없음"이라고 밝힌다', async () => {
        render(<PushScreen />);

        await click('Badge to 0');

        expect(setBadgeCount).toHaveBeenCalledWith(0);
        expect(await screen.findByText(/no confirmation/)).toBeInTheDocument();
    });

    it('푸시 탭 재현은 이 빌드의 스킴을 열어 OS 왕복을 만든다', async () => {
        render(<PushScreen />);

        await click('Reproduce push tap');

        expect(openURL).toHaveBeenCalledWith('chatic-dev://chats');
    });

    // DeleteFcmToken is this round's new command, so it gets NOT_FOUND on older versions until
    // the app is released. Without passing the command name, nothing gets learned, and pressing
    // the same button just repeats the failure (audited at stage 7).
    it('구버전 앱이 토큰 삭제를 모르면 버전 차이로 배운다', async () => {
        deleteFcmToken.mockRejectedValue({ code: 'NOT_FOUND' });
        render(<PushScreen />);

        await click('Delete token');

        expect(await screen.findByText(/not supported by this app version/)).toBeInTheDocument();
    });
});
