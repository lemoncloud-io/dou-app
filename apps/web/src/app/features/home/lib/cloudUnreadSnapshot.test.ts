import { readCloudUnreadSnapshot, sumSnapshot, writeCloudUnread, type SnapshotStorage } from './cloudUnreadSnapshot';

// In-memory storage double so the pure read/write contract is testable without a DOM. Tracks
// setItem calls so we can assert a no-op write is actually skipped.
interface FakeStorage extends SnapshotStorage {
    writes: number;
}
const createStorage = (initial?: Record<string, string>): FakeStorage => {
    const map = new Map<string, string>(Object.entries(initial ?? {}));
    return {
        writes: 0,
        getItem: key => map.get(key) ?? null,
        setItem(key, value) {
            this.writes += 1;
            map.set(key, value);
        },
    };
};

let storage: FakeStorage;

beforeEach(() => {
    storage = createStorage();
});

describe('readCloudUnreadSnapshot', () => {
    it('저장된 값이 없으면 빈 맵을 반환한다', () => {
        expect(readCloudUnreadSnapshot(storage)).toEqual({});
    });

    it('깨진 JSON은 빈 맵으로 안전하게 처리한다', () => {
        const broken = createStorage({ 'chatic-web-cloud-unread': '{not json' });
        expect(readCloudUnreadSnapshot(broken)).toEqual({});
    });
});

describe('writeCloudUnread', () => {
    it('count > 0이면 cid에 기록하고 되읽어진다', () => {
        writeCloudUnread('cloud-1', 3, storage);
        expect(readCloudUnreadSnapshot(storage)).toEqual({ 'cloud-1': 3 });
    });

    it('count 0이면 항목을 제거해 맵을 희소하게 유지한다', () => {
        writeCloudUnread('cloud-1', 3, storage);
        writeCloudUnread('cloud-1', 0, storage);
        expect(readCloudUnreadSnapshot(storage)).toEqual({});
    });

    it('다른 클라우드 항목은 보존한다', () => {
        writeCloudUnread('cloud-1', 3, storage);
        expect(writeCloudUnread('cloud-2', 5, storage)).toEqual({ 'cloud-1': 3, 'cloud-2': 5 });
    });

    it('값이 그대로면 storage에 다시 쓰지 않는다', () => {
        writeCloudUnread('cloud-1', 3, storage);
        expect(storage.writes).toBe(1);
        writeCloudUnread('cloud-1', 3, storage);
        expect(storage.writes).toBe(1);
    });
});

describe('sumSnapshot', () => {
    it('모든 클라우드 값을 더해 뱃지 합계를 만든다', () => {
        expect(sumSnapshot({ 'cloud-1': 3, 'cloud-2': 5 })).toBe(8);
    });

    it('빈 스냅샷은 0이다', () => {
        expect(sumSnapshot({})).toBe(0);
    });
});
