import { pushEntryRegistry } from './pushEntryRegistry';

beforeEach(() => {
    pushEntryRegistry.reset();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-07T00:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('pushEntryRegistry — 푸시 탭에서 방 진입까지의 인수인계', () => {
    it('탭한 방이 열리면 messageId와 경과 시간을 넘겨준다', () => {
        pushEntryRegistry.begin('ch_1', 'msg_1');
        jest.advanceTimersByTime(1200);

        expect(pushEntryRegistry.consume('ch_1')).toEqual({ messageId: 'msg_1', elapsedMs: 1200 });
    });

    it('한 번 소비하면 사라진다 — 같은 방을 다시 열어도 두 번 세지 않는다', () => {
        pushEntryRegistry.begin('ch_1', 'msg_1');
        pushEntryRegistry.consume('ch_1');

        expect(pushEntryRegistry.consume('ch_1')).toBeUndefined();
    });

    it('푸시로 오지 않은 방은 아무것도 받지 않는다', () => {
        pushEntryRegistry.begin('ch_1', 'msg_1');

        expect(pushEntryRegistry.consume('ch_other')).toBeUndefined();
    });

    // If it was tapped but the user went elsewhere, a later-opened unrelated room must not get the latency figure attached.
    it('TTL을 넘긴 인수인계는 버린다', () => {
        pushEntryRegistry.begin('ch_1', 'msg_1');
        jest.advanceTimersByTime(30_001);

        expect(pushEntryRegistry.consume('ch_1')).toBeUndefined();
    });

    it('messageId가 없어도(구버전 셸) 경과 시간은 넘겨준다', () => {
        pushEntryRegistry.begin('ch_1');
        jest.advanceTimersByTime(500);

        expect(pushEntryRegistry.consume('ch_1')).toEqual({ messageId: undefined, elapsedMs: 500 });
    });

    it('빈 channelId는 기록하지 않는다', () => {
        pushEntryRegistry.begin('', 'msg_1');

        expect(pushEntryRegistry.consume('')).toBeUndefined();
    });
});
