import { renderHook } from '@testing-library/react';

import { useCustomZipHandler } from './useCustomZipHandler';

const mockApply = jest.fn();
const mockDisable = jest.fn();
const mockRead = jest.fn();

let allowed = true;
jest.mock('../../customZip', () => ({
    applyCustomZip: (url: string) => mockApply(url),
    disableCustomZip: () => mockDisable(),
    readCustomZipState: () => mockRead(),
    isCustomZipAllowed: () => allowed,
}));
jest.mock('../../services', () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

/** 게이트가 함수라 모듈을 다시 읽지 않아도 스테이지를 바꿀 수 있다. */
const load = async (stage: string) => {
    allowed = stage !== 'PROD';
    return useCustomZipHandler;
};

const msg = (url = 'https://cdn/x.zip') => ({ type: 'ApplyCustomZip', data: { url } }) as never;

describe('useCustomZipHandler — PROD fail-closed (ADR-0080 결정 13)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRead.mockReturnValue({ localRoot: null, serverUrl: null });
    });

    // zip 주소는 WebView가 실행할 코드를 정한다 — 결정 13이 웹 주소 바꾸기를 지운 것과 같은 보안면이고,
    // 앱의 FloatingMenu가 걸던 VITE_ENV !== 'PROD' 가드를 여기로 옮긴 것이다.
    it('PROD 빌드는 적용을 거부하고 로더를 부르지 않는다', async () => {
        const useHandler = await load('PROD');
        const { result } = renderHook(() => useHandler());

        const res = await result.current.handleApplyCustomZip(msg());

        expect(mockApply).not.toHaveBeenCalled();
        expect(res).toMatchObject({ success: false, error: { code: 'CUSTOM_ZIP_FORBIDDEN' } });
    });

    it('DEV 빌드는 적용하고 serverUrl을 돌려준다', async () => {
        mockApply.mockResolvedValue('http://127.0.0.1:8890');
        const useHandler = await load('DEV');
        const { result } = renderHook(() => useHandler());

        const res = await result.current.handleApplyCustomZip(msg());

        expect(mockApply).toHaveBeenCalledWith('https://cdn/x.zip');
        expect(res).toMatchObject({ success: true, data: { serverUrl: 'http://127.0.0.1:8890' } });
    });

    it('적용이 실패하면 이유를 돌려준다', async () => {
        mockApply.mockRejectedValue(new Error('no index.html'));
        const useHandler = await load('DEV');
        const { result } = renderHook(() => useHandler());

        const res = await result.current.handleApplyCustomZip(msg());

        expect(res).toMatchObject({ success: false, error: { code: 'CUSTOM_ZIP_ERROR' } });
    });

    // 빌드가 PROD로 바뀌었는데 zip이 켜져 있는 기기가 갇히면 안 된다 — 끄기는 탈출로다.
    it('끄기는 PROD에서도 거부하지 않는다', async () => {
        mockDisable.mockResolvedValue(undefined);
        const useHandler = await load('PROD');
        const { result } = renderHook(() => useHandler());

        const res = await result.current.handleDisableCustomZip({ type: 'DisableCustomZip', data: {} } as never);

        expect(mockDisable).toHaveBeenCalledTimes(1);
        expect(res).toMatchObject({ success: true });
    });

    it('상태 조회는 이 빌드가 허용하는지도 함께 알린다', async () => {
        mockRead.mockReturnValue({ localRoot: '/r', serverUrl: 'http://x/' });
        const useHandler = await load('PROD');
        const { result } = renderHook(() => useHandler());

        const res = await result.current.handleFetchCustomZipStatus({
            type: 'FetchCustomZipStatus',
            data: {},
        } as never);

        expect(res).toMatchObject({ data: { allowed: false, localRoot: '/r', serverUrl: 'http://x/' } });
    });
});
