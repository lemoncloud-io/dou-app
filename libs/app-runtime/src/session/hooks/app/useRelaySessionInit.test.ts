import { renderHook, waitFor } from '@testing-library/react';

const mockInitialize = jest.fn();
const mockMarkSessionInitialized = jest.fn();
const mockIsInitialized = { current: false };

jest.mock('../../auth/services', () => ({
    initializeRelaySession: (...args: unknown[]) => mockInitialize(...args),
}));

jest.mock('../../store', () => ({
    markSessionInitialized: (...args: unknown[]) => mockMarkSessionInitialized(...args),
}));

jest.mock('../../../report', () => ({}));

jest.mock('../session', () => ({
    useSessionAuth: jest.fn(() => ({
        get isInitialized() {
            return mockIsInitialized.current;
        },
    })),
}));

jest.mock('../session/readers/useSessionAuth', () => ({
    useSessionAuth: jest.fn(() => ({
        get isInitialized() {
            return mockIsInitialized.current;
        },
    })),
}));

const { useRelaySessionInit } = require('./useRelaySessionInit');

describe('useRelaySessionInit', () => {
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

        const { result } = renderHook(() => useRelaySessionInit());

        await waitFor(() => expect(result.current).toBe(true));
        expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('초기화 실패 시 최대 3회 재시도한다', async () => {
        mockInitialize.mockRejectedValue(new Error('Network error'));

        renderHook(() => useRelaySessionInit());

        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));

        jest.advanceTimersByTime(2000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(2));

        jest.advanceTimersByTime(4000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(3));

        jest.advanceTimersByTime(6000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(4));

        jest.advanceTimersByTime(10000);
        expect(mockInitialize).toHaveBeenCalledTimes(4);
        expect(mockMarkSessionInitialized).toHaveBeenCalledTimes(1);
    });

    it('재시도 중 성공하면 더 이상 재시도하지 않는다', async () => {
        mockInitialize
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockImplementation(async () => {
                mockIsInitialized.current = true;
            });

        const { result } = renderHook(() => useRelaySessionInit());

        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(1));

        jest.advanceTimersByTime(2000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(2));

        jest.advanceTimersByTime(4000);
        await waitFor(() => expect(mockInitialize).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(result.current).toBe(true));

        jest.advanceTimersByTime(10000);
        expect(mockInitialize).toHaveBeenCalledTimes(3);
    });
});
