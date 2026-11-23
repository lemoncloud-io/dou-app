import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';
import { logger } from '@chatic/bridges';

const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (o: unknown) => mockToast(o) }));
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('i18next', () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
}));

describe('config 포트 콜백 — 실패 표시 (ADR-0080 결정 10)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('셸 쓰기 실패는 로그와 토스트를 둘 다 낸다', () => {
        onShellWriteFailed('ui.theme', new Error('bridge down'));

        expect(logger.error).toHaveBeenCalledWith('CONFIG', expect.stringContaining('ui.theme'), expect.any(Error));
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', description: expect.stringContaining('ui.theme') })
        );
    });

    it('중복 키는 로그만 낸다 — 사용자에게 띄우지 않는다', () => {
        onDuplicateKey('ui.theme');

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(mockToast).not.toHaveBeenCalled();
    });
});
