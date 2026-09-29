import { act, render } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useCloudSessionCatalog } from '../../hooks/useCloudCatalog';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged, useOnReceiveNotification } from '../../bridge/useHandleAppMessage';
import { useInvitedClouds } from '../../hooks';
import { CloudPushMarkRunner } from './CloudPushMarkRunner';
import { useCloudPushMarkStore } from './stores/useCloudPushMarkStore';
import { resolvePushCloudId } from './utils/resolvePushCloudId';

jest.mock('../../hooks/useCloudCatalog', () => ({ useCloudSessionCatalog: jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useGlobalCacheSearch: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
        },
        sync: {
            refreshBackgroundClouds: jest.fn(),
            subscribeBackgroundDeltas: jest.fn(),
        },
    },
}));

jest.mock('../../bridge/appBridge', () => ({ appBridge: { fetchPushMarks: jest.fn() } }));
jest.mock('../../bridge/useHandleAppMessage', () => ({
    useOnReceiveNotification: jest.fn(),
    useOnBackgroundStatusChanged: jest.fn(),
}));
jest.mock('../../hooks', () => ({ useInvitedClouds: jest.fn() }));
jest.mock('./utils/resolvePushCloudId', () => ({
    ...jest.requireActual('./utils/resolvePushCloudId'),
    resolvePushCloudId: jest.fn(),
}));

type ReceiveMessage = { data?: { notification?: { data?: Record<string, unknown> } } };
let captured: ((message: ReceiveMessage) => void) | undefined;
let capturedBgHandler: ((message: { data: { isForeground: boolean } }) => void) | undefined;

const resolveContext = jest.fn();
const resolveMock = resolvePushCloudId as jest.Mock;
const fetchPushMarksMock = appBridge.fetchPushMarks as jest.Mock;

const receive = (data: Record<string, unknown>) => captured!({ data: { notification: { data } } });

const setActive = (selectedCloudId: string | null) =>
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId });
const setVerified = (isVerified: boolean) =>
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });

/** The runtime's delta announcements, delivered by the test. */
let deltaListeners: Array<(delta: { cid: string; requestedAt: number }) => void> = [];
/** Delivers an answered delta and lets the runner's clear grace run out. */
const answerDelta = (cid: string, requestedAt: number) =>
    act(() => {
        for (const listener of deltaListeners) listener({ cid, requestedAt });
        jest.advanceTimersByTime(1_000);
    });

beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    useCloudPushMarkStore.setState({ badged: {} });
    deltaListeners = [];
    (runtime.sync.subscribeBackgroundDeltas as jest.Mock).mockImplementation(listener => {
        deltaListeners.push(listener);
        return () => {
            deltaListeners = deltaListeners.filter(entry => entry !== listener);
        };
    });

    (runtime.data.useGlobalCacheSearch as jest.Mock).mockReturnValue({ resolveContext });
    (useCloudSessionCatalog as jest.Mock).mockReturnValue({ clouds: [{ id: 'cloud_1' }, { id: 'cloud_2' }] });
    (useInvitedClouds as jest.Mock).mockReturnValue({ invitedClouds: [] });
    setActive('cloud_1');
    fetchPushMarksMock.mockResolvedValue([]);
    setVerified(false);
    (useOnReceiveNotification as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
        (useOnBackgroundStatusChanged as jest.Mock).mockImplementation((handler: typeof capturedBgHandler) => {
            capturedBgHandler = handler;
        });
    });
});

describe('CloudPushMarkRunner — 크로스 클라우드 푸시 마크', () => {
    it('판별된 비활성 클라우드를 마크한다', async () => {
        resolveMock.mockResolvedValue('cloud_2');

        render(<CloudPushMarkRunner />);
        receive({ cid: 'cloud_2' });
        await Promise.resolve();

        expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
    });

    it('활성 클라우드로 판별되면 마크하지 않는다 (소켓이 이미 처리)', async () => {
        resolveMock.mockResolvedValue('cloud_1');

        render(<CloudPushMarkRunner />);
        receive({ cid: 'cloud_1' });
        await Promise.resolve();

        expect(useCloudPushMarkStore.getState().badged).toEqual({});
    });

    it('판별에 실패하면(null) 마크하지 않는다', async () => {
        resolveMock.mockResolvedValue(null);

        render(<CloudPushMarkRunner />);
        receive({ uid: 'u1' });
        await Promise.resolve();

        expect(useCloudPushMarkStore.getState().badged).toEqual({});
    });

    it('notification.data가 없는 이벤트는 무시한다', () => {
        render(<CloudPushMarkRunner />);
        captured!({ data: { notification: {} } });

        expect(resolveMock).not.toHaveBeenCalled();
    });

    it('활성 클라우드가 마크된 채 소켓이 verify되면 마크를 해제한다', () => {
        useCloudPushMarkStore.setState({ badged: { cloud_1: true } });
        setVerified(true);

        render(<CloudPushMarkRunner />);

        expect(useCloudPushMarkStore.getState().badged).toEqual({});
    });

    it('verify되어도 활성 클라우드가 마크돼 있지 않으면 아무 것도 지우지 않는다', () => {
        useCloudPushMarkStore.setState({ badged: { cloud_2: true } });
        setVerified(true);

        render(<CloudPushMarkRunner />);

        expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
    });

    describe('CloudPushMarkRunner — 네이티브 마크 drain (ADR-0056 §5)', () => {
        it('마운트 시 drain해 비활성 클라우드 레코드를 마크한다', async () => {
            fetchPushMarksMock.mockResolvedValue([{ cid: 'cloud_2' }]);
            resolveMock.mockResolvedValue('cloud_2');

            render(<CloudPushMarkRunner />);
            await Promise.resolve();
            await Promise.resolve();

            expect(fetchPushMarksMock).toHaveBeenCalledTimes(1);
            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });

        it('drain한 레코드가 활성 클라우드로 판별되면 마크하지 않는다', async () => {
            fetchPushMarksMock.mockResolvedValue([{ cid: 'cloud_1' }]);
            resolveMock.mockResolvedValue('cloud_1');

            render(<CloudPushMarkRunner />);
            await Promise.resolve();
            await Promise.resolve();

            expect(useCloudPushMarkStore.getState().badged).toEqual({});
        });

        it('여러 레코드를 순서대로 판별해 각각 마크한다', async () => {
            fetchPushMarksMock.mockResolvedValue([{ cid: 'cloud_2' }, { uid: 'u1' }]);
            resolveMock.mockResolvedValueOnce('cloud_2').mockResolvedValueOnce(null);

            render(<CloudPushMarkRunner />);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(resolveMock).toHaveBeenCalledTimes(2);
            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });

        it('포그라운드 복귀 시 다시 drain한다', async () => {
            render(<CloudPushMarkRunner />);
            await Promise.resolve();
            fetchPushMarksMock.mockClear();
            fetchPushMarksMock.mockResolvedValue([{ cid: 'cloud_2' }]);
            resolveMock.mockResolvedValue('cloud_2');

            capturedBgHandler!({ data: { isForeground: true } });
            await Promise.resolve();
            await Promise.resolve();

            expect(fetchPushMarksMock).toHaveBeenCalledTimes(1);
            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });

        it('백그라운드 전환(isForeground=false)에는 drain하지 않는다', async () => {
            render(<CloudPushMarkRunner />);
            await Promise.resolve();
            fetchPushMarksMock.mockClear();

            capturedBgHandler!({ data: { isForeground: false } });

            expect(fetchPushMarksMock).not.toHaveBeenCalled();
        });
    });

    describe('only a chat push marks', () => {
        it('does not mark the cloud a cloud-activation push names', async () => {
            resolveMock.mockResolvedValue('cloud_2');

            render(<CloudPushMarkRunner />);
            receive({ type: 'cloud', cid: 'cloud_2' });
            await Promise.resolve();

            expect(resolveMock).not.toHaveBeenCalled();
            expect(useCloudPushMarkStore.getState().badged).toEqual({});
        });

        it('marks for a push typed chat', async () => {
            resolveMock.mockResolvedValue('cloud_2');

            render(<CloudPushMarkRunner />);
            receive({ type: 'chat', cid: 'cloud_2' });
            await Promise.resolve();

            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });
    });

    describe("a mark lasts until the cloud's cache has caught up", () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(1_000_000);
        });

        const markCloud2 = async () => {
            resolveMock.mockResolvedValue('cloud_2');
            render(<CloudPushMarkRunner />);
            jest.setSystemTime(2_000_000);
            receive({ cid: 'cloud_2' });
            await act(async () => {
                await Promise.resolve();
            });
        };

        it('asks the marked cloud for its delta right away', async () => {
            await markCloud2();

            expect(runtime.sync.refreshBackgroundClouds).toHaveBeenCalledWith('cloud_2');
        });

        it('clears the mark once a delta requested after it comes back', async () => {
            await markCloud2();

            answerDelta('cloud_2', 2_000_500);

            expect(useCloudPushMarkStore.getState().badged).toEqual({});
        });

        it('keeps the mark through a delta that was already in flight when the push landed', async () => {
            await markCloud2();

            answerDelta('cloud_2', 1_999_000);

            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });

        it("keeps the mark through another cloud's delta", async () => {
            await markCloud2();

            answerDelta('default', 2_000_500);

            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });

        it('a second push moves the time the clearing delta has to postdate', async () => {
            await markCloud2();
            jest.setSystemTime(3_000_000);
            receive({ cid: 'cloud_2' });
            await act(async () => {
                await Promise.resolve();
            });

            answerDelta('cloud_2', 2_500_000);
            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });

            answerDelta('cloud_2', 3_000_100);
            expect(useCloudPushMarkStore.getState().badged).toEqual({});
        });

        it('clears a mark restored from the previous run with the first delta asked for after mount', () => {
            useCloudPushMarkStore.setState({ badged: { cloud_2: true } });
            render(<CloudPushMarkRunner />);

            answerDelta('cloud_2', 999_000);
            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });

            answerDelta('cloud_2', 1_000_000);
            expect(useCloudPushMarkStore.getState().badged).toEqual({});
        });

        it('keeps the mark until the grace runs out, so the redraw is not a blink', async () => {
            await markCloud2();

            act(() => {
                for (const listener of deltaListeners) listener({ cid: 'cloud_2', requestedAt: 2_000_500 });
                jest.advanceTimersByTime(999);
            });
            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });

            act(() => {
                jest.advanceTimersByTime(1);
            });
            expect(useCloudPushMarkStore.getState().badged).toEqual({});
        });

        it('a push landing during the grace keeps the mark for a delta of its own', async () => {
            await markCloud2();
            act(() => {
                for (const listener of deltaListeners) listener({ cid: 'cloud_2', requestedAt: 2_000_500 });
            });
            jest.setSystemTime(2_000_600);
            receive({ cid: 'cloud_2' });
            await act(async () => {
                await Promise.resolve();
            });

            act(() => {
                jest.advanceTimersByTime(1_000);
            });

            expect(useCloudPushMarkStore.getState().badged).toEqual({ cloud_2: true });
        });

        it('stops listening when unmounted', () => {
            const { unmount } = render(<CloudPushMarkRunner />);
            unmount();

            expect(deltaListeners).toHaveLength(0);
        });
    });
});
