import { DynamicCacheStorage } from './DynamicCacheStorage';
import { StampedeTimeoutError, STAMPEDE_TIMEOUT_MS } from './dynamicCacheTypes';
import type { EvictionStrategy } from './dynamicCacheTypes';
import type { CacheStorage } from './types';

// ─── 테스트 유틸 ──────────────────────────────────────────────────────

/** fire-and-forget Promise가 settled 되기를 기다림 */
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

/** CacheStorage<'chat'> mock 생성 */
const createMockStorage = (): jest.Mocked<CacheStorage<'chat'>> => ({
    save: jest.fn().mockImplementation((_id, item) => Promise.resolve(item)),
    saveAll: jest.fn().mockImplementation(items => Promise.resolve(items)),
    load: jest.fn().mockResolvedValue(null),
    loadAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteAll: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    clearByChannelId: jest.fn().mockResolvedValue(undefined),
});

/** 테스트용 chat 아이템 팩토리 */
const item = (id: string, overrides: Record<string, unknown> = {}) =>
    ({ id, channelId: 'ch-1', text: `msg-${id}`, ...overrides }) as any;

/** no-op EvictionStrategy mock */
const createMockEviction = (): jest.Mocked<EvictionStrategy> => ({
    onStartup: jest.fn().mockResolvedValue(undefined),
    onAfterWrite: jest.fn().mockResolvedValue(undefined),
    onQuotaExceeded: jest.fn().mockResolvedValue(undefined),
});

// ─── 테스트 ───────────────────────────────────────────────────────────

describe('DynamicCacheStorage', () => {
    let mockHot: jest.Mocked<CacheStorage<'chat'>>;
    let mockCold: jest.Mocked<CacheStorage<'chat'>>;
    let reporter: jest.Mock;

    beforeEach(() => {
        mockHot = createMockStorage();
        mockCold = createMockStorage();
        reporter = jest.fn();
    });

    const createDCS = (overrides: Record<string, unknown> = {}) =>
        new DynamicCacheStorage(mockHot, mockCold, {
            type: 'chat',
            readPolicy: 'hot-first',
            loadAllPolicy: 'hot-first',
            reporter,
            ...overrides,
        });

    // ═══════════════════════════════════════════════════════════════════
    // Read (R1–R8)
    // ═══════════════════════════════════════════════════════════════════

    describe('load (hot-first)', () => {
        // R1
        it('R1 — Hot hit이면 Cold를 조회하지 않고 바로 반환한다', async () => {
            mockHot.load.mockResolvedValueOnce(item('1'));
            const dcs = createDCS();

            const result = await dcs.load('1');

            expect(result).toMatchObject(item('1'));
            expect(mockCold.load).not.toHaveBeenCalled();
        });

        // R2
        it('R2 — Hot miss 시 Cold fallback 후 background로 Hot에 저장한다', async () => {
            mockHot.load.mockResolvedValueOnce(null);
            mockCold.load.mockResolvedValueOnce(item('1'));
            const dcs = createDCS();

            const result = await dcs.load('1');
            await flushMicrotasks();

            expect(result).toMatchObject(item('1'));
            expect(mockCold.load).toHaveBeenCalledWith('1');
            expect(mockHot.save).toHaveBeenCalledWith('1', expect.objectContaining({ id: '1' }));
        });

        // R3
        it('R3 — 양쪽 miss이면 null을 반환한다', async () => {
            mockHot.load.mockResolvedValueOnce(null);
            mockCold.load.mockResolvedValueOnce(null);
            const dcs = createDCS();

            const result = await dcs.load('1');

            expect(result).toBeNull();
            expect(mockHot.load).toHaveBeenCalledTimes(1);
            expect(mockCold.load).toHaveBeenCalledTimes(1);
            expect(mockHot.save).not.toHaveBeenCalled();
        });

        // R4
        it('R4 — Hot 에러 시 Cold fallback + reporter 호출, 상위에 throw하지 않는다', async () => {
            mockHot.load.mockRejectedValueOnce(new Error('IDB crash'));
            mockCold.load.mockResolvedValueOnce(item('1'));
            const dcs = createDCS();

            const result = await dcs.load('1');

            expect(result).toMatchObject(item('1'));
            expect(reporter).toHaveBeenCalledTimes(1);
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'load' })
            );
        });
    });

    describe('loadAll (hot-first)', () => {
        // R6
        it('R6 — Hot hit이면 Cold를 조회하지 않는다', async () => {
            mockHot.loadAll.mockResolvedValueOnce([item('1'), item('2')]);
            const dcs = createDCS();

            const result = await dcs.loadAll();

            expect(result).toHaveLength(2);
            expect(mockCold.loadAll).not.toHaveBeenCalled();
        });

        // R7
        it('R7 — Hot 빈 배열이면 Cold fallback + background Hot.saveAll warm-up', async () => {
            mockHot.loadAll.mockResolvedValueOnce([]);
            mockCold.loadAll.mockResolvedValueOnce([item('1'), item('2')]);
            const dcs = createDCS();

            const result = await dcs.loadAll();
            await flushMicrotasks();

            expect(result).toHaveLength(2);
            expect(mockCold.loadAll).toHaveBeenCalledTimes(1);
            expect(mockHot.saveAll).toHaveBeenCalledWith(
                expect.arrayContaining([expect.objectContaining({ id: '1' })])
            );
        });

        // R8
        it('R8 — Hot 에러 시 Cold fallback + reporter 호출', async () => {
            mockHot.loadAll.mockRejectedValueOnce(new Error('IDB crash'));
            mockCold.loadAll.mockResolvedValueOnce([item('1')]);
            const dcs = createDCS();

            const result = await dcs.loadAll();
            await flushMicrotasks();

            expect(result).toMatchObject([expect.objectContaining({ id: '1' })]);
            expect(reporter).toHaveBeenCalledTimes(1);
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'loadAll' })
            );
            expect(mockHot.saveAll).toHaveBeenCalled();
        });
    });

    describe('loadAll (cold-first)', () => {
        // R5
        it('R5 — cold-first이면 Hot.loadAll 미호출, Cold만 조회 + Hot warm-up', async () => {
            mockCold.loadAll.mockResolvedValueOnce([item('1'), item('2'), item('3')]);
            const dcs = createDCS({ loadAllPolicy: 'cold-first' });

            const result = await dcs.loadAll();
            await flushMicrotasks();

            expect(result).toHaveLength(3);
            expect(mockHot.loadAll).not.toHaveBeenCalled();
            expect(mockHot.saveAll).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ id: '1' }),
                    expect.objectContaining({ id: '2' }),
                    expect.objectContaining({ id: '3' }),
                ])
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Write (W1–W3)
    // ═══════════════════════════════════════════════════════════════════

    describe('save', () => {
        // W1
        it('W1 — Cold 먼저 저장 후 background Hot.save 발생', async () => {
            const dcs = createDCS();

            const result = await dcs.save('1', item('1'));
            await flushMicrotasks();

            expect(result).toMatchObject(item('1'));
            expect(mockCold.save).toHaveBeenCalledWith('1', expect.objectContaining({ id: '1' }));
            expect(mockHot.save).toHaveBeenCalledWith('1', expect.objectContaining({ id: '1' }));
        });

        // W2
        it('W2 — Cold 에러 시 상위에 전파, Hot 미호출', async () => {
            mockCold.save.mockRejectedValueOnce(new Error('SQLite write fail'));
            const dcs = createDCS();

            await expect(dcs.save('1', item('1'))).rejects.toThrow('SQLite write fail');
            expect(mockHot.save).not.toHaveBeenCalled();
        });

        // W3
        it('W3 — Hot 에러 시 정상 반환 + reporter 호출', async () => {
            mockHot.save.mockRejectedValueOnce(new Error('IDB quota'));
            const dcs = createDCS();

            const result = await dcs.save('1', item('1'));
            await flushMicrotasks();

            expect(result).toMatchObject(item('1'));
            expect(mockCold.save).toHaveBeenCalledTimes(1);
            expect(reporter).toHaveBeenCalledTimes(1);
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'save' })
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Delete / Clear (D1–D4)
    // ═══════════════════════════════════════════════════════════════════

    describe('delete', () => {
        // D1
        it('D1 — 정상: Cold 먼저 삭제, Hot await best-effort', async () => {
            const dcs = createDCS();

            await dcs.delete('1');

            expect(mockCold.delete).toHaveBeenCalledWith('1');
            expect(mockHot.delete).toHaveBeenCalledWith('1');
            const coldOrder = mockCold.delete.mock.invocationCallOrder[0];
            const hotOrder = mockHot.delete.mock.invocationCallOrder[0];
            expect(coldOrder).toBeLessThan(hotOrder);
        });

        // D2
        it('D2 — Cold 에러 시 상위에 전파, Hot 미호출', async () => {
            mockCold.delete.mockRejectedValueOnce(new Error('SQLite lock'));
            const dcs = createDCS();

            await expect(dcs.delete('1')).rejects.toThrow('SQLite lock');
            expect(mockHot.delete).not.toHaveBeenCalled();
        });

        // D3
        it('D3 — Hot 에러 시 정상 resolve + reporter 호출', async () => {
            mockHot.delete.mockRejectedValueOnce(new Error('IDB error'));
            const dcs = createDCS();

            await expect(dcs.delete('1')).resolves.toBeUndefined();
            expect(mockCold.delete).toHaveBeenCalledWith('1');
            expect(reporter).toHaveBeenCalledTimes(1);
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'delete' })
            );
        });
    });

    describe('clearAll', () => {
        // D4
        it('D4 — Cold.clearAll + Hot.clearAll 각 1회 호출', async () => {
            const dcs = createDCS();

            await dcs.clearAll();

            expect(mockCold.clearAll).toHaveBeenCalledTimes(1);
            expect(mockHot.clearAll).toHaveBeenCalledTimes(1);
        });

        it('D4 — Hot.clearAll 에러 시 정상 resolve + reporter 호출', async () => {
            mockHot.clearAll.mockRejectedValueOnce(new Error('IDB clear fail'));
            const dcs = createDCS();

            await expect(dcs.clearAll()).resolves.toBeUndefined();
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'clearAll' })
            );
        });
    });

    describe('deleteAll', () => {
        it('Cold 먼저 삭제 후 Hot await best-effort', async () => {
            const dcs = createDCS();

            await dcs.deleteAll(['1', '2']);

            expect(mockCold.deleteAll).toHaveBeenCalledWith(['1', '2']);
            expect(mockHot.deleteAll).toHaveBeenCalledWith(['1', '2']);
        });

        it('Hot.deleteAll 에러 시 정상 resolve + reporter 호출', async () => {
            mockHot.deleteAll.mockRejectedValueOnce(new Error('IDB error'));
            const dcs = createDCS();

            await expect(dcs.deleteAll(['1'])).resolves.toBeUndefined();
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'deleteAll' })
            );
        });
    });

    describe('clearByChannelId', () => {
        it('Cold 먼저 삭제 후 Hot await best-effort', async () => {
            const dcs = createDCS();

            await dcs.clearByChannelId('ch-1');

            expect(mockCold.clearByChannelId).toHaveBeenCalledWith('ch-1');
            expect(mockHot.clearByChannelId).toHaveBeenCalledWith('ch-1');
        });

        it('Hot 에러 시 정상 resolve + reporter 호출', async () => {
            mockHot.clearByChannelId.mockRejectedValueOnce(new Error('IDB error'));
            const dcs = createDCS();

            await expect(dcs.clearByChannelId('ch-1')).resolves.toBeUndefined();
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'clearByChannelId' })
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // 통합 흐름 (I1–I5)
    // ═══════════════════════════════════════════════════════════════════

    describe('통합 흐름', () => {
        // I1
        it('I1 — save 후 load: Hot에 warm-up되어 Cold 미조회', async () => {
            const dcs = createDCS();

            await dcs.save('1', item('1'));
            await flushMicrotasks();

            mockHot.load.mockResolvedValueOnce(item('1'));

            const result = await dcs.load('1');

            expect(result).toMatchObject(item('1'));
            expect(mockCold.load).not.toHaveBeenCalled();
        });

        // I2
        it('I2 — save → delete → load: 양쪽 삭제 확인', async () => {
            const dcs = createDCS();

            await dcs.save('1', item('1'));
            await flushMicrotasks();
            await dcs.delete('1');

            mockHot.load.mockResolvedValueOnce(null);
            mockCold.load.mockResolvedValueOnce(null);

            const result = await dcs.load('1');

            expect(result).toBeNull();
            expect(mockCold.delete).toHaveBeenCalledWith('1');
            expect(mockHot.delete).toHaveBeenCalledWith('1');
        });

        // I3
        it('I3 — saveAll 후 loadAll (hot-first): Hot hit, Cold 미조회', async () => {
            const msgs = Array.from({ length: 10 }, (_, i) => item(`${i}`));
            const dcs = createDCS();

            await dcs.saveAll(msgs);
            await flushMicrotasks();

            mockHot.loadAll.mockResolvedValueOnce(msgs);

            const result = await dcs.loadAll();

            expect(result).toHaveLength(10);
            expect(mockCold.loadAll).not.toHaveBeenCalled();
        });

        // I4
        it('I4 — 최초 loadAll Cold fallback → warm-up → 재조회 시 Hot hit', async () => {
            const msgs = Array.from({ length: 50 }, (_, i) => item(`${i}`));

            mockHot.loadAll.mockResolvedValueOnce([]);
            mockCold.loadAll.mockResolvedValueOnce(msgs);
            mockHot.loadAll.mockResolvedValueOnce(msgs);

            const dcs = createDCS();

            const first = await dcs.loadAll();
            await flushMicrotasks();
            const second = await dcs.loadAll();

            expect(first).toHaveLength(50);
            expect(second).toHaveLength(50);
            expect(mockCold.loadAll).toHaveBeenCalledTimes(1);
            expect(mockHot.saveAll).toHaveBeenCalledTimes(1);
        });

        // I5
        it('I5 — Hot 전면 장애: 모든 CRUD가 Cold만으로 정상 동작', async () => {
            mockHot.save.mockRejectedValue(new Error('IDB dead'));
            mockHot.saveAll.mockRejectedValue(new Error('IDB dead'));
            mockHot.load.mockRejectedValue(new Error('IDB dead'));
            mockHot.loadAll.mockRejectedValue(new Error('IDB dead'));
            mockHot.delete.mockRejectedValue(new Error('IDB dead'));

            mockCold.load.mockResolvedValue(item('1'));
            mockCold.loadAll.mockResolvedValue([item('1')]);

            const dcs = createDCS();

            const saved = await dcs.save('1', item('1'));
            await flushMicrotasks();
            expect(saved).toMatchObject(item('1'));

            const loaded = await dcs.load('1');
            expect(loaded).toMatchObject(item('1'));

            const list = await dcs.loadAll();
            expect(list).toHaveLength(1);

            await expect(dcs.delete('1')).resolves.toBeUndefined();

            expect(reporter).toHaveBeenCalled();
            expect(reporter.mock.calls.length).toBeGreaterThanOrEqual(4);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // cursorNo 분기 (C1–C3)
    // ═══════════════════════════════════════════════════════════════════

    describe('cursorNo 분기', () => {
        // C1
        it('C1 — cursorNo != null → 강제 cold-first, Hot.loadAll 미호출', async () => {
            mockCold.loadAll.mockResolvedValueOnce([item('1'), item('2')]);
            const dcs = createDCS();

            const result = await dcs.loadAll({ cursorNo: 500 } as any);
            await flushMicrotasks();

            expect(result).toHaveLength(2);
            expect(mockHot.loadAll).not.toHaveBeenCalled();
            expect(mockCold.loadAll).toHaveBeenCalledWith(expect.objectContaining({ cursorNo: 500 }));
            expect(mockHot.saveAll).toHaveBeenCalled();
        });

        // C2
        it('C2 — cursorNo === 0 → cold-first (페이지네이션 명시 의도)', async () => {
            mockCold.loadAll.mockResolvedValueOnce([item('1')]);
            const dcs = createDCS();

            const result = await dcs.loadAll({ cursorNo: 0 } as any);
            await flushMicrotasks();

            expect(result).toHaveLength(1);
            expect(mockHot.loadAll).not.toHaveBeenCalled();
            expect(mockCold.loadAll).toHaveBeenCalledTimes(1);
        });

        // C3
        it('C3 — cursorNo 없음 → PolicyResolver 결과에 따라 분기', async () => {
            mockHot.loadAll.mockResolvedValueOnce([item('1')]);
            const dcs = createDCS(); // hot-first

            const result = await dcs.loadAll({ limit: 50 } as any);

            expect(result).toHaveLength(1);
            expect(mockHot.loadAll).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Stampede 가드 (S1–S4)
    // ═══════════════════════════════════════════════════════════════════

    describe('Stampede 가드', () => {
        // S1
        it('S1 — 동시 loadAll(opts) 2회 → Cold.loadAll 1회만 호출', async () => {
            let resolvePromise!: (value: any[]) => void;
            const pending = new Promise<any[]>(resolve => {
                resolvePromise = resolve;
            });
            mockCold.loadAll.mockReturnValueOnce(pending as any);
            const dcs = createDCS();
            const opts = { cursorNo: 100 } as any;

            const p1 = dcs.loadAll(opts);
            const p2 = dcs.loadAll(opts);

            resolvePromise([item('1'), item('2')]);

            const [r1, r2] = await Promise.all([p1, p2]);

            expect(r1).toHaveLength(2);
            expect(r2).toHaveLength(2);
            expect(mockCold.loadAll).toHaveBeenCalledTimes(1);
        });

        // S2
        it('S2 — in-flight reject 후 재호출 → 새 Promise 생성', async () => {
            mockCold.loadAll.mockRejectedValueOnce(new Error('bridge fail'));
            mockCold.loadAll.mockResolvedValueOnce([item('1')]);
            const dcs = createDCS();
            const opts = { cursorNo: 100 } as any;

            await expect(dcs.loadAll(opts)).rejects.toThrow('bridge fail');

            const result = await dcs.loadAll(opts);
            expect(result).toHaveLength(1);
            expect(mockCold.loadAll).toHaveBeenCalledTimes(2);
        });

        // S3
        it('S3 — STAMPEDE_TIMEOUT_MS 초과 → StampedeTimeoutError reject', async () => {
            const dcs = createDCS();
            const opts = { cursorNo: 100 } as any;

            // 첫 호출: never-resolving promise
            mockCold.loadAll.mockReturnValueOnce(
                new Promise(_resolve => {
                    /* never resolves */
                }) as any
            );
            const p1 = dcs.loadAll(opts);

            // 시간 경과 시뮬레이션 — Date.now를 override
            const originalNow = Date.now;
            Date.now = () => originalNow() + STAMPEDE_TIMEOUT_MS + 1;

            try {
                await expect(dcs.loadAll(opts)).rejects.toThrow(StampedeTimeoutError);
            } finally {
                Date.now = originalNow;
            }

            // p1 cleanup (leaked promise 방지)
            p1.catch(() => {
                /* intentional noop */
            });
        });

        // S4
        it('S4 — 동시 save 2회 → 가드 적용 없음, Cold.save 2회 호출', async () => {
            const dcs = createDCS();

            await Promise.all([dcs.save('1', item('1')), dcs.save('2', item('2'))]);

            expect(mockCold.save).toHaveBeenCalledTimes(2);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Eviction 호출 계약 (E1–E5)
    // ═══════════════════════════════════════════════════════════════════

    describe('Eviction 호출 계약', () => {
        // E1
        it('E1 — saveAll([item1]) 정상 → Hot.saveAll 완료 후 onAfterWrite 호출', async () => {
            const eviction = createMockEviction();
            const dcs = createDCS({ evictionStrategy: eviction });

            await dcs.saveAll([item('1')]);
            await flushMicrotasks();

            expect(eviction.onAfterWrite).toHaveBeenCalledWith('chat', [expect.objectContaining({ id: '1' })], mockHot);
        });

        // E2
        it('E2 — saveAll([]) 빈 배열 → onAfterWrite 미호출', async () => {
            const eviction = createMockEviction();
            const dcs = createDCS({ evictionStrategy: eviction });

            await dcs.saveAll([]);
            await flushMicrotasks();

            expect(eviction.onAfterWrite).not.toHaveBeenCalled();
        });

        // E3
        it('E3 — Hot.save QuotaExceededError → onQuotaExceeded 호출, onAfterWrite 미호출, save 성공', async () => {
            const quotaErr = new DOMException('quota', 'QuotaExceededError');
            mockHot.save.mockRejectedValueOnce(quotaErr);
            const eviction = createMockEviction();
            const dcs = createDCS({ evictionStrategy: eviction });

            const result = await dcs.save('1', item('1'));
            await flushMicrotasks();

            expect(result).toMatchObject(item('1'));
            expect(eviction.onQuotaExceeded).toHaveBeenCalledWith('chat', mockHot);
            expect(eviction.onAfterWrite).not.toHaveBeenCalled();
        });

        // E4
        it('E4 — onAfterWrite 자체가 throw → reporter tier=eviction 기록, save 정상 resolve', async () => {
            const eviction = createMockEviction();
            eviction.onAfterWrite.mockRejectedValueOnce(new Error('eviction crash'));
            const dcs = createDCS({ evictionStrategy: eviction });

            const result = await dcs.save('1', item('1'));
            await flushMicrotasks();

            expect(result).toMatchObject(item('1'));
            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'eviction', operation: 'eviction' })
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Reporter 통합 (P1–P3)
    // ═══════════════════════════════════════════════════════════════════

    describe('Reporter 통합', () => {
        // P1
        it('P1 — Hot.load 에러 → reporter { tier:hot, operation:load }', async () => {
            mockHot.load.mockRejectedValueOnce(new Error('IDB'));
            mockCold.load.mockResolvedValueOnce(item('1'));
            const dcs = createDCS();

            await dcs.load('1');

            expect(reporter).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ tier: 'hot', operation: 'load' })
            );
        });

        // P2
        it('P2 — Reporter 자체가 throw → DCS 동작 영향 없음, Cold fallback 정상', async () => {
            const throwingReporter = jest.fn(() => {
                throw new Error('reporter crash');
            });
            mockHot.load.mockRejectedValueOnce(new Error('IDB'));
            mockCold.load.mockResolvedValueOnce(item('1'));
            const dcs = createDCS({ reporter: throwingReporter });

            const result = await dcs.load('1');

            expect(result).toMatchObject(item('1'));
            expect(throwingReporter).toHaveBeenCalled();
        });

        // P3
        it('P3 — Stampede timeout → reporter { tier:stampede, operation:stampede-timeout }', async () => {
            const dcs = createDCS();
            const opts = { cursorNo: 100 } as any;

            mockCold.loadAll.mockReturnValueOnce(
                new Promise(_resolve => {
                    /* never resolves */
                }) as any
            );
            const p1 = dcs.loadAll(opts);

            const originalNow = Date.now;
            Date.now = () => originalNow() + STAMPEDE_TIMEOUT_MS + 1;

            try {
                await expect(dcs.loadAll(opts)).rejects.toThrow(StampedeTimeoutError);
                expect(reporter).toHaveBeenCalledWith(
                    expect.any(StampedeTimeoutError),
                    expect.objectContaining({ tier: 'stampede', operation: 'stampede-timeout' })
                );
            } finally {
                Date.now = originalNow;
            }

            p1.catch(() => {
                /* intentional noop */
            });
        });
    });
});
