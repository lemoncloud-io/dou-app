import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';

import { runtime } from '@chatic/runtime-react';

import { CloudActivatedRunner } from './CloudActivatedRunner';

jest.mock('sonner', () => ({ toast: { custom: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        data: { cloudsKeys: { all: ['clouds'] } },
        connection: { RELAY_SLOT: 'default', onServerEvent: jest.fn() },
    })
);
const echo = (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${opts.name}` : key);
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: echo, i18n: { exists: mockExists, t: echo } }),
}));

const mockInvalidate = jest.fn();
const mockExists = jest.fn();
const onServerEvent = runtime.connection.onServerEvent as jest.Mock;
const unsubscribe = jest.fn();
const toastCustom = toast.custom as jest.Mock;

type Handler = (message: { data: { id?: string; name?: string } | null }) => void;

let lastUnmount: (() => void) | undefined;

const mount = (): Handler => {
    const { unmount } = render(<CloudActivatedRunner />);
    lastUnmount = unmount;
    return onServerEvent.mock.calls[onServerEvent.mock.calls.length - 1][1];
};

const renderToastContent = () => {
    const [renderContent] = toastCustom.mock.calls[toastCustom.mock.calls.length - 1];
    return render(renderContent('cloud-activated'));
};

beforeEach(() => {
    jest.clearAllMocks();
    mockExists.mockReturnValue(true);
    onServerEvent.mockReturnValue(unsubscribe);
});

describe('CloudActivatedRunner', () => {
    it('relay 슬롯에 cloud.activated를 구독한다', () => {
        mount();

        expect(onServerEvent).toHaveBeenCalledWith('cloud.activated', expect.any(Function), { slot: 'default' });
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

    it('이름이 비면 식별자로 대체한다', () => {
        mount()({ data: { id: 'cloud_1', name: '  ' } });

        renderToastContent();
        expect(screen.getByText('notifications.cloudActivated.title:cloud_1')).toBeTruthy();
    });

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

    it('배너에 클릭 동작이 없다', () => {
        mount()({ data: { id: 'cloud_1', name: 'DoU' } });

        renderToastContent();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it.each(['ko', 'en'])('ships the banner title in the %s bundle with the cloud name in it', lang => {
        const bundle = JSON.parse(
            readFileSync(join(__dirname, '../../../../public/locales', lang, 'translation.json'), 'utf-8')
        ) as { notifications: { cloudActivated?: { title?: string } } };

        expect(bundle.notifications.cloudActivated?.title).toContain('{{name}}');
    });
});
