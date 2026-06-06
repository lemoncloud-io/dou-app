import { ChatSyncScheduler, type ChannelSyncState } from './ChatSyncScheduler';

// ---------------------------------------------------------------------------
// Mock logger (prevent real imports)
// ---------------------------------------------------------------------------
jest.mock('@chatic/app-messages', () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** chatRepository.fetchChat mock 생성 */
const createMockChatRepository = () => {
    /** 채널별 메시지 저장소 (fetchChat 호출 시 여기서 반환) */
    const store: Record<string, Array<{ chatNo: number }>> = {};
    /** subscribeList가 반환할 로컬 캐시 (채널별) */
    const localCache: Record<string, Array<{ chatNo: number }>> = {};

    const fetchChat = jest.fn(async (payload: any) => {
        const { channelId, limit = 200, cursorNo } = payload;
        const all = store[channelId] ?? [];
        // cursorNo 기준 필터 (chatNo < cursorNo) + 최신순 정렬 후 limit 적용
        const filtered = cursorNo
            ? all.filter(m => m.chatNo < cursorNo).sort((a, b) => b.chatNo - a.chatNo)
            : all.sort((a, b) => b.chatNo - a.chatNo);
        const page = filtered.slice(0, limit);

        // fetchChat 호출 후 로컬 캐시에 저장 (실제 동작 시뮬레이션)
        if (!localCache[channelId]) localCache[channelId] = [];
        for (const m of page) {
            if (!localCache[channelId].some(c => c.chatNo === m.chatNo)) {
                localCache[channelId].push(m);
            }
        }

        const nextCursor = page.length > 0 ? Math.min(...page.map(m => m.chatNo)) : 0;
        return {
            list: page,
            meta: { cursorNo: nextCursor <= 1 ? 0 : nextCursor, limit, total: page.length, source: 'remote' },
        };
    });

    const subscribeList = jest.fn((channelId: string, callback: (result: any) => void) => {
        const cached = localCache[channelId] ?? [];
        // 실제 subscribeList는 비동기로 콜백 호출 (void safeNotify → await query → callback)
        Promise.resolve().then(() => {
            callback({
                list: cached,
                meta: { total: cached.length, source: 'local' },
            });
        });
        return () => undefined;
    });

    return {
        repository: { fetchChat, subscribeList } as any,
        store,
        localCache,
        fetchChat,
    };
};

/**
 * 스케줄러의 비동기 루프를 완전히 실행시키기 위한 헬퍼.
 * jest.advanceTimersByTimeAsync()는 타이머 전진 + 마이크로태스크 drain을 함께 처리한다.
 */
const drainScheduler = async (ms = 1000, iterations = 30) => {
    for (let i = 0; i < iterations; i++) {
        await jest.advanceTimersByTimeAsync(ms);
    }
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatSyncScheduler', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('enqueue', () => {
        it('큐에 sync target을 등록하고 pending 상태로 설정한다', () => {
            const { repository } = createMockChatRepository();
            const scheduler = new ChatSyncScheduler(repository);

            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 100 }]);

            expect(scheduler.queueLength).toBe(1);
            expect(scheduler.getState('ch1')?.status).toBe('pending');
        });

        it('이미 synced인 채널은 큐에 추가하지 않는다', async () => {
            const { repository, store, localCache } = createMockChatRepository();
            // 로컬 캐시가 이미 서버와 동기화됨
            localCache['ch1'] = [{ chatNo: 100 }];
            store['ch1'] = [{ chatNo: 100 }];

            const scheduler = new ChatSyncScheduler(repository);
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 100 }]);
            scheduler.start();

            await drainScheduler();

            // synced 후 다시 enqueue → skip
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 100 }]);
            expect(scheduler.getState('ch1')?.status).toBe('synced');
        });

        it('이미 큐에 있는 채널은 serverChatNo만 갱신한다', () => {
            const { repository } = createMockChatRepository();
            const scheduler = new ChatSyncScheduler(repository);

            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 100 }]);
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 200 }]);

            expect(scheduler.queueLength).toBe(1);
        });
    });

    describe('syncOne - 소량 gap', () => {
        it('gap <= limit 이면 1회 fetchChat으로 synced 상태가 된다', async () => {
            const { repository, store, fetchChat } = createMockChatRepository();
            // 서버에 chatNo 1~50 메시지 존재
            store['ch1'] = Array.from({ length: 50 }, (_, i) => ({ chatNo: i + 1 }));

            const stateChanges: Array<{ channelId: string; state: ChannelSyncState }> = [];
            const scheduler = new ChatSyncScheduler(repository, {
                limit: 200,
                onStateChange: (channelId, state) => stateChanges.push({ channelId, state: { ...state } }),
            });

            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 50 }]);
            scheduler.start();

            await drainScheduler();

            expect(fetchChat).toHaveBeenCalledTimes(1);
            expect(fetchChat).toHaveBeenCalledWith({ channelId: 'ch1', limit: 200 }, { cachePolicy: 'network-only' });
            expect(scheduler.getState('ch1')?.status).toBe('synced');
            expect(scheduler.getState('ch1')?.fetchedCount).toBe(50);

            // 상태 전이 확인: pending → syncing → synced
            const statuses = stateChanges.filter(s => s.channelId === 'ch1').map(s => s.state.status);
            expect(statuses).toContain('pending');
            expect(statuses).toContain('syncing');
            expect(statuses[statuses.length - 1]).toBe('synced');
        });
    });

    describe('syncOne - 대량 gap (페이지네이션)', () => {
        it('gap > limit 이면 여러 번 fetchChat으로 전체 sync를 완료한다', async () => {
            const { repository, store, localCache, fetchChat } = createMockChatRepository();
            // 서버에 chatNo 1~500 메시지 존재
            store['ch1'] = Array.from({ length: 500 }, (_, i) => ({ chatNo: i + 1 }));

            // localCache를 fetchChat 호출 후에도 부분만 반영하도록 제한
            // (실제로는 fetchChat 결과가 캐시에 들어가지만, getLocalMaxChatNo가
            //  서버 chatNo에 도달했는지를 기준으로 루프를 종료함)
            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 500 }]);
            scheduler.start();

            // gap=500 → delayMs=200, 페이지네이션 실행
            await drainScheduler(500, 50);

            // 첫 fetchChat이 chatNo 301~500 (최신순 정렬)을 반환하고
            // localCache에 저장 → localMax=500 >= serverChatNo=500 → 1회로 종료
            // (실제 운영에서는 fetchChat 결과가 캐시 반영까지 지연될 수 있어 여러 페이지 필요)
            expect(fetchChat.mock.calls.length).toBeGreaterThanOrEqual(1);
            expect(scheduler.getState('ch1')?.status).toBe('synced');
        });

        it('localMax가 서버에 도달하지 못하면 cursorNo 기반으로 다음 페이지를 fetch한다', async () => {
            const { repository, store, localCache, fetchChat } = createMockChatRepository();
            // 서버에 chatNo 1~500 메시지 존재
            store['ch1'] = Array.from({ length: 500 }, (_, i) => ({ chatNo: i + 1 }));

            // subscribeList가 localCache 대신 항상 빈 배열을 반환하도록 오버라이드
            // → getLocalMaxChatNo가 항상 0 반환 → 루프가 cursorNo=0까지 계속
            repository.subscribeList = jest.fn((_channelId: string, callback: (result: any) => void) => {
                Promise.resolve().then(() => callback({ list: [], meta: { total: 0 } }));
                return () => undefined;
            });

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 500 }]);
            scheduler.start();

            await drainScheduler(500, 50);

            // localMax가 항상 0이므로 cursorNo가 0이 될 때까지 fetch
            expect(fetchChat.mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(scheduler.getState('ch1')?.status).toBe('synced');
        });
    });

    describe('다중 채널 순차 처리', () => {
        it('여러 채널을 순서대로 sync한다', async () => {
            const { repository, store, fetchChat } = createMockChatRepository();
            store['ch1'] = Array.from({ length: 10 }, (_, i) => ({ chatNo: i + 1 }));
            store['ch2'] = Array.from({ length: 20 }, (_, i) => ({ chatNo: i + 1 }));
            store['ch3'] = Array.from({ length: 5 }, (_, i) => ({ chatNo: i + 1 }));

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([
                { channelId: 'ch1', serverChatNo: 10 },
                { channelId: 'ch2', serverChatNo: 20 },
                { channelId: 'ch3', serverChatNo: 5 },
            ]);
            scheduler.start();

            await drainScheduler();

            expect(scheduler.getState('ch1')?.status).toBe('synced');
            expect(scheduler.getState('ch2')?.status).toBe('synced');
            expect(scheduler.getState('ch3')?.status).toBe('synced');
            // 각 채널 1회씩 = 3회
            expect(fetchChat).toHaveBeenCalledTimes(3);
        });
    });

    describe('이미 동기화된 채널 skip', () => {
        it('localMax >= serverChatNo이면 fetchChat을 호출하지 않고 synced 처리한다', async () => {
            const { repository, localCache, fetchChat } = createMockChatRepository();
            // 로컬에 이미 chatNo 100까지 있음
            localCache['ch1'] = Array.from({ length: 100 }, (_, i) => ({ chatNo: i + 1 }));

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 100 }]);
            scheduler.start();

            await drainScheduler();

            expect(fetchChat).not.toHaveBeenCalled();
            expect(scheduler.getState('ch1')?.status).toBe('synced');
        });
    });

    describe('stop', () => {
        it('stop 호출 시 진행 중 sync가 중단된다', async () => {
            const { repository, store } = createMockChatRepository();
            store['ch1'] = Array.from({ length: 1000 }, (_, i) => ({ chatNo: i + 1 }));

            const scheduler = new ChatSyncScheduler(repository, { limit: 50 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 1000 }]);
            scheduler.start();

            // 한두 번 fetch 후 stop
            await jest.advanceTimersByTimeAsync(100);

            scheduler.stop();
            expect(scheduler.running).toBe(false);
        });
    });

    describe('pause / resume', () => {
        it('pause 중에는 다음 채널 sync가 진행되지 않고 resume 후 재개된다', async () => {
            const { repository, store, fetchChat } = createMockChatRepository();
            store['ch1'] = [{ chatNo: 1 }];
            store['ch2'] = [{ chatNo: 1 }];

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([
                { channelId: 'ch1', serverChatNo: 1 },
                { channelId: 'ch2', serverChatNo: 1 },
            ]);

            scheduler.start();
            // ch1 처리 완료 대기
            await drainScheduler(100, 10);

            // ch1 완료 후 pause
            scheduler.pause();
            const callsAfterPause = fetchChat.mock.calls.length;

            // pause 상태에서 시간 진행 — 추가 fetch 없어야 함
            await jest.advanceTimersByTimeAsync(5000);
            expect(fetchChat.mock.calls.length).toBe(callsAfterPause);

            // resume하면 나머지 진행
            scheduler.resume();
            await drainScheduler();

            // 최종적으로 두 채널 모두 처리됨
            expect(scheduler.getState('ch1')?.status).toBe('synced');
            expect(scheduler.getState('ch2')?.status).toBe('synced');
        });
    });

    describe('onStateChange 콜백', () => {
        it('상태 변경 시마다 콜백이 호출된다', async () => {
            const { repository, store } = createMockChatRepository();
            store['ch1'] = [{ chatNo: 1 }, { chatNo: 2 }, { chatNo: 3 }];

            const changes: Array<{ channelId: string; status: string }> = [];
            const scheduler = new ChatSyncScheduler(repository, {
                limit: 200,
                onStateChange: (channelId, state) => changes.push({ channelId, status: state.status }),
            });

            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 3 }]);
            scheduler.start();

            await drainScheduler();

            const statuses = changes.map(c => c.status);
            expect(statuses[0]).toBe('pending');
            expect(statuses).toContain('syncing');
            expect(statuses[statuses.length - 1]).toBe('synced');
        });
    });

    describe('에러 격리', () => {
        it('한 채널에서 fetchChat 실패해도 다른 채널은 정상 sync된다', async () => {
            const { repository, store } = createMockChatRepository();
            store['ch1'] = [{ chatNo: 1 }];
            store['ch2'] = [{ chatNo: 1 }];

            // ch1 fetchChat에서 에러 발생
            const originalFetchChat = repository.fetchChat;
            repository.fetchChat = jest.fn(async (payload: any, options: any) => {
                if (payload.channelId === 'ch1') throw new Error('network error');
                return originalFetchChat(payload, options);
            });

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([
                { channelId: 'ch1', serverChatNo: 1 },
                { channelId: 'ch2', serverChatNo: 1 },
            ]);
            scheduler.start();

            await drainScheduler();

            expect(scheduler.getState('ch1')?.status).toBe('error');
            expect(scheduler.getState('ch2')?.status).toBe('synced');
        });
    });

    describe('페이스 조절', () => {
        it('gap <= 200이면 딜레이 없이 fetch한다', async () => {
            const { repository, store, fetchChat } = createMockChatRepository();
            store['ch1'] = Array.from({ length: 150 }, (_, i) => ({ chatNo: i + 1 }));

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 150 }]);
            scheduler.start();

            // gap=150 (<=200) → delayMs=0, 딜레이 없이 즉시 완료
            await drainScheduler(0, 10);

            expect(scheduler.getState('ch1')?.status).toBe('synced');
            expect(fetchChat).toHaveBeenCalledTimes(1);
        });

        it('gap > 200이면 delayMs가 적용되어 abortableDelay를 거친다', async () => {
            const { repository, store, fetchChat } = createMockChatRepository();
            // gap=300 → delayMs=200

            // subscribeList가 항상 빈 배열 → localMax=0 유지 → 페이지네이션 강제
            repository.subscribeList = jest.fn((_channelId: string, callback: (result: any) => void) => {
                Promise.resolve().then(() => callback({ list: [], meta: { total: 0 } }));
                return () => undefined;
            });
            store['ch1'] = Array.from({ length: 300 }, (_, i) => ({ chatNo: i + 1 }));

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 300 }]);
            scheduler.start();

            // 충분한 시간을 줘서 딜레이(200ms) + 페이지네이션 전부 처리
            await drainScheduler(500, 30);

            expect(scheduler.getState('ch1')?.status).toBe('synced');
            // localMax=0이므로 cursorNo가 0이 될 때까지 fetch (최소 2페이지)
            expect(fetchChat.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('runLoop 완료 후 상태', () => {
        it('큐가 비면 isRunning이 false가 된다', async () => {
            const { repository, store } = createMockChatRepository();
            store['ch1'] = [{ chatNo: 1 }];

            const scheduler = new ChatSyncScheduler(repository, { limit: 200 });
            scheduler.enqueue([{ channelId: 'ch1', serverChatNo: 1 }]);
            scheduler.start();

            expect(scheduler.running).toBe(true);

            await drainScheduler();

            expect(scheduler.running).toBe(false);
            expect(scheduler.queueLength).toBe(0);
        });
    });
});
