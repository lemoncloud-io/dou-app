import { render, renderHook, screen } from '@testing-library/react';
import { toast } from 'sonner';

import { useSessionIdentity } from '@chatic/web-core';

import { useOnReceiveNotification, usePushNavigate } from '../../../bridge';
import { useInAppPushMessage } from './useInAppPushMessage';

jest.mock('sonner', () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));
jest.mock('../../../bridge', () => ({
    useOnReceiveNotification: jest.fn(),
    usePushNavigate: jest.fn(),
}));

const navigateToPush = jest.fn();
const toastCustom = toast.custom as jest.Mock;
const toastDismiss = toast.dismiss as jest.Mock;

type ReceiveMessage = { data?: { notification?: { title?: string; body?: string; data?: Record<string, unknown> } } };
let captured: ((message: ReceiveMessage) => void) | undefined;

const invoke = (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => {
    renderHook(() => useInAppPushMessage());
    captured!({ data: { notification } });
};

/** Renders the JSX the hook handed to `toast.custom` so click behavior can be asserted. */
const renderToastContent = () => {
    const [renderContent] = toastCustom.mock.calls[toastCustom.mock.calls.length - 1];
    return render(renderContent('in-app-push-message'));
};

// Current-channel suppression reads the live pathname (jsdom), so tests drive
// the "current screen" through the history API, same as the navigation tests.
const setCurrentPath = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
    jest.clearAllMocks();
    setCurrentPath('/');
    (usePushNavigate as jest.Mock).mockReturnValue(navigateToPush);
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (useOnReceiveNotification as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
    });
});

describe('useInAppPushMessage', () => {
    it('제목/본문이 있는 푸시가 오면 고정 id로 교체형 배너를 띄운다', () => {
        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        expect(toastCustom).toHaveBeenCalledTimes(1);
        expect(toastCustom.mock.calls[0][1]).toEqual({
            id: 'in-app-push-message',
            duration: 5_000,
            position: 'top-center',
        });
    });

    it('silent 푸시(제목/본문 없음)는 배너를 띄우지 않는다', () => {
        invoke({ data: { channelId: 'abc' } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('내가 보낸 메시지의 푸시는 배너를 띄우지 않는다', () => {
        invoke({ title: 'T', body: 'B', data: { channelId: 'abc', ownerId: 'me' } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('지금 보고 있는 채널의 푸시는 배너를 띄우지 않는다', () => {
        setCurrentPath('/channels/abc/room');

        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('다른 채널 방을 보고 있으면 배너를 띄운다', () => {
        setCurrentPath('/channels/other/room');

        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        expect(toastCustom).toHaveBeenCalledTimes(1);
    });

    it('배너 클릭 시 토스트를 닫고 푸시 네비게이션 경로로 이동한다', () => {
        invoke({ title: 'T', body: 'B', data: { link: '/channels/abc/room', cid: 'c1' } });

        renderToastContent();
        screen.getByRole('button').click();

        expect(toastDismiss).toHaveBeenCalledWith('in-app-push-message');
        expect(navigateToPush).toHaveBeenCalledWith('/channels/abc/room?cid=c1');
    });

    it('라우팅 정보가 없는 푸시는 표시만 하고 클릭 동작이 없다', () => {
        invoke({ title: 'T', body: 'B' });

        renderToastContent();

        expect(screen.queryByRole('button')).toBeNull();
        expect(navigateToPush).not.toHaveBeenCalled();
    });

    it('채널명이 있으면 #채널명을 헤드라인으로 쓴다', () => {
        invoke({ title: 'T', body: 'B', data: { channelId: 'abc', channelName: 'general' } });

        renderToastContent();

        expect(screen.getByText('#general')).toBeTruthy();
        expect(screen.getByText('B')).toBeTruthy();
    });
});
