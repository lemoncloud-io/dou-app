import { DynamicCacheStorage } from './DynamicCacheStorage';
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

// ─── 테스트 ───────────────────────────────────────────────────────────

describe('DynamicCacheStorage', () => {
    let mockHot: jest.Mocked<CacheStorage<'chat'>>;
    let mockCold: jest.Mocked<CacheStorage<'chat'>>;
    let onHotError: jest.Mock;

    beforeEach(() => {
        mockHot = createMockStorage();
        mockCold = createMockStorage();
        onHotError = jest.fn();
    });

    const createDCS = (overrides: Record<string, unknown> = {}) =>
        new DynamicCacheStorage(mockHot, mockCold, {
            type: 'chat',
            readPolicy: 'hot-first',
            loadAllPolicy: 'hot-first',
            onHotError,
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
            // 양쪽 miss일 때 Hot warm-up은 하지 않는다
            expect(mockHot.save).not.toHaveBeenCalled();
        });

        // R4
        it('R4 — Hot 에러 시 Cold fallback + onHotError 호출, 상위에 throw하지 않는다', async () => {
            mockHot.load.mockRejectedValueOnce(new Error('IDB crash'));
            mockCold.load.mockResolvedValueOnce(item('1'));
            const dcs = createDCS();

            const result = await dcs.load('1');

            expect(result).toMatchObject(item('1'));
            expect(onHotError).toHaveBeenCalledTimes(1);
            expect(onHotError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ type: 'chat', operation: 'load' })
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
        it('R8 — Hot 에러 시 Cold fallback + onHotError 호출', async () => {
            mockHot.loadAll.mockRejectedValueOnce(new Error('IDB crash'));
            mockCold.loadAll.mockResolvedValueOnce([item('1')]);
            const dcs = createDCS();

            const result = await dcs.loadAll();
            await flushMicrotasks();

            expect(result).toMatchObject([expect.objectContaining({ id: '1' })]);
            expect(onHotError).toHaveBeenCalledTimes(1);
            expect(onHotError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ operation: 'loadAll' })
            );
            // warm-up도 발생해야 함
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
        it('W3 — Hot 에러 시 정상 반환 + onHotError 호출', async () => {
            mockHot.save.mockRejectedValueOnce(new Error('IDB quota'));
            const dcs = createDCS();

            const result = await dcs.save('1', item('1'));
            await flushMicrotasks();

            expect(result).toMatchObject(item('1'));
            expect(mockCold.save).toHaveBeenCalledTimes(1);
            expect(onHotError).toHaveBeenCalledTimes(1);
            expect(onHotError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ operation: 'save' }));
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
            // Cold가 먼저 호출되었는지 순서 확인
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
        it('D3 — Hot 에러 시 정상 resolve + onHotError 호출', async () => {
            mockHot.delete.mockRejectedValueOnce(new Error('IDB error'));
            const dcs = createDCS();

            await expect(dcs.delete('1')).resolves.toBeUndefined();
            expect(mockCold.delete).toHaveBeenCalledWith('1');
            expect(onHotError).toHaveBeenCalledTimes(1);
            expect(onHotError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ operation: 'delete' })
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

        it('D4 — Hot.clearAll 에러 시 정상 resolve + onHotError 호출', async () => {
            mockHot.clearAll.mockRejectedValueOnce(new Error('IDB clear fail'));
            const dcs = createDCS();

            await expect(dcs.clearAll()).resolves.toBeUndefined();
            expect(onHotError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ operation: 'clearAll' })
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

        it('Hot.deleteAll 에러 시 정상 resolve + onHotError 호출', async () => {
            mockHot.deleteAll.mockRejectedValueOnce(new Error('IDB error'));
            const dcs = createDCS();

            await expect(dcs.deleteAll(['1'])).resolves.toBeUndefined();
            expect(onHotError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ operation: 'deleteAll' })
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

        it('Hot 에러 시 정상 resolve + onHotError 호출', async () => {
            mockHot.clearByChannelId.mockRejectedValueOnce(new Error('IDB error'));
            const dcs = createDCS();

            await expect(dcs.clearByChannelId('ch-1')).resolves.toBeUndefined();
            expect(onHotError).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({ operation: 'clearByChannelId' })
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // 통합 흐름 (I1–I5)
    // ═══════════════════════════════════════════════════════════════════

    describe('통합 흐름', () => {
        // I1
        it('I1 — save 후 load: Hot에 warm-up되어 Cold 미조회', async () => {
            // save → Cold.save 성공, fire-and-forget Hot.save
            // load → Hot.load가 데이터 반환
            const dcs = createDCS();

            await dcs.save('1', item('1'));
            await flushMicrotasks();

            // 두 번째 load 호출에서 Hot이 데이터를 가지고 있도록 설정
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

            // 삭제 후 양쪽 모두 null
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

            // Hot에 warm-up 완료
            mockHot.loadAll.mockResolvedValueOnce(msgs);

            const result = await dcs.loadAll();

            expect(result).toHaveLength(10);
            expect(mockCold.loadAll).not.toHaveBeenCalled();
        });

        // I4
        it('I4 — 최초 loadAll Cold fallback → warm-up → 재조회 시 Hot hit', async () => {
            const msgs = Array.from({ length: 50 }, (_, i) => item(`${i}`));

            // 1차: Hot 빈 배열, Cold에 데이터 있음
            mockHot.loadAll.mockResolvedValueOnce([]);
            mockCold.loadAll.mockResolvedValueOnce(msgs);
            // 2차: warm-up 완료 후 Hot hit
            mockHot.loadAll.mockResolvedValueOnce(msgs);

            const dcs = createDCS();

            const first = await dcs.loadAll();
            await flushMicrotasks();
            const second = await dcs.loadAll();

            expect(first).toHaveLength(50);
            expect(second).toHaveLength(50);
            // Cold.loadAll은 1차에서 1번만 호출
            expect(mockCold.loadAll).toHaveBeenCalledTimes(1);
            // warm-up으로 Hot.saveAll 1회 발생
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

            // save — Cold 성공, Hot fire-and-forget 실패 (삼킴)
            const saved = await dcs.save('1', item('1'));
            await flushMicrotasks();
            expect(saved).toMatchObject(item('1'));

            // load — Hot 에러 → Cold fallback
            const loaded = await dcs.load('1');
            expect(loaded).toMatchObject(item('1'));

            // loadAll — Hot 에러 → Cold fallback
            const list = await dcs.loadAll();
            expect(list).toHaveLength(1);

            // delete — Cold 성공, Hot best-effort 실패 (삼킴)
            await expect(dcs.delete('1')).resolves.toBeUndefined();

            // 상위에 에러가 전파되지 않았고, onHotError가 매번 호출됨
            expect(onHotError).toHaveBeenCalled();
            expect(onHotError.mock.calls.length).toBeGreaterThanOrEqual(4);
        });
    });
});
