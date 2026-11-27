import { MAX_PENDING_REPORTS, PendingReportQueueService } from './PendingReportQueueService';

const store = new Map<string, string>();

jest.mock('react-native-mmkv', () => ({
    createMMKV: () => ({
        getString: (key: string) => store.get(key),
        set: (key: string, value: string) => {
            store.set(key, value);
        },
    }),
}));

const KEY = '@chatic/report.pending';

describe('PendingReportQueueService', () => {
    beforeEach(() => {
        store.clear();
    });

    it('enqueue는 고유 id를 부여해 MMKV에 영속화한다', () => {
        const queue = new PendingReportQueueService();

        queue.enqueue({ category: 'webview-crash', message: 'gone', detectedAt: 100 });
        queue.enqueue({ category: 'native-error', message: 'boom', detectedAt: 200 });

        const reports = queue.list();
        expect(reports).toHaveLength(2);
        expect(reports[0]).toMatchObject({ category: 'webview-crash', message: 'gone', detectedAt: 100 });
        expect(typeof reports[0].id).toBe('string');
        expect(reports[0].id).not.toBe(reports[1].id);
    });

    it('상한(20)을 넘으면 가장 오래된 항목부터 버린다', () => {
        const queue = new PendingReportQueueService();

        for (let i = 0; i < MAX_PENDING_REPORTS + 5; i += 1) {
            queue.enqueue({ category: 'native-error', message: `r-${i}`, detectedAt: i });
        }

        const reports = queue.list();
        expect(reports).toHaveLength(MAX_PENDING_REPORTS);
        expect(reports[0].message).toBe('r-5');
        expect(reports.at(-1)?.message).toBe(`r-${MAX_PENDING_REPORTS + 4}`);
    });

    it('ack는 전송 완료 항목만 제거하고 남은 크기를 반환한다', () => {
        const queue = new PendingReportQueueService();
        queue.enqueue({ category: 'webview-crash', detectedAt: 1 });
        queue.enqueue({ category: 'native-crash', detectedAt: 2 });
        const [first] = queue.list();

        const remaining = queue.ack([first.id]);

        expect(remaining).toBe(1);
        expect(queue.list().map(r => r.category)).toEqual(['native-crash']);
        expect(queue.size()).toBe(1);
    });

    it('오염된 저장소는 빈 큐로 처리한다', () => {
        store.set(KEY, '{nope');
        const queue = new PendingReportQueueService();

        expect(queue.list()).toEqual([]);
        expect(() => queue.enqueue({ category: 'native-error', detectedAt: 1 })).not.toThrow();
        expect(queue.size()).toBe(1);
    });
});
