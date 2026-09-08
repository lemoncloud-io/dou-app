import { PushRegistrationRecord, type RegistrationIdentity } from './registrationRecord';

const identity: RegistrationIdentity = { uid: 'u-1', deviceId: 'd-1', platform: 'ios' };

const makeStore = (seed: Record<string, string> = {}) => {
    const map = new Map<string, string>(Object.entries(seed));
    return {
        map,
        get: jest.fn((key: string) => map.get(key) ?? null),
        set: jest.fn((key: string, value: string) => void map.set(key, value)),
    };
};

describe('PushRegistrationRecord — 설치당 1회 등록 기록', () => {
    it('기록이 없으면 null을 반환한다', () => {
        const record = new PushRegistrationRecord(makeStore());

        expect(record.read(identity)).toBeNull();
    });

    it('쓴 토큰을 그대로 읽어온다', () => {
        const record = new PushRegistrationRecord(makeStore());

        record.write(identity, 'tok-1');

        expect(record.read(identity)).toBe('tok-1');
    });

    it('정책 버전과 identity 세 조각으로 키를 만든다', () => {
        const store = makeStore();
        const record = new PushRegistrationRecord(store);

        record.write(identity, 'tok-1');

        expect(store.set).toHaveBeenCalledWith('push-reg:v1:u-1:d-1:ios', expect.any(String));
    });

    it("키를 '@'로 시작하지 않는다 — logout 정리 루틴이 '@' 접두 키를 지운다", () => {
        const store = makeStore();
        const record = new PushRegistrationRecord(store);

        record.write(identity, 'tok-1');

        expect(store.set.mock.calls[0][0].startsWith('@')).toBe(false);
    });

    it('identity 조각이 하나라도 다르면 남의 기록을 읽지 않는다', () => {
        const record = new PushRegistrationRecord(makeStore());
        record.write(identity, 'tok-1');

        expect(record.read({ ...identity, uid: 'u-2' })).toBeNull();
        expect(record.read({ ...identity, deviceId: 'd-2' })).toBeNull();
        expect(record.read({ ...identity, platform: 'android' })).toBeNull();
    });

    it('손상된 JSON은 던지지 않고 미등록으로 읽는다', () => {
        const record = new PushRegistrationRecord(makeStore({ 'push-reg:v1:u-1:d-1:ios': '{not json' }));

        expect(record.read(identity)).toBeNull();
    });

    it('token 필드가 없는 기록도 미등록으로 읽는다', () => {
        const record = new PushRegistrationRecord(makeStore({ 'push-reg:v1:u-1:d-1:ios': '{"at":1}' }));

        expect(record.read(identity)).toBeNull();
    });

    it('저장소 쓰기가 실패해도 던지지 않는다 — 이미 성공한 등록을 실패로 만들지 않는다', () => {
        const store = makeStore();
        store.set.mockImplementation(() => {
            throw new Error('quota exceeded');
        });
        const record = new PushRegistrationRecord(store);

        expect(() => record.write(identity, 'tok-1')).not.toThrow();
    });

    describe('네이티브 미러 — webview 캐시 삭제를 견디는 계층', () => {
        const makeMirror = (initial: string | null = null) => {
            let held = initial;
            return {
                read: jest.fn(() => Promise.resolve(held)),
                write: jest.fn((raw: string) => {
                    held = raw;
                    return Promise.resolve();
                }),
            };
        };

        it('등록을 기록하면 네이티브에도 함께 쓴다', async () => {
            const mirror = makeMirror();
            const record = new PushRegistrationRecord(makeStore());

            record.write(identity, 'tok-1', mirror);
            await Promise.resolve();

            expect(mirror.write).toHaveBeenCalledWith(expect.stringContaining('tok-1'));
        });

        it('웹 저장소가 비어도 hydrate 후 네이티브 기록으로 답한다', async () => {
            const mirror = makeMirror();
            const seed = new PushRegistrationRecord(makeStore());
            seed.write(identity, 'tok-1', mirror);
            await Promise.resolve();

            // A cleared webview: fresh local store, same native mirror.
            const record = new PushRegistrationRecord(makeStore());
            expect(record.read(identity)).toBeNull();

            await record.hydrate(mirror);

            expect(record.read(identity)).toBe('tok-1');
        });

        it('hydrate가 네이티브 기록을 웹 저장소로 백필한다 — 이후 동기 읽기가 빨라진다', async () => {
            const mirror = makeMirror();
            const seed = new PushRegistrationRecord(makeStore());
            seed.write(identity, 'tok-1', mirror);
            await Promise.resolve();

            const store = makeStore();
            const record = new PushRegistrationRecord(store);
            await record.hydrate(mirror);
            record.read(identity);

            expect(store.set).toHaveBeenCalledWith('push-reg:v1:u-1:d-1:ios', expect.stringContaining('tok-1'));
        });

        it('네이티브 기록의 identity가 다르면 쓰지 않는다', async () => {
            const mirror = makeMirror();
            const seed = new PushRegistrationRecord(makeStore());
            seed.write(identity, 'tok-1', mirror);
            await Promise.resolve();

            const record = new PushRegistrationRecord(makeStore());
            await record.hydrate(mirror);

            expect(record.read({ ...identity, uid: 'other' })).toBeNull();
        });

        it('hydrate는 미러당 한 번만 읽는다', async () => {
            const mirror = makeMirror();
            const record = new PushRegistrationRecord(makeStore());

            await record.hydrate(mirror);
            await record.hydrate(mirror);

            expect(mirror.read).toHaveBeenCalledTimes(1);
        });

        it('미러가 없으면 hydrate는 즉시 끝난다', async () => {
            const record = new PushRegistrationRecord(makeStore());

            await expect(record.hydrate(undefined)).resolves.toBeUndefined();
        });

        it('네이티브 읽기가 실패해도 웹 저장소만으로 동작한다 — 구버전 앱 경로', async () => {
            const mirror = {
                read: jest.fn(() => Promise.reject(new Error('PREF_FETCH_ERROR'))),
                write: jest.fn(() => Promise.resolve()),
            };
            const record = new PushRegistrationRecord(makeStore());
            record.write(identity, 'tok-1', mirror);

            await record.hydrate(mirror);

            expect(record.read(identity)).toBe('tok-1');
        });

        it('네이티브 쓰기가 거부돼도 던지지 않는다 — 구버전 앱은 PREF_KEY_NOT_WRITABLE로 거부한다', async () => {
            const mirror = {
                read: jest.fn(() => Promise.resolve(null)),
                write: jest.fn(() => Promise.reject(new Error('PREF_KEY_NOT_WRITABLE'))),
            };
            const record = new PushRegistrationRecord(makeStore());

            expect(() => record.write(identity, 'tok-1', mirror)).not.toThrow();
            await Promise.resolve();

            expect(record.read(identity)).toBe('tok-1');
        });

        it('네이티브 쓰기가 거부되면 네이티브 기록을 가진 척하지 않는다', async () => {
            const store = makeStore();
            const mirror = {
                read: jest.fn(() => Promise.resolve(null)),
                write: jest.fn(() => Promise.reject(new Error('PREF_KEY_NOT_WRITABLE'))),
            };
            const record = new PushRegistrationRecord(store);
            record.write(identity, 'tok-1', mirror);
            await Promise.resolve();
            await Promise.resolve();

            // The web tier is wiped mid-session; nothing was ever persisted natively, so the record
            // must read as "never registered" and let a registration through.
            store.map.clear();

            expect(record.read(identity)).toBeNull();
        });

        it('미러가 없으면 네이티브 계층이 있는 척하지 않는다 — 데스크톱 경로', () => {
            const store = makeStore();
            const record = new PushRegistrationRecord(store);
            record.write(identity, 'tok-1');

            store.map.clear();

            expect(record.read(identity)).toBeNull();
        });

        it('손상된 네이티브 기록은 미등록으로 읽는다', async () => {
            const mirror = {
                read: jest.fn(() => Promise.resolve('{not json')),
                write: jest.fn(() => Promise.resolve()),
            };
            const record = new PushRegistrationRecord(makeStore());

            await record.hydrate(mirror);

            expect(record.read(identity)).toBeNull();
        });
    });
});
