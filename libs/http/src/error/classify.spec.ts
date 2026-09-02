import { classifyError, ErrorType } from './classify';

describe('classifyError — 서명 오류 분류 (2026-08 session audit §5-6)', () => {
    // throwIfApiError가 만드는 Error에는 HTTP status가 없다 — 서명 검증 실패가 예전엔 UNKNOWN으로
    // 분류돼 withRetry가 같은 재료로 재서명·재시도하는 폭주 부스터였다.
    it.each(['invalid signature', 'Signature Mismatch detected', 'signature is not valid', 'no auth model'])(
        'status 없는 "%s" 에러는 재시도·로그아웃 없이 AUTHENTICATION으로 분류한다',
        message => {
            const result = classifyError(new Error(message));

            expect(result.type).toBe(ErrorType.AUTHENTICATION);
            expect(result.shouldRetry).toBe(false);
            expect(result.shouldLogout).toBe(false);
        }
    );

    it('403은 기존 정책(로그아웃) 그대로 유지한다 — 서명 문구가 있어도 status가 우선', () => {
        const error = Object.assign(new Error('invalid signature'), { status: 403 });

        const result = classifyError(error);

        expect(result.type).toBe(ErrorType.AUTHENTICATION);
        expect(result.shouldRetry).toBe(false);
        expect(result.shouldLogout).toBe(true);
    });

    it('AWS credential 만료(signature timeout)는 기존 로그아웃 분류를 유지한다', () => {
        const result = classifyError(new Error('signature timeout while verifying'));

        expect(result.type).toBe(ErrorType.AUTHENTICATION);
        expect(result.shouldRetry).toBe(false);
        expect(result.shouldLogout).toBe(true);
    });

    it('서명과 무관한 status 없는 에러는 여전히 UNKNOWN(재시도 가능)이다', () => {
        const result = classifyError(new Error('something odd happened'));

        expect(result.type).toBe(ErrorType.UNKNOWN);
        expect(result.shouldRetry).toBe(true);
    });

    it('"signature" 단어만으로는 재분류하지 않는다 (invalid/mismatch/not valid 결합 필요)', () => {
        const result = classifyError(new Error('recomputing signature for request'));

        expect(result.type).toBe(ErrorType.UNKNOWN);
    });
});
