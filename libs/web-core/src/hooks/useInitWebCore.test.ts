import { renderHook, waitFor } from '@testing-library/react';
import { useInitWebCore } from './useInitWebCore';

const mockInitialize = jest.fn();
const mockIsInitialized = { current: false };

jest.mock('../stores', () => ({
    useWebCoreStore: jest.fn(() => ({
        initialize: mockInitialize,
        get isInitialized() {
            return mockIsInitialized.current;
        },
    })),
}));

describe('useInitWebCore', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        mockIsInitialized.current = false;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('초기화 성공 시 true를 반환한다', async () => {
        mockInitialize.mockResolvedValue(undefined);
        mockIsInitialized.current = true;

        const { result } = renderHook(() => useInitWebCore());

        await waitFor(() => expect(result.current).toBe(true));
        expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('초기화 실패 시 최대 3회 재시도한다', async () => {
        mockInitialize.mockRejectedValue(new Error('Network error'));

        renderHook(() => useInitWebCore());

        // 1회 실패
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));

        // 2초 후 2회차
        jest.advanceTimersByTime(2000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(2));

        // 4초 후 3회차
        jest.advanceTimersByTime(4000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(3));

        // 6초 후 4회차 (마지막)
        jest.advanceTimersByTime(6000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(4));

        // 더 이상 재시도 없음
        jest.advanceTimersByTime(10000);
        expect(mockInitialize).toHaveBeenCalledTimes(4);
    });

    it('재시도 중 성공하면 더 이상 재시도하지 않는다', async () => {
        mockInitialize
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockImplementation(async () => {
                mockIsInitialized.current = true;
            });

        const { result } = renderHook(() => useInitWebCore());

        // 1회 실패
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));

        // 2초 후 2회차 (실패)
        jest.advanceTimersByTime(2000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(2));

        // 4초 후 3회차 (성공)
        jest.advanceTimersByTime(4000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(result.current).toBe(true));

        // 더 이상 재시도 없음
        jest.advanceTimersByTime(10000);
        expect(mockInitialize).toHaveBeenCalledTimes(3);
    });
});
