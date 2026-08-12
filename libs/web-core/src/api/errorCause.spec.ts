import { collectCauses } from './errorCause';

describe('collectCauses', () => {
    it('cause가 없으면 빈 배열', () => {
        expect(collectCauses(new Error('lonely'))).toEqual([]);
    });

    it('감싼 에러의 원인을 바깥→안 순서로 편다', () => {
        const root = new Error('JSON.parse failed');
        const middle = new Error('decode failed', { cause: root });
        const outer = new Error('render failed', { cause: middle });

        const causes = collectCauses(outer);

        // outer 자신은 빠진다 — 리포트가 이미 그 message/stack을 싣는다.
        expect(causes.map(c => c.message)).toEqual(['decode failed', 'JSON.parse failed']);
        expect(typeof causes[1].stack).toBe('string');
    });

    it('Error가 아닌 cause도 버리지 않는다', () => {
        expect(collectCauses(new Error('x', { cause: 'plain string' }))[0]).toEqual({ message: 'plain string' });
        expect(collectCauses(new Error('x', { cause: 42 }))[0]).toEqual({ message: '42' });
    });

    it('message를 가진 객체 cause는 그 message를 쓴다', () => {
        expect(collectCauses(new Error('x', { cause: { message: 'from object' } }))[0]).toEqual({
            message: 'from object',
        });
    });

    // lemon-model의 WebSocket 경로가 raw Event를 reject한다 — String()은 이걸
    // "[object Event]"로 뭉갠다.
    it('type만 있는 이벤트류 cause는 타입을 남긴다', () => {
        expect(collectCauses(new Error('x', { cause: { type: 'close' } }))[0]).toEqual({ message: 'close event' });
    });

    // 래퍼가 다시 래핑되면 순환이 생길 수 있고, 그러면 while이 끝나지 않는다.
    it('순환 cause에서 무한 루프에 빠지지 않는다', () => {
        const a = new Error('a');
        const b = new Error('b', { cause: a });
        (a as Error & { cause?: unknown }).cause = b;

        const causes = collectCauses(a);

        expect(causes.map(c => c.message)).toEqual(['b', '[circular cause]']);
    });

    it('체인이 길어도 5단계에서 멈춘다', () => {
        let error = new Error('depth-0');
        for (let i = 1; i <= 10; i += 1) error = new Error(`depth-${i}`, { cause: error });

        expect(collectCauses(error)).toHaveLength(5);
    });

    it('거대한 stack은 잘라서 리포트 크기를 지킨다', () => {
        const huge = new Error('huge');
        huge.stack = 'x'.repeat(50_000);

        const [cause] = collectCauses(new Error('outer', { cause: huge }));

        expect(cause.stack?.length).toBeLessThan(5_000);
        expect(cause.stack).toContain('…(+');
    });

    it('총량 예산을 넘으면 거기서 끊는다', () => {
        // 각 링크가 4000자 stack을 들고 오므로 12000자 예산은 3개 남짓에서 소진된다.
        let error = new Error('root');
        error.stack = 'y'.repeat(10_000);
        for (let i = 0; i < 4; i += 1) {
            const next = new Error(`wrap-${i}`, { cause: error });
            next.stack = 'z'.repeat(10_000);
            error = next;
        }

        const causes = collectCauses(error);
        const total = causes.reduce((sum, c) => sum + c.message.length + (c.stack?.length ?? 0), 0);

        expect(total).toBeLessThanOrEqual(12_000);
        expect(causes.length).toBeLessThan(5);
    });
});
