import { stashRoomScroll, takeRoomScroll } from './roomScrollMemory';

describe('roomScrollMemory — 스레드 왕복 시 방 스크롤 위치', () => {
    it('맡긴 위치를 그대로 돌려준다', () => {
        stashRoomScroll('ch-1', -320);
        expect(takeRoomScroll('ch-1')).toBe(-320);
    });

    // 한 번만 쓴다: 스레드에서 돌아올 때만 복원하고, 홈에서 방으로 들어갈 때는
    // 메신저 관례대로 최신 메시지에 착지해야 한다.
    it('한 번 꺼내면 사라진다 — 다음 진입은 복원하지 않는다', () => {
        stashRoomScroll('ch-1', -320);
        takeRoomScroll('ch-1');
        expect(takeRoomScroll('ch-1')).toBeNull();
    });

    it('맡긴 적 없는 채널은 null이다', () => {
        expect(takeRoomScroll('never-visited')).toBeNull();
    });

    it('채널별로 따로 기억한다', () => {
        stashRoomScroll('ch-1', -100);
        stashRoomScroll('ch-2', -200);

        expect(takeRoomScroll('ch-2')).toBe(-200);
        expect(takeRoomScroll('ch-1')).toBe(-100);
    });

    // 바닥(0)도 유효한 위치다 — undefined와 구분되지 않으면 바닥에 있던 사람이
    // "복원할 것 없음"으로 취급된다.
    it('바닥(0)도 기억한다', () => {
        stashRoomScroll('ch-1', 0);
        expect(takeRoomScroll('ch-1')).toBe(0);
    });
});
