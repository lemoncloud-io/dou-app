import { render } from '@testing-library/react';

import { useGlobalCacheSearch, useRuntimeSocketState } from '@chatic/app-runtime';
import { useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';

import { useOnReceiveNotification } from '../../bridge/useHandleAppMessage';
import { useInvitedClouds } from '../../hooks';
import { CloudPushMarkRunner } from './CloudPushMarkRunner';
import { useCloudPushMarkStore } from './stores/useCloudPushMarkStore';
import { resolvePushCloudId } from './utils/resolvePushCloudId';

jest.mock('@chatic/app-runtime', () => ({
    useGlobalCacheSearch: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));
jest.mock('@chatic/web-core', () => ({
    useCloudSessionCatalog: jest.fn(),
    useSessionSelection: jest.fn(),
}));
jest.mock('../../bridge/useHandleAppMessage', () => ({ useOnReceiveNotification: jest.fn() }));
jest.mock('../../hooks', () => ({ useInvitedClouds: jest.fn() }));
jest.mock('./utils/resolvePushCloudId', () => ({
    ...jest.requireActual('./utils/resolvePushCloudId'),
    resolvePushCloudId: jest.fn(),
}));

type ReceiveMessage = { data?: { notification?: { data?: Record<string, unknown> } } };
let captured: ((message: ReceiveMessage) => void) | undefined;

const resolveContext = jest.fn();
const resolveMock = resolvePushCloudId as jest.Mock;

const receive = (data: Record<string, unknown>) => captured!({ data: { notification: { data } } });

const setActive = (selectedCloudId: string | null) =>
    (useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId });
const setVerified = (isVerified: boolean) => (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });

beforeEach(() => {
    jest.clearAllMocks();
    useCloudPushMarkStore.setState({ badged: {} });

    (useGlobalCacheSearch as jest.Mock).mockReturnValue({ resolveContext });
    (useCloudSessionCatalog as jest.Mock).mockReturnValue({ clouds: [{ id: 'cloud_1' }, { id: 'cloud_2' }] });
    (useInvitedClouds as jest.Mock).mockReturnValue({ invitedClouds: [] });
    setActive('cloud_1');
    setVerified(false);
    (useOnReceiveNotification as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
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
});
