import { clearAllPendingQueues, createLogUploadStore, ORPHAN_AFTER_MS, resolveTabId } from './logUploadStore';

import type { LogEntry } from '@chatic/bridges';

const entry = (id: string, timestamp = 1): LogEntry => ({
    id,
    level: 'info',
    tag: 'TEST',
    message: id,
    timestamp,
});

const KEY = (tab: string) => `@chatic/web.log.pending.${tab}`;
const BEAT = (tab: string) => `@chatic/web.log.pending.alive.${tab}`;

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.useRealTimers();
});

describe('createLogUploadStore — 왕복', () => {
    it('저장한 큐를 그대로 읽어온다', () => {
        const store = createLogUploadStore('tab-a');
        store.save([entry('a'), entry('b')]);

        expect(
            createLogUploadStore('tab-a')
                .load()
                .map(e => e.id)
        ).toEqual(['a', 'b']);
    });

    it('탭이 닫혔다 다시 열려도 남아 있다 — sessionStorage였다면 사라졌을 자리', () => {
        createLogUploadStore('tab-a').save([entry('survivor')]);

        // A new store object stands in for the next page load in the same tab.
        expect(createLogUploadStore('tab-a').load()).toHaveLength(1);
    });

    it('빈 큐를 저장하면 키를 지운다 — 빈 레코드를 남기지 않는다', () => {
        const store = createLogUploadStore('tab-a');
        store.save([entry('a')]);
        store.save([]);

        expect(localStorage.getItem(KEY('tab-a'))).toBeNull();
    });

    it('손상된 값이 있어도 빈 큐로 시작한다', () => {
        localStorage.setItem(KEY('tab-a'), '{not json');

        expect(createLogUploadStore('tab-a').load()).toEqual([]);
    });

    it('저장이 실패해도 던지지 않는다 — 쿼터가 로깅을 죽이면 안 된다', () => {
        const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        expect(() => createLogUploadStore('tab-a').save([entry('a')])).not.toThrow();

        setItem.mockRestore();
    });
});

describe('createLogUploadStore — 탭 격리와 고아 입양', () => {
    it('다른 탭의 큐를 건드리지 않는다 — 멀티탭 경합 방지', () => {
        createLogUploadStore('tab-a').save([entry('from-a')]);
        localStorage.setItem(BEAT('tab-a'), String(Date.now()));

        createLogUploadStore('tab-b').save([entry('from-b')]);

        expect(JSON.parse(localStorage.getItem(KEY('tab-a')) ?? '[]')).toHaveLength(1);
    });

    it('살아 있는 탭의 큐는 입양하지 않는다', () => {
        localStorage.setItem(KEY('tab-a'), JSON.stringify([entry('alive')]));
        localStorage.setItem(BEAT('tab-a'), String(Date.now()));

        expect(createLogUploadStore('tab-b').load()).toEqual([]);
    });

    it('하트비트가 끊긴 탭의 미전송분을 입양한다 — 닫힌 탭의 로그를 회수하는 경로', () => {
        localStorage.setItem(KEY('dead-tab'), JSON.stringify([entry('orphan')]));
        localStorage.setItem(BEAT('dead-tab'), String(Date.now() - ORPHAN_AFTER_MS - 1_000));

        expect(
            createLogUploadStore('tab-b')
                .load()
                .map(e => e.id)
        ).toEqual(['orphan']);
    });

    it('하트비트가 아예 없는 큐도 입양한다', () => {
        localStorage.setItem(KEY('ancient'), JSON.stringify([entry('orphan')]));

        expect(
            createLogUploadStore('tab-b')
                .load()
                .map(e => e.id)
        ).toEqual(['orphan']);
    });

    it('입양한 큐의 원본 키를 지운다 — 다음 탭이 또 가져가면 중복 전송이 된다', () => {
        localStorage.setItem(KEY('dead-tab'), JSON.stringify([entry('orphan')]));

        createLogUploadStore('tab-b').load();

        expect(localStorage.getItem(KEY('dead-tab'))).toBeNull();
    });

    it('입양분과 자기 큐를 시간순으로 합친다 — 오래된 것부터 드랍이 의미를 가지려면', () => {
        localStorage.setItem(KEY('tab-b'), JSON.stringify([entry('mine', 200)]));
        localStorage.setItem(KEY('dead-tab'), JSON.stringify([entry('older-orphan', 100)]));

        expect(
            createLogUploadStore('tab-b')
                .load()
                .map(e => e.id)
        ).toEqual(['older-orphan', 'mine']);
    });
});

describe('createLogUploadStore — 하트비트', () => {
    it('start가 하트비트를 남기고 teardown이 지운다', () => {
        const store = createLogUploadStore('tab-a');
        const stop = store.start();

        expect(localStorage.getItem(BEAT('tab-a'))).not.toBeNull();

        stop();
        expect(localStorage.getItem(BEAT('tab-a'))).toBeNull();
    });
});

describe('resolveTabId', () => {
    it('리로드해도 같은 id를 준다 — 로드마다 새로 만들면 새로고침마다 키가 샌다', () => {
        const first = resolveTabId('generated-1');

        expect(resolveTabId('generated-2')).toBe(first);
    });

    it('sessionStorage를 못 쓰면 넘겨받은 값을 쓴다', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });

        expect(resolveTabId('fallback-1')).toBe('fallback-1');

        getItem.mockRestore();
    });
});

describe('createLogUploadStore — 유령 하트비트 청소', () => {
    it('큐가 이미 사라진 죽은 탭의 하트비트를 치운다 — 안 그러면 무한정 쌓인다', () => {
        // A tab that drained its queue and then closed leaves only a heartbeat;
        // nothing else would ever remove it.
        localStorage.setItem(BEAT('dead-tab'), String(Date.now() - ORPHAN_AFTER_MS - 1_000));

        createLogUploadStore('tab-b').load();

        expect(localStorage.getItem(BEAT('dead-tab'))).toBeNull();
    });

    it('살아 있는 탭의 하트비트는 건드리지 않는다', () => {
        localStorage.setItem(BEAT('alive-tab'), String(Date.now()));

        createLogUploadStore('tab-b').load();

        expect(localStorage.getItem(BEAT('alive-tab'))).not.toBeNull();
    });

    it('자기 하트비트는 치우지 않는다', () => {
        const store = createLogUploadStore('tab-b');
        const stop = store.start();

        store.load();

        expect(localStorage.getItem(BEAT('tab-b'))).not.toBeNull();
        stop();
    });
});

describe('createLogUploadStore — 디스크에 남는 내용', () => {
    it('자격증명을 마스킹해서 저장한다 — 원시 엔트리를 쓰면 XSS가 전부 읽는다', () => {
        const store = createLogUploadStore('tab-a');

        store.save([
            {
                ...entry('a'),
                level: 'error',
                error: { config: { headers: { 'x-lemon-identity': 'eyJ.SECRETJWT' } } },
            } as LogEntry,
        ]);

        const raw = localStorage.getItem(KEY('tab-a')) ?? '';
        expect(raw).not.toContain('SECRETJWT');
        expect(raw).toContain('[REDACTED]');
    });

    it('순환 참조가 있어도 저장이 계속된다 — 한 번 던지면 이후 영속화가 조용히 멈춘다', () => {
        const circular: Record<string, unknown> = { name: 'loop' };
        circular.self = circular;
        const store = createLogUploadStore('tab-a');

        store.save([{ ...entry('a'), data: circular } as LogEntry]);

        expect(localStorage.getItem(KEY('tab-a'))).not.toBeNull();
        expect(store.load()).toHaveLength(1);
    });

    it('저장·복원 왕복에서 id와 컨텍스트가 살아남는다', () => {
        const store = createLogUploadStore('tab-a');
        store.save([{ ...entry('keep-me'), runId: 'run-1', uid: 'u-1' } as LogEntry]);

        expect(store.load()[0]).toEqual(expect.objectContaining({ id: 'keep-me', runId: 'run-1', uid: 'u-1' }));
    });
});

describe('clearAllPendingQueues', () => {
    it('origin의 모든 탭 큐를 지운다 — 남기면 다음 사용자가 고아로 입양해 자기 세션으로 올린다', () => {
        createLogUploadStore('tab-a').save([entry('a')]);
        localStorage.setItem(`@chatic/web.log.pending.other-tab`, JSON.stringify([entry('b')]));
        localStorage.setItem(BEAT('other-tab'), String(Date.now()));
        resolveTabId('tab-a');

        clearAllPendingQueues();

        expect(Object.keys(localStorage).filter(k => k.includes('log.pending'))).toEqual([]);
        expect(sessionStorage.getItem('@chatic/web.log.pending.tab')).toBeNull();
    });

    it('스토리지를 못 써도 던지지 않는다', () => {
        const key = jest.spyOn(Storage.prototype, 'key').mockImplementation(() => {
            throw new Error('blocked');
        });

        expect(() => clearAllPendingQueues()).not.toThrow();

        key.mockRestore();
    });
});
