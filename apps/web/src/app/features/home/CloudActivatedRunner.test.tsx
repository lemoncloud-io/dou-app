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

    // Clouds created without a name really do exist — use the same fallback as the push copy.
    it('이름이 비면 식별자로 대체한다', () => {
        mount()({ data: { id: 'cloud_1', name: '  ' } });

        renderToastContent();
        expect(screen.getByText('notifications.cloudActivated.title:cloud_1')).toBeTruthy();
    });

    // Web i18n is a remote resource, so some clients don't have this key yet. No banner is better
    // than a banner showing the literal key, and the list refresh must happen regardless.
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

    // Tapping the push notification goes to home. If the banner alone went somewhere else, the same
    // notification would end up in different places depending on how it arrived.
    it('배너에 클릭 동작이 없다', () => {
        mount()({ data: { id: 'cloud_1', name: 'DoU' } });

        renderToastContent();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
