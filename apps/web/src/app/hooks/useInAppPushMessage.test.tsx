import { render, renderHook, screen } from '@testing-library/react';
import { toast } from 'sonner';

import { runtime } from '@chatic/runtime';

import { useOnReceiveNotification, usePushNavigate } from '../bridge';
import { useInAppPushMessage } from './useInAppPushMessage';
import { roomOpenTrace } from '../runtime/perf';

jest.mock('sonner', () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: {
            useSessionIdentity: jest.fn(),
        },
    })
);
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

const renderToastContent = () => {
    const [renderContent] = toastCustom.mock.calls[toastCustom.mock.calls.length - 1];
    return render(renderContent('in-app-push-message'));
};

const setCurrentPath = (path: string) => window.history.replaceState({}, '', path);

beforeEach(() => {
    jest.clearAllMocks();
    setCurrentPath('/');
    (usePushNavigate as jest.Mock).mockReturnValue(navigateToPush);
    (runtime.session.useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
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

    it('payload에 중첩된 ownerId로도 내 메시지를 알아본다', () => {
        invoke({ title: 'T', body: 'B', data: { payload: JSON.stringify({ channelId: 'abc', ownerId: 'me' }) } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('payload의 ownerId가 숫자로 와도 내 메시지로 본다', () => {
        (runtime.session.useSessionIdentity as jest.Mock).mockReturnValue({ userId: '1001' });

        invoke({ title: 'T', body: 'B', data: { payload: JSON.stringify({ channelId: 'abc', ownerId: 1001 }) } });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('top-level channelId가 OS 알림 채널이어도 payload의 채널 id로 비교한다', () => {
        setCurrentPath('/channels/abc/room');

        invoke({
            title: 'T',
            body: 'B',
            data: { channelId: 'dou_chat', payload: JSON.stringify({ channelId: 'abc' }) },
        });

        expect(toastCustom).not.toHaveBeenCalled();
    });

    it('falls back to a channelName nested in payload when the push has no title', () => {
        invoke({ body: 'B', data: { payload: JSON.stringify({ channelName: 'general' }) } });

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

    it('begins a push_banner room-open trace for the room the banner opens', () => {
        roomOpenTrace.reset();
        invoke({ title: 'T', body: 'B', data: { link: '/channels/abc/room', channelId: 'abc' } });

        renderToastContent();
        screen.getByRole('button').click();

        const trace = roomOpenTrace.claim('abc');
        expect(trace?.name).toBe('chat_room_open');
    });

    it('라우팅 정보가 없는 푸시는 표시만 하고 클릭 동작이 없다', () => {
        invoke({ title: 'T', body: 'B' });

        renderToastContent();

        expect(screen.queryByRole('button')).toBeNull();
        expect(navigateToPush).not.toHaveBeenCalled();
    });

    it('shows a fallback channel name as-is, with no # prefix', () => {
        invoke({ body: 'B', data: { channelId: 'abc', channelName: 'general' } });

        renderToastContent();

        expect(screen.getByText('general')).toBeTruthy();
        expect(screen.queryByText('#general')).toBeNull();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('heads a 1:1 banner with the push title, not the room snapshot name', () => {
        invoke({ title: 'Sunny', body: 'hi', data: { channelId: 'abc', channelName: 'Room 1000001' } });

        renderToastContent();

        expect(screen.getByText('Sunny')).toBeTruthy();
        expect(screen.queryByText('Room 1000001')).toBeNull();
    });

    it('heads a group banner with the room name the push titles it with', () => {
        invoke({ title: 'Design', body: 'Sunny : hi', data: { channelId: 'abc', channelName: 'Design' } });

        renderToastContent();

        expect(screen.getByText('Design')).toBeTruthy();
        expect(screen.getByText('Sunny : hi')).toBeTruthy();
    });

    it('treats an empty title as no title', () => {
        invoke({ title: '', body: 'B', data: { channelId: 'abc', channelName: 'general' } });

        renderToastContent();

        expect(screen.getByText('general')).toBeTruthy();
    });

    it('배너에는 항상 "지금" 라벨이 붙는다', () => {
        invoke({ title: 'T', body: 'B', data: { channelId: 'abc' } });

        renderToastContent();

        expect(screen.getByText('notifications.inApp.now')).toBeTruthy();
    });
});
