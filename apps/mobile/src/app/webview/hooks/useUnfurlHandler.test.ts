import { renderHook } from '@testing-library/react';

import { useUnfurlHandler } from './useUnfurlHandler';

const mockFetchUrlMetadata = jest.fn();
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('../../hooks', () => ({
    useServices: () => ({
        unfurlService: { fetchUrlMetadata: (...args: unknown[]) => mockFetchUrlMetadata(...args) },
        logService: mockLogger,
    }),
}));

const message = (url: string) => ({ type: 'FetchUrlMetadata', data: { url } }) as any;

describe('useUnfurlHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('서비스 결과를 OnFetchUrlMetadata로 감싸 반환한다', async () => {
        const data = { success: true, url: 'https://example.com/', title: 'Hi' };
        mockFetchUrlMetadata.mockResolvedValue(data);

        const { result } = renderHook(() => useUnfurlHandler());
        const response = await result.current.handleFetchUrlMetadata(message('https://example.com/'));

        expect(mockFetchUrlMetadata).toHaveBeenCalledWith('https://example.com/');
        expect(response).toEqual({ type: 'OnFetchUrlMetadata', success: true, data });
    });

    it('프리뷰가 없어도 메시지 레벨은 success: true다 (브릿지 장애와 구분되어야 한다)', async () => {
        mockFetchUrlMetadata.mockResolvedValue({ success: false, url: 'https://example.com/' });

        const { result } = renderHook(() => useUnfurlHandler());
        const response = await result.current.handleFetchUrlMetadata(message('https://example.com/'));

        expect(response).toEqual({
            type: 'OnFetchUrlMetadata',
            success: true,
            data: { success: false, url: 'https://example.com/' },
        });
    });

    it('서비스가 throw해도 핸들러는 throw하지 않고 프리뷰 없음으로 접는다', async () => {
        mockFetchUrlMetadata.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useUnfurlHandler());
        const response = await result.current.handleFetchUrlMetadata(message('https://example.com/'));

        expect(response).toEqual({
            type: 'OnFetchUrlMetadata',
            success: true,
            data: { success: false, url: 'https://example.com/' },
        });
        expect(mockLogger.warn).toHaveBeenCalledWith('UNFURL', expect.any(String), expect.any(Error));
    });
});
