import { onDuplicateKey, onShellWriteFailed } from './configPortCallbacks';
import { logger } from '@chatic/bridges';

const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (o: unknown) => mockToast(o) }));
jest.mock('@chatic/bridges', () => ({
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('config 포트 콜백 — 실패 표시 (ADR-0080 결정 10)', () => {
    beforeEach(() => jest.clearAllMocks());

    // 쓰기는 방금 사람이 한 행동이고, 셸이 거부하면 설정이 조용히 안 붙는다. 그 상태가
    // "화면은 껐다는데 실제로는 안 꺼진" 것이고 결정 10이 막으려는 것이다.
    it('셸 쓰기 실패는 로그와 토스트를 둘 다 낸다', () => {
        onShellWriteFailed('ui.theme', new Error('bridge down'));

        expect(logger.error).toHaveBeenCalledWith('CONFIG', expect.stringContaining('ui.theme'), expect.any(Error));
        expect(mockToast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', description: expect.stringContaining('ui.theme') })
        );
    });

    // 중복 키는 레지스트리 작성 오류다 — 폰을 든 사람이 할 수 있는 일이 없다.
    it('중복 키는 로그만 낸다 — 사용자에게 띄우지 않는다', () => {
        onDuplicateKey('ui.theme');

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(mockToast).not.toHaveBeenCalled();
    });
});
