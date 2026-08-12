import { MmkvLogPersistence } from './persistence';
import type { LogEntry } from '@chatic/logger';

const store = new Map<string, string>();

jest.mock('react-native-mmkv', () => ({
    createMMKV: () => ({
        getString: (key: string) => store.get(key),
        set: (key: string, value: string) => {
            store.set(key, value);
        },
    }),
}));

const KEY = '@chatic/log.queue';

describe('MmkvLogPersistence', () => {
    beforeEach(() => {
        store.clear();
    });

    it('save는 순환 참조·Error를 평탄화해 JSON으로 저장한다', () => {
        const persistence = new MmkvLogPersistence();
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const entries: LogEntry[] = [
            { level: 'info', tag: 'APP', message: 'a', timestamp: 1, data: circular },
            { level: 'error', tag: 'APP', message: 'b', timestamp: 2, error: new Error('boom') },
        ];

        persistence.save(entries);

        const saved = JSON.parse(store.get(KEY) ?? '[]');
        expect(saved[0].data).toBe('{"self":"[Circular]"}');
        expect(saved[1].error).toContain('boom');
    });

    it('과대 페이로드는 필드·총량 상한으로 잘려 저장된다 (MMKV 무한 증식 방지)', () => {
        const persistence = new MmkvLogPersistence();
        const huge = 'x'.repeat(50_000);
        const entries: LogEntry[] = Array.from({ length: 30 }, (_, i) => ({
            level: 'info' as const,
            tag: 'APP',
            message: `m-${i}`,
            timestamp: i,
            data: { blob: huge },
        }));

        persistence.save(entries);

        const raw = store.get(KEY) ?? '';
        // 30 × 50KB = 1.5MB짜리 입력이 공용 예산(40k chars) 안으로 들어와야 한다.
        expect(raw.length).toBeLessThan(60_000);
        const saved = JSON.parse(raw);
        expect(saved.length).toBeLessThan(entries.length);
        // 예산 초과 시 가장 오래된 항목부터 버리므로 최신 로그가 살아남는다.
        expect(saved.at(-1).message).toBe('m-29');
    });

    it('load는 저장했던 항목을 그대로 복원한다 (round-trip)', () => {
        const persistence = new MmkvLogPersistence();
        const entries: LogEntry[] = [{ level: 'warn', tag: 'SOCKET', message: 'w', timestamp: 10, source: 'web' }];

        persistence.save(entries);

        expect(persistence.load()).toEqual([
            { level: 'warn', tag: 'SOCKET', message: 'w', timestamp: 10, source: 'web' },
        ]);
    });

    it('구버전(AppLogInfo, 전 필드 옵셔널) 레코드를 LogEntry로 정규화한다', () => {
        store.set(KEY, JSON.stringify([{ tag: 'WEBVIEW', data: { legacy: true } }]));
        const persistence = new MmkvLogPersistence();

        expect(persistence.load()).toEqual([
            { level: 'info', tag: 'WEBVIEW', message: '', timestamp: 0, data: { legacy: true } },
        ]);
    });

    it('오염된 저장소(JSON 아님/배열 아님)는 빈 배열로 처리한다', () => {
        const persistence = new MmkvLogPersistence();

        store.set(KEY, 'not-json{');
        expect(persistence.load()).toEqual([]);

        store.set(KEY, JSON.stringify({ nope: true }));
        expect(persistence.load()).toEqual([]);
    });

    it('저장분이 없으면 빈 배열을 반환한다', () => {
        expect(new MmkvLogPersistence().load()).toEqual([]);
    });
});
