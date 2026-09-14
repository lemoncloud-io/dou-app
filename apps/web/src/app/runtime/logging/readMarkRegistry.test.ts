import { readMarkRegistry } from './readMarkRegistry';

beforeEach(() => readMarkRegistry.reset());

describe('readMarkRegistry — 방이 마크한 읽음 커서 기록', () => {
    it('기록한 커서를 되돌려준다', () => {
        readMarkRegistry.record('ch_1', 10);

        expect(readMarkRegistry.markOf('ch_1')).toBe(10);
    });

    it('마크한 적 없는 방은 undefined다', () => {
        expect(readMarkRegistry.markOf('ch_none')).toBeUndefined();
    });

    // 커서는 전진만 한다 — 뒤로 가는 값이 들어오면 대조 기준이 낮아져 불일치를 놓친다.
    it('더 낮은 값이 들어오면 무시하고 최댓값을 유지한다', () => {
        readMarkRegistry.record('ch_1', 10);
        readMarkRegistry.record('ch_1', 7);

        expect(readMarkRegistry.markOf('ch_1')).toBe(10);
    });

    it('더 높은 값이 들어오면 갱신한다', () => {
        readMarkRegistry.record('ch_1', 10);
        readMarkRegistry.record('ch_1', 12);

        expect(readMarkRegistry.markOf('ch_1')).toBe(12);
    });

    it('빈 channelId와 숫자가 아닌 값은 기록하지 않는다', () => {
        readMarkRegistry.record('', 5);
        readMarkRegistry.record('ch_nan', Number.NaN);

        expect(readMarkRegistry.markOf('')).toBeUndefined();
        expect(readMarkRegistry.markOf('ch_nan')).toBeUndefined();
    });

    describe('상한', () => {
        it('상한을 넘으면 가장 오래된 방부터 버린다', () => {
            for (let i = 0; i < 101; i += 1) readMarkRegistry.record(`ch_${i}`, i + 1);

            expect(readMarkRegistry.markOf('ch_0')).toBeUndefined();
            expect(readMarkRegistry.markOf('ch_100')).toBe(101);
        });

        // 계속 읽고 있는 방이 "한 번 열고 떠난 방들" 때문에 밀려나면 안 된다.
        it('갱신된 방은 축출 순서의 맨 뒤로 이동한다', () => {
            for (let i = 0; i < 100; i += 1) readMarkRegistry.record(`ch_${i}`, i + 1);
            readMarkRegistry.record('ch_0', 999);
            readMarkRegistry.record('ch_new', 1);

            expect(readMarkRegistry.markOf('ch_0')).toBe(999);
            expect(readMarkRegistry.markOf('ch_1')).toBeUndefined();
        });
    });
});
