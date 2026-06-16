import type { IClipboardService } from '../../services/clipboard';
import type { ILogService } from '../../services/log';
import { createClipboardHandlers } from './clipboardHandlers';

const createClipboardServiceMock = (): jest.Mocked<IClipboardService> =>
    ({
        setText: jest.fn().mockResolvedValue(undefined),
    }) as any;

const createLoggerMock = (): ILogService =>
    ({
        subscribe: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }) as any;

describe('createClipboardHandlers', () => {
    it('CopyToClipboard는 클립보드에 텍스트를 쓰고 OnCopyToClipboard 성공 응답을 반환한다', async () => {
        const clipboardService = createClipboardServiceMock();
        const logger = createLoggerMock();
        const handlers = createClipboardHandlers(clipboardService, logger);

        const res = await handlers.handleCopyToClipboard({
            type: 'CopyToClipboard',
            data: { text: 'hello' },
        } as any);

        expect(clipboardService.setText).toHaveBeenCalledWith('hello');
        expect(res).toEqual({
            type: 'OnCopyToClipboard',
            success: true,
            data: { copied: true },
        });
    });

    it('클립보드 쓰기 실패 시 OnCopyToClipboard 실패 응답을 반환한다', async () => {
        const clipboardService = createClipboardServiceMock();
        const logger = createLoggerMock();
        clipboardService.setText.mockRejectedValueOnce(new Error('denied'));
        const handlers = createClipboardHandlers(clipboardService, logger);

        const res = await handlers.handleCopyToClipboard({
            type: 'CopyToClipboard',
            data: { text: 'hello' },
        } as any);

        expect(res.success).toBe(false);
        expect(res.type).toBe('OnCopyToClipboard');
        expect((res as any).error.code).toBe('CLIPBOARD_WRITE_ERROR');
        expect(logger.error).toHaveBeenCalled();
    });
});
