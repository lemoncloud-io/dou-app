import { createScopedDataSource, createDefaultDataSource } from './factory';
import { database } from '../core';

jest.mock('../core', () => ({
    database: {
        execute: jest.fn(),
        executeBatch: jest.fn(),
    },
}));

const mockedExecute = database.execute as jest.Mock;
const mockedExecuteBatch = database.executeBatch as jest.Mock;

interface TestModel {
    name: string;
    value: number;
}

describe('CacheDataSource Factory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createScopedDataSource (CID 필수 스코프 저장소)', () => {
        const tableName = 'test_scoped_table';
        const ds = createScopedDataSource<TestModel>(tableName);

        it('fetch: cid 없이 id로만 조회할 수 있어야 한다', async () => {
            const mockData = { name: 'test', value: 1 };
            mockedExecute.mockResolvedValueOnce({
                rows: [{ data: JSON.stringify(mockData) }],
            });

            const result = await ds.fetch('id-1');

            expect(mockedExecute).toHaveBeenCalledWith(`SELECT data FROM ${tableName} WHERE id = ?`, ['id-1']);
            expect(result).toEqual(mockData);
        });

        it('fetch: cid를 포함하여 조건부로 조회할 수 있어야 한다', async () => {
            const mockData = { name: 'test', value: 1 };
            mockedExecute.mockResolvedValueOnce({
                rows: [{ data: JSON.stringify(mockData) }],
            });

            const result = await ds.fetch('id-1', 'cid-1');

            expect(mockedExecute).toHaveBeenCalledWith(`SELECT data FROM ${tableName} WHERE id = ? AND cid = ?`, [
                'id-1',
                'cid-1',
            ]);
            expect(result).toEqual(mockData);
        });

        it('fetch: 데이터가 없거나 JSON 파싱 에러 시 null을 반환해야 한다', async () => {
            // 데이터가 없을 때
            mockedExecute.mockResolvedValueOnce({ rows: [] });
            const emptyResult = await ds.fetch('id-1');
            expect(emptyResult).toBeNull();

            // 잘못된 JSON 형식일 때
            mockedExecute.mockResolvedValueOnce({ rows: [{ data: 'invalid-json' }] });
            const errorResult = await ds.fetch('id-2');
            expect(errorResult).toBeNull();
        });

        it('fetchAll: cid 없이 전체 유효한 데이터를 파싱하여 반환해야 한다', async () => {
            const validData1 = { name: 'a', value: 1 };
            const validData2 = { name: 'b', value: 2 };

            mockedExecute.mockResolvedValueOnce({
                rows: [
                    { data: JSON.stringify(validData1) },
                    { data: 'invalid-json' }, // 무시되어야 함
                    { data: JSON.stringify(validData2) },
                ],
            });

            const result = await ds.fetchAll();

            expect(mockedExecute).toHaveBeenCalledWith(`SELECT data FROM ${tableName}`, []);
            expect(result).toHaveLength(2);
            expect(result).toEqual([validData1, validData2]);
        });

        it('fetchAll: cid를 포함하여 특정 스코프의 데이터만 반환해야 한다', async () => {
            mockedExecute.mockResolvedValueOnce({ rows: [] });
            await ds.fetchAll('cid-1');
            expect(mockedExecute).toHaveBeenCalledWith(`SELECT data FROM ${tableName} WHERE cid = ?`, ['cid-1']);
        });

        it('save: cid를 필수로 포함하여 정확한 INSERT 쿼리를 실행해야 한다', async () => {
            const item = { name: 'save-test', value: 100 };
            await ds.save('id-1', item, 'cid-1');

            expect(mockedExecute).toHaveBeenCalledWith(
                `INSERT OR REPLACE INTO ${tableName} (cid, id, data) VALUES (?, ?, ?)`,
                ['cid-1', 'id-1', JSON.stringify(item)]
            );
        });

        it('saveAll: 여러 항목을 cid와 함께 배치 쿼리로 저장해야 한다', async () => {
            const items = [
                { id: 'id-1', data: { name: 'a', value: 1 } },
                { id: 'id-2', data: { name: 'b', value: 2 } },
            ];

            await ds.saveAll(items, 'cid-1');

            expect(mockedExecuteBatch).toHaveBeenCalledTimes(1);
            const batchArgs = mockedExecuteBatch.mock.calls[0][0];
            expect(batchArgs).toHaveLength(2);
            expect(batchArgs[0]).toEqual([
                `INSERT OR REPLACE INTO ${tableName} (cid, id, data) VALUES (?, ?, ?)`,
                ['cid-1', 'id-1', JSON.stringify(items[0].data)],
            ]);
        });

        it('remove: cid를 필수로 포함하여 정확한 DELETE 쿼리를 실행해야 한다', async () => {
            await ds.remove('id-1', 'cid-1');

            expect(mockedExecute).toHaveBeenCalledWith(`DELETE FROM ${tableName} WHERE id = ? AND cid = ?`, [
                'id-1',
                'cid-1',
            ]);
        });

        it('removeAll: 여러 ID를 cid와 함께 배치 쿼리로 삭제해야 한다', async () => {
            const ids = ['id-1', 'id-2'];
            await ds.removeAll(ids, 'cid-1');

            expect(mockedExecuteBatch).toHaveBeenCalledTimes(1);
            const batchArgs = mockedExecuteBatch.mock.calls[0][0];
            expect(batchArgs).toHaveLength(2);
            expect(batchArgs[0]).toEqual([`DELETE FROM ${tableName} WHERE id = ? AND cid = ?`, ['id-1', 'cid-1']]);
        });
    });

    describe('createDefaultDataSource (CID 없는 디폴트 저장소)', () => {
        const tableName = 'test_default_table';
        const ds = createDefaultDataSource<TestModel>(tableName);

        it('fetch: id만으로 정확한 SELECT 쿼리를 실행해야 한다', async () => {
            mockedExecute.mockResolvedValueOnce({ rows: [] });
            await ds.fetch('id-1');

            expect(mockedExecute).toHaveBeenCalledWith(`SELECT data FROM ${tableName} WHERE id = ?`, ['id-1']);
        });

        it('fetchAll: 전체 데이터를 조회하는 SELECT 쿼리를 실행해야 한다', async () => {
            mockedExecute.mockResolvedValueOnce({ rows: [] });
            await ds.fetchAll();
            expect(mockedExecute).toHaveBeenCalledWith(`SELECT data FROM ${tableName}`);
        });

        it('save: cid 컬럼 없이 정확한 INSERT 쿼리를 실행해야 한다', async () => {
            const item = { name: 'save-test', value: 100 };
            await ds.save('id-1', item);

            expect(mockedExecute).toHaveBeenCalledWith(`INSERT OR REPLACE INTO ${tableName} (id, data) VALUES (?, ?)`, [
                'id-1',
                JSON.stringify(item),
            ]);
        });

        it('saveAll: cid 컬럼 없이 배치 쿼리를 실행해야 한다', async () => {
            const items = [{ id: 'id-1', data: { name: 'a', value: 1 } }];

            await ds.saveAll(items);

            const batchArgs = mockedExecuteBatch.mock.calls[0][0];
            expect(batchArgs[0]).toEqual([
                `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES (?, ?)`,
                ['id-1', JSON.stringify(items[0].data)],
            ]);
        });

        it('remove: cid 조건 없이 정확한 DELETE 쿼리를 실행해야 한다', async () => {
            await ds.remove('id-1');

            expect(mockedExecute).toHaveBeenCalledWith(`DELETE FROM ${tableName} WHERE id = ?`, ['id-1']);
        });

        it('removeAll: cid 조건 없이 배치 쿼리를 삭제해야 한다', async () => {
            const ids = ['id-1'];
            await ds.removeAll(ids);

            const batchArgs = mockedExecuteBatch.mock.calls[0][0];
            expect(batchArgs[0]).toEqual([`DELETE FROM ${tableName} WHERE id = ?`, ['id-1']]);
        });
    });
});
