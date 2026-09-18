import { useLoaderStore } from './useGlobalLoader';

describe('useGlobalLoader', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        useLoaderStore.getState().setIsLoading(false);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('setIsLoading(true)로 로딩 상태가 켜진다', () => {
        useLoaderStore.getState().setIsLoading(true);
        expect(useLoaderStore.getState().isLoading).toBe(true);
    });

    it('setIsLoading(false)로 로딩 상태가 꺼진다', () => {
        useLoaderStore.getState().setIsLoading(true);
        useLoaderStore.getState().setIsLoading(false);
        expect(useLoaderStore.getState().isLoading).toBe(false);
    });

    it('메시지가 함께 설정된다', () => {
        useLoaderStore.getState().setIsLoading(true, '처리 중...');
        expect(useLoaderStore.getState().message).toBe('처리 중...');
    });

    it('30초 후 로딩 상태가 자동으로 해제된다', () => {
        useLoaderStore.getState().setIsLoading(true, 'test');

        expect(useLoaderStore.getState().isLoading).toBe(true);

        jest.advanceTimersByTime(29_999);
        expect(useLoaderStore.getState().isLoading).toBe(true);

        jest.advanceTimersByTime(1);
        expect(useLoaderStore.getState().isLoading).toBe(false);
        expect(useLoaderStore.getState().message).toBeUndefined();
    });

    it('setIsLoading(false) 호출 시 타임아웃이 클리어된다 (30초 후에도 변화 없음)', () => {
        useLoaderStore.getState().setIsLoading(true);
        useLoaderStore.getState().setIsLoading(false);

        jest.advanceTimersByTime(30_000);
        // Already false, so no change
        expect(useLoaderStore.getState().isLoading).toBe(false);
    });

    it('setIsLoading(true) 재호출 시 타임아웃이 리셋된다', () => {
        useLoaderStore.getState().setIsLoading(true);

        jest.advanceTimersByTime(20_000); // 20 seconds elapsed
        expect(useLoaderStore.getState().isLoading).toBe(true);

        // Set to true again → timeout resets
        useLoaderStore.getState().setIsLoading(true, 'renewed');

        jest.advanceTimersByTime(20_000); // at the original 30s mark → still valid due to the reset
        expect(useLoaderStore.getState().isLoading).toBe(true);

        jest.advanceTimersByTime(10_000); // the new timeout's 30 seconds have elapsed
        expect(useLoaderStore.getState().isLoading).toBe(false);
    });
});
