/**
 * 이 키의 값이 아니라 **무엇을 빼놨는지**가 계약이다.
 *
 * `SocketBinder`는 이 키가 움직이면 슬롯을 재부팅하고, `SocketReauthBinder`는 같은 키가 움직였으면
 * 재인증을 **건너뛴다**(재부팅이 이미 새 신원으로 재등록하므로). 그래서 포함/제외를 잘못 잡으면
 * 두 방향으로 조용히 깨진다 — 넣어서는 안 될 것을 넣으면 멀쩡한 소켓을 재부팅하고, 빼서는 안 될
 * 것을 빼면 아무도 재등록하지 않는다.
 *
 * 두 소비자가 같은 함수를 쓰는 것이 그 합의의 유일한 장치이므로(둘 중 어느 쪽도 이 함수를 소유할
 * 수 없다), 계약은 함수 옆에서 잠근다.
 */
import { socketRebootKey } from './socketRebootKey';

const base = { url: 'wss://relay', deviceId: 'device-1', wssType: 'relay' as const, cid: 'cloud-1' };

describe('socketRebootKey — 포함하는 것', () => {
    it.each([
        ['url', { url: 'wss://other' }],
        ['deviceId', { deviceId: 'device-2' }],
        ['wssType', { wssType: 'cloud' as const }],
    ])('%s가 바뀌면 키가 바뀐다 — 소켓을 다시 지어야 하는 변경이다', (_label, patch) => {
        expect(socketRebootKey({ ...base, ...patch })).not.toBe(socketRebootKey(base));
    });
});

describe('socketRebootKey — 제외하는 것', () => {
    /**
     * 낙관적 클라우드 전환(§8-4)은 cid만 먼저 뒤집고 url은 그대로다. 여기서 재부팅하면 아직
     * outgoing 클라우드에 붙어 있는 소켓을 target cid로 다시 고정해 캐시를 오염시킨다.
     */
    it('cid만 바뀌면 같은 키다 — cid-only 전환은 재부팅이 아니다', () => {
        expect(socketRebootKey({ ...base, cid: 'cloud-2' })).toBe(socketRebootKey(base));
    });

    /**
     * 게스트 → 소셜 승격(§6-7)은 토큰만 바꾼다. 재부팅이 아니라 같은 연결에서의 재인증이
     * 이 경우의 처리이고, 그 판단을 하는 것이 `SocketReauthBinder`다.
     */
    it('identityToken은 키에 없다 — 토큰만 바뀐 신원 변경은 재인증 소관이다', () => {
        const withToken = { ...base, identityToken: 'token-1' } as never;
        const withOther = { ...base, identityToken: 'token-2' } as never;

        expect(socketRebootKey(withOther)).toBe(socketRebootKey(withToken));
    });
});

describe('socketRebootKey — 슬롯이 없을 때', () => {
    it('config가 없으면 빈 문자열이다 — 게이트가 꺼진 슬롯도 안정된 키를 갖는다', () => {
        // effect 의존성으로 쓰이므로 undefined가 아니라 안정된 값이어야 한다: 슬롯이 꺼진 채로
        // 리렌더가 반복돼도 effect가 다시 돌지 않는다.
        expect(socketRebootKey(undefined)).toBe('');
        expect(socketRebootKey()).toBe('');
    });

    it('wssType이 없어도 자리를 비워 유지한다 — 다른 필드가 경계를 넘어 섞이지 않는다', () => {
        // `a|b` 두 필드만 이어붙이면 ('a','b|c')와 ('a|b','c')가 같은 키가 된다. 구분자를 항상
        // 두 개 쓰는 것이 그 충돌을 막는다.
        expect(socketRebootKey({ url: 'wss://x', deviceId: 'd' } as never)).toBe('wss://x|d|');
    });
});
