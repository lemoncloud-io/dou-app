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
    it('cid만 바뀌면 같은 키다 — cid-only 전환은 재부팅이 아니다', () => {
        expect(socketRebootKey({ ...base, cid: 'cloud-2' })).toBe(socketRebootKey(base));
    });

    it('identityToken은 키에 없다 — 토큰만 바뀐 신원 변경은 재인증 소관이다', () => {
        const withToken = { ...base, identityToken: 'token-1' } as never;
        const withOther = { ...base, identityToken: 'token-2' } as never;

        expect(socketRebootKey(withOther)).toBe(socketRebootKey(withToken));
    });
});

describe('socketRebootKey — 슬롯이 없을 때', () => {
    it('config가 없으면 빈 문자열이다 — 게이트가 꺼진 슬롯도 안정된 키를 갖는다', () => {
        expect(socketRebootKey(undefined)).toBe('');
        expect(socketRebootKey()).toBe('');
    });

    it('wssType이 없어도 자리를 비워 유지한다 — 다른 필드가 경계를 넘어 섞이지 않는다', () => {
        expect(socketRebootKey({ url: 'wss://x', deviceId: 'd' } as never)).toBe('wss://x|d|');
    });
});
