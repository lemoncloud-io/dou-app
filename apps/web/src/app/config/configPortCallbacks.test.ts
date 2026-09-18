import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';
import { logger } from '@chatic/bridges';

const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (o: unknown) => mockToast(o) }));
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('config 포트 콜백 — 실패 표시 (ADR-0080 결정 10)', () => {
    beforeEach(() => jest.clearAllMocks());

    // A write is something the person just did, and if the shell rejects it the setting silently
    // fails to stick. That's the "the screen says it's off but it's actually not" state decision 10 exists to prevent.
    it('셸 쓰기 실패는 로그와 토스트를 둘 다 낸다', () => {
        onShellWriteFailed('ui.theme', new Error('bridge down'));

        expect(logger.error).toHaveBeenCalledWith('CONFIG', expect.stringContaining('ui.theme'), expect.any(Error));
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', description: expect.stringContaining('ui.theme') })
        );
    });

    // A duplicate key is a registry-authoring mistake — there's nothing the person holding the phone can do about it.
    it('중복 키는 로그만 낸다 — 사용자에게 띄우지 않는다', () => {
        onDuplicateKey('ui.theme');

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(mockToast).not.toHaveBeenCalled();
    });
});
