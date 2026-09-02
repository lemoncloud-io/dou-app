import { render, renderHook, screen } from '@testing-library/react';
import { toast } from 'sonner';

import { useSessionIdentity } from '@chatic/app-runtime';

import { useOnReceiveNotification, usePushNavigate } from '../bridge';
import { useInAppPushMessage } from './useInAppPushMessage';

jest.mock('sonner', () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));
// The banner card translates its "now" label; echo keys so assertions target the key.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/app-runtime', () => ({
    useSessionIdentity: jest.fn(),
}));
jest.mock('../bridge', () => ({
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

    // 스레드는 그 방의 다른 화면일 뿐이다 — 방에서 억제되는 배너가 스레드에서 뜨면,
    // 답글을 쓰는 동안 내 전송 왕복이 그대로 배너로 돌아온다.
    it('같은 채널의 스레드를 보고 있어도 배너를 띄우지 않는다', () => {
        setCurrentPath('/channels/abc/thread/42');

        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('다른 채널의 스레드를 보고 있으면 배너를 띄운다', () => {
        setCurrentPath('/channels/other/thread/42');

        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        expect(toastCustom).toHaveBeenCalledTimes(1);
    });

    // 발신자에 따라 이 필드들은 top-level이 아니라 `payload` JSON 안에 온다. 예전처럼 raw로 읽으면
    // 두 억제 규칙이 조용히 통째로 죽는다 — 그래서 배너가 뜨지 말아야 할 때 떴다.
    it('payload에 중첩된 ownerId로도 내 메시지를 알아본다', () => {
        invoke({ title: 'T', body: 'B', data: { payload: JSON.stringify({ channelId: 'abc', ownerId: 'me' }) } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('payload의 ownerId가 숫자로 와도 내 메시지로 본다', () => {
        (useSessionIdentity as jest.Mock).mockReturnValue({ userId: '1001' });

        invoke({ title: 'T', body: 'B', data: { payload: JSON.stringify({ channelId: 'abc', ownerId: 1001 }) } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    // 안드로이드 포그라운드 경로는 top-level `channelId`에 OS 알림 채널("dou_chat")을 실어 보냈다.
    // payload가 top-level을 이겨야 진짜 대화방 id가 라우트 비교에 쓰인다.
    it('top-level channelId가 OS 알림 채널이어도 payload의 채널 id로 비교한다', () => {
        setCurrentPath('/channels/abc/room');

        invoke({
            title: 'T',
            body: 'B',
            data: { channelId: 'dou_chat', payload: JSON.stringify({ channelId: 'abc' }) },
        });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('payload에 중첩된 channelName도 헤드라인으로 쓴다', () => {
        invoke({ title: 'T', body: 'B', data: { payload: JSON.stringify({ channelName: 'general' }) } });

        renderToastContent();

        expect(screen.getByText('general')).toBeTruthy();
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

    // 방 이름은 그대로 쓴다 — `#`은 공개 채널 관례라 1:1·나와의 채팅에도 붙어 어색했다.
    it('채널명이 있으면 이름 그대로를 헤드라인으로 쓴다', () => {
        invoke({ title: 'T', body: 'B', data: { channelId: 'abc', channelName: 'general' } });

        renderToastContent();

        expect(screen.getByText('general')).toBeTruthy();
        expect(screen.queryByText('#general')).toBeNull();
        expect(screen.getByText('B')).toBeTruthy();
    });

    // 배너는 방금 도착한 푸시만 띄우므로 시각 라벨은 계산 없이 항상 고정 문구다.
    it('배너에는 항상 "지금" 라벨이 붙는다', () => {
        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        renderToastContent();

        expect(screen.getByText('notifications.inApp.now')).toBeTruthy();
    });
});
