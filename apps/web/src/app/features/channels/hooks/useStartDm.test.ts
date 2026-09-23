import { act, renderHook } from '@testing-library/react';

const navigate = jest.fn();
const startDmRequest = jest.fn();
const logError = jest.fn();

jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: logError },
}));
// One object, not a fresh one per render: the hook lists the repository in a dependency array, and a
// new identity every render would rebuild `startDm` on every render.
const repositories = { channel: { startDm: startDmRequest } };
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => repositories } },
}));

import { useStartDm } from './useStartDm';

const setup = () => renderHook(() => useStartDm());

beforeEach(() => {
    jest.clearAllMocks();
    startDmRequest.mockResolvedValue({ id: 'dm-1', sid: '', stereo: 'dm' });
});

describe('useStartDm', () => {
    it('상대 id 하나로 열고 그 방으로 이동한다', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2');
        });

        expect(startDmRequest).toHaveBeenCalledWith({ peerId: 'u2' });
        expect(navigate).toHaveBeenCalledWith('/channels/dm-1/room');
    });

    // The server resolves a pair to one room, so "new" and "existing" arrive identically. If this
    // hook ever grows a branch between them, it is guessing at something it was not told.
    it('이미 대화한 적 있는 상대여도 분기 없이 같은 길로 간다', async () => {
        const { result } = setup();
        startDmRequest.mockResolvedValue({ id: 'dm-existing', sid: '' });

        const room = await act(async () => result.current.startDm('u2'));

        expect(navigate).toHaveBeenCalledWith('/channels/dm-existing/room');
        expect(startDmRequest).toHaveBeenCalledTimes(1);
        expect(room).toMatchObject({ id: 'dm-existing' });
    });

    it('실패하면 이동하지 않고 null과 isError로 알린다', async () => {
        const { result } = setup();
        startDmRequest.mockRejectedValue(new Error('nope'));

        const room = await act(async () => result.current.startDm('u2'));

        expect(room).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(result.current.isError).toBe(true);
        expect(logError).toHaveBeenCalled();
    });

    // The guard is a ref precisely for this: both taps land before a re-render, so a state flag
    // would still be false on the second one.
    it('연타해도 한 번만 연다', async () => {
        const { result } = setup();

        await act(async () => {
            await Promise.all([result.current.startDm('u2'), result.current.startDm('u2')]);
        });

        expect(startDmRequest).toHaveBeenCalledTimes(1);
        expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('앞선 시도가 끝난 뒤에는 다시 열 수 있다', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.startDm('u2');
        });
        await act(async () => {
            await result.current.startDm('u3');
        });

        expect(startDmRequest).toHaveBeenCalledTimes(2);
    });

    it('상대 id가 비면 호출하지 않는다', async () => {
        const { result } = setup();

        const room = await act(async () => result.current.startDm(''));

        expect(room).toBeNull();
        expect(startDmRequest).not.toHaveBeenCalled();
    });

    // `/channels/undefined/room` is a real route that renders a broken room, so an id-less response
    // has to stop here rather than become a navigation.
    it('id 없는 방이 오면 이동하지 않는다', async () => {
        const { result } = setup();
        startDmRequest.mockResolvedValue({ sid: '' });

        const room = await act(async () => result.current.startDm('u2'));

        expect(room).toBeNull();
        expect(navigate).not.toHaveBeenCalled();
        expect(result.current.isError).toBe(true);
    });

    it('다시 시도하면 앞선 실패 표시가 지워진다', async () => {
        const { result } = setup();
        startDmRequest.mockRejectedValueOnce(new Error('nope'));

        await act(async () => {
            await result.current.startDm('u2');
        });
        expect(result.current.isError).toBe(true);

        await act(async () => {
            await result.current.startDm('u2');
        });

        expect(result.current.isError).toBe(false);
    });
});
