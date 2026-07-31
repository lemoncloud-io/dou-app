import { isInviteDeclined, recordDeclinedInvite, type DeclineStorage } from './relayInviteDecline';

const STORAGE_KEY = 'chatic-web-relay-invite-declined';

// In-memory storage double so the pure read/write contract is testable without a DOM.
const createStorage = (initial?: Record<string, string>): DeclineStorage & { read(): string | null } => {
    const map = new Map<string, string>(Object.entries(initial ?? {}));
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        read: () => map.get(STORAGE_KEY) ?? null,
    };
};

let storage: ReturnType<typeof createStorage>;

beforeEach(() => {
    storage = createStorage();
});

describe('relayInviteDecline', () => {
    it('기록한 초대는 거절된 것으로 조회된다', () => {
        recordDeclinedInvite('invite-1', storage);

        expect(isInviteDeclined('invite-1', storage)).toBe(true);
        expect(isInviteDeclined('invite-2', storage)).toBe(false);
    });

    it('id가 없으면 아무것도 기록하지 않는다', () => {
        recordDeclinedInvite(undefined, storage);

        expect(storage.read()).toBeNull();
        expect(isInviteDeclined(undefined, storage)).toBe(false);
    });

    it('같은 초대를 두 번 거절해도 중복 저장하지 않는다', () => {
        recordDeclinedInvite('invite-1', storage);
        recordDeclinedInvite('invite-1', storage);

        expect(JSON.parse(storage.read() as string)).toEqual(['invite-1']);
    });

    it('상한을 넘으면 오래된 항목부터 버린다', () => {
        for (let i = 0; i < 55; i += 1) recordDeclinedInvite(`invite-${i}`, storage);

        const stored = JSON.parse(storage.read() as string) as string[];
        expect(stored).toHaveLength(50);
        expect(stored[0]).toBe('invite-5');
        expect(isInviteDeclined('invite-0', storage)).toBe(false);
        expect(isInviteDeclined('invite-54', storage)).toBe(true);
    });

    it('깨진 JSON은 빈 목록으로 안전하게 처리한다', () => {
        const broken = createStorage({ [STORAGE_KEY]: '{not json' });

        expect(isInviteDeclined('invite-1', broken)).toBe(false);
    });

    // The invite code is a credential — the stored payload must stay a bare list of ids
    // (05-client-guide §B-1).
    it('초대 id 목록 외에는 아무것도 저장하지 않는다', () => {
        recordDeclinedInvite('invite-1', storage);
        recordDeclinedInvite('invite-2', storage);

        expect(JSON.parse(storage.read() as string)).toEqual(['invite-1', 'invite-2']);
    });
});
