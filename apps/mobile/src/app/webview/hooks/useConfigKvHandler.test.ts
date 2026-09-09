import { renderHook } from '@testing-library/react';

import { useConfigKvHandler } from './useConfigKvHandler';

const configKvService = {
    getAll: jest.fn().mockReturnValue({}),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
};
const logService = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('../../hooks', () => ({
    useServices: () => ({ configKvService, logService }),
}));

const save = (key: string, value: string) =>
    renderHook(() => useConfigKvHandler()).result.current.handleSaveConfigValue({
        type: 'SaveConfigValue',
        data: { key, value },
    } as any);

const clear = (key: string) =>
    renderHook(() => useConfigKvHandler()).result.current.handleClearConfigValue({
        type: 'ClearConfigValue',
        data: { key },
    } as any);

describe('useConfigKvHandler — 셸 레인의 범용 KV 브릿지 핸들러', () => {
    beforeEach(() => jest.clearAllMocks());

    it('SaveConfigValue는 키를 검증하지 않고 그대로 저장한다 — 셸은 의미를 모른다', async () => {
        const res = await save('debug.mockService.mode', '"fixture"');

        expect(configKvService.set).toHaveBeenCalledWith('debug.mockService.mode', '"fixture"');
        expect(res).toEqual({
            type: 'OnSaveConfigValue',
            success: true,
            data: { key: 'debug.mockService.mode', success: true },
        });
    });

    it('저장이 실패하면 success: false로 보고한다 — 확인 응답이 실패를 감추지 않는다', async () => {
        configKvService.set.mockRejectedValueOnce(new Error('mmkv write failed'));

        const res = await save('ui.theme', '"dark"');

        expect(res).toEqual({
            type: 'OnSaveConfigValue',
            success: false,
            error: { code: 'CONFIG_SAVE_ERROR', message: 'mmkv write failed' },
        });
    });

    it('ClearConfigValue는 키를 그대로 지운다', async () => {
        const res = await clear('ui.theme');

        expect(configKvService.remove).toHaveBeenCalledWith('ui.theme');
        expect(res).toEqual({ type: 'OnClearConfigValue', success: true, data: { key: 'ui.theme', success: true } });
    });

    it('삭제가 실패하면 success: false로 보고한다', async () => {
        configKvService.remove.mockRejectedValueOnce(new Error('mmkv remove failed'));

        const res = await clear('ui.theme');

        expect(res).toEqual({
            type: 'OnClearConfigValue',
            success: false,
            error: { code: 'CONFIG_CLEAR_ERROR', message: 'mmkv remove failed' },
        });
    });
});
