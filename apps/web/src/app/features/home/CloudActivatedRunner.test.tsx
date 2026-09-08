import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';

import { runtime } from '@chatic/app-runtime';

import { CloudActivatedRunner } from './CloudActivatedRunner';

jest.mock('sonner', () => ({ toast: { custom: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { cloudsKeys: { all: ['clouds'] } },
        connection: { getSocketManager: jest.fn() },
    },
}));
// Echo keys so assertions target the key. `t` is here for the CARD (it translates its own "now"
// label); the runner itself reads copy through `i18n.t` to keep the effect off `t`'s identity.
const echo = (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${opts.name}` : key);
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: echo, i18n: { exists: mockExists, t: echo } }),
}));

const mockInvalidate = jest.fn();
const mockExists = jest.fn();
const onSlotType = jest.fn();
const unsubscribe = jest.fn();
const toastCustom = toast.custom as jest.Mock;

type Handler = (message: { data: { id?: string; name?: string } | null }) => void;

let lastUnmount: (() => void) | undefined;

/** Mounts the runner and returns the listener it registered on the relay slot. */
const mount = (): Handler => {
    const { unmount } = render(<CloudActivatedRunner />);
    lastUnmount = unmount;
    return onSlotType.mock.calls[onSlotType.mock.calls.length - 1][2];
};

/** Renders the JSX the runner handed to `toast.custom`. */
const renderToastContent = () => {
    const [renderContent] = toastCustom.mock.calls[toastCustom.mock.calls.length - 1];
    return render(renderContent('cloud-activated'));
};

beforeEach(() => {
    jest.clearAllMocks();
    mockExists.mockReturnValue(true);
    onSlotType.mockReturnValue(unsubscribe);
    (runtime.connection.getSocketManager as jest.Mock).mockReturnValue({ onSlotType });
});

describe('CloudActivatedRunner', () => {
    // Pinning to relay is the whole point: the unicast is delivered by the relay deployment, so an
    // active-slot subscription misses it while the user sits inside another cloud.
    it('relay 슬롯에 cloud.activated를 구독한다', () => {
        mount();

        expect(onSlotType).toHaveBeenCalledWith('relay', 'cloud.activated', expect.any(Function));
    });

    it('언마운트 시 구독을 해지한다', () => {
        mount();
        lastUnmount?.();

        expect(unsubscribe).toHaveBeenCalled();
    });

    it('이벤트를 받으면 클라우드 목록 캐시를 무효화한다', () => {
        mount()({ data: { id: 'cloud_1', name: 'DoU' } });

        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: runtime.data.cloudsKeys.all });
    });

    it('이름을 제목 인자로 넘겨 배너를 띄운다', () => {
        mount()({ data: { id: 'cloud_1', name: 'DoU' } });

        renderToastContent();
        expect(screen.getByText('notifications.cloudActivated.title:DoU')).toBeTruthy();
    });

    // 이름 없이 만들어진 클라우드가 실제로 있다 — 푸시 문구와 같은 폴백을 쓴다.
    it('이름이 비면 식별자로 대체한다', () => {
        mount()({ data: { id: 'cloud_1', name: '  ' } });

        renderToastContent();
        expect(screen.getByText('notifications.cloudActivated.title:cloud_1')).toBeTruthy();
    });

    // 웹 i18n은 원격 리소스라 이 키가 아직 없는 클라이언트가 있다. 리터럴 키가 뜬 배너보다
    // 배너가 없는 편이 낫고, 목록 갱신은 그와 무관하게 일어나야 한다.
    it('번역 키가 없으면 배너를 띄우지 않되 캐시는 무효화한다', () => {
        mockExists.mockReturnValue(false);

        mount()({ data: { id: 'cloud_1', name: 'DoU' } });

        expect(toastCustom).not.toHaveBeenCalled();
        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: runtime.data.cloudsKeys.all });
    });

    it('식별할 이름이 전혀 없으면 배너를 띄우지 않되 캐시는 무효화한다', () => {
        mount()({ data: null });

        expect(toastCustom).not.toHaveBeenCalled();
        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: runtime.data.cloudsKeys.all });
    });

    // 푸시 탭은 홈으로 간다. 배너만 다른 곳으로 데려가면 같은 알림이 도착 경로에 따라 갈린다.
    it('배너에 클릭 동작이 없다', () => {
        mount()({ data: { id: 'cloud_1', name: 'DoU' } });

        renderToastContent();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
