import Database from 'better-sqlite3';
import { channelDataSource } from './channelDataSource';
import { MIGRATIONS, TARGET_VERSION } from '../../../database';
import { TABLES } from '../../../database';

const mockDb = new Database(':memory:');
jest.mock('../../../database', () => ({
    database: {
        execute: jest.fn(async (query: string, params: any[] = []) => {
            const stmt = mockDb.prepare(query);
            if (query.trim().toUpperCase().startsWith('SELECT')) {
                return { rows: stmt.all(params) };
            } else {
                const result = stmt.run(params);
                return { rows: [], changes: result.changes };
            }
        }),
        executeBatch: jest.fn(async (commands: any[]) => {
            const batch = mockDb.transaction(cmds => {
                for (const [sql, params] of cmds) {
                    mockDb.prepare(sql).run(params);
                }
            });
            batch(commands);
        }),
    },
}));

describe('ChannelDataSource Test', () => {
    beforeAll(() => {
        const migrate = mockDb.transaction(() => {
            for (let v = 0; v < TARGET_VERSION; v++) {
                MIGRATIONS[v]?.forEach((sql: string) => mockDb.exec(sql));
            }
            mockDb.pragma(`user_version = ${TARGET_VERSION}`);
        });
        migrate();
    });

    beforeEach(() => {
        mockDb.exec(`DELETE FROM ${TABLES.CHANNELS}`);
        jest.clearAllMocks();
    });

    // --- 대량 데이터 배치 처리 및 정합성 ---
    describe('High-Volume Batch Performance', () => {
        it('1,000개의 채널을 한 번에 저장하고 sid별 필터링이 정확한지 확인한다', async () => {
            const bulkChannels = Array.from({ length: 1000 }, (_, i) => ({
                id: `ch_${i}`,
                data: {
                    sid: i % 2 === 0 ? 'site_even' : 'site_odd',
                    name: `Channel No.${i}`,
                    isNotificationEnabled: true,
                },
            }));

            await channelDataSource.saveAll(bulkChannels as any, 'cloud_perf');
            const evenChannels = await channelDataSource.fetchAll('cloud_perf', { sid: 'site_even' });
            expect(evenChannels).toHaveLength(500);
            expect(evenChannels[0].sid).toBe('site_even');
        });
    });

    // --- 클라우드(CID) 간 데이터 격리 ---
    describe('Cloud Multi-tenant Isolation', () => {
        it('Cloud A의 검색 결과에 Cloud B의 채널이 섞이지 않아야 한다', async () => {
            const channelData = { sid: 's1', name: 'Shared Name' };

            await channelDataSource.save('common_id', channelData as any, 'cloud_A');
            await channelDataSource.save('common_id', { ...channelData, name: 'B Side' } as any, 'cloud_B');

            const resultA = await channelDataSource.fetchAll('cloud_A', { keyword: 'Shared' });
            expect(resultA).toHaveLength(1);
            expect(resultA[0].name).toBe('Shared Name');
            expect(resultA[0].cid).toBe('cloud_A');
        });
    });

    // ---  특수 문자 검색 및 SQL 인젝션 방어 ---
    describe('Special Characters & SQL Security', () => {
        it('따옴표, 이모지, SQL 명령어가 포함된 이름도 안전하게 검색한다', async () => {
            const complexNames = [
                { id: 'c1', name: "L'Oreal's Lounge" },
                { id: 'c2', name: '🚀 Mars Base' },
                { id: 'c3', name: 'DROP TABLE users;' },
            ];

            await channelDataSource.saveAll(
                complexNames.map(c => ({ id: c.id, data: { ...c, sid: 's1' } })),
                'cloud1'
            );

            // 1. 따옴표 검색 (SQL 에러 방지)
            const result1 = await channelDataSource.fetchAll('cloud1', { keyword: "L'Oreal" });
            expect(result1).toHaveLength(1);

            // 2. 이모지 검색
            const result2 = await channelDataSource.fetchAll('cloud1', { keyword: '🚀' });
            expect(result2[0].name).toContain('Mars');

            // 3. SQL 명령어 검색 (데이터로 취급되는지 확인)
            const result3 = await channelDataSource.fetchAll('cloud1', { keyword: 'DROP' });
            expect(result3).toHaveLength(1);
        });
    });

    // --- 엣지 케이스 및 방어 로직 ---
    describe('Edge Case Handling', () => {
        it('name이나 sid가 누락된 데이터가 들어와도 기본값으로 저장되어야 한다', async () => {
            const brokenData = { someField: 'no name and sid' };

            // extractSid, extractName 로직 검증
            await channelDataSource.save('broken_1', brokenData as any, 'cloud1');

            const result = await channelDataSource.fetch('broken_1', 'cloud1');
            expect(result).not.toBeNull();

            // DB 컬럼에 기본값이 잘 박혔는지 확인
            const row = mockDb.prepare(`SELECT sid, name FROM ${TABLES.CHANNELS} WHERE id = 'broken_1'`).get() as any;
            expect(row.sid).toBe('default'); // extractSid 기본값
            expect(row.name).toBe(''); // extractName 기본값
        });

        it('removeAll에 빈 배열을 넘겼을 때 시스템에 영향이 없어야 한다', async () => {
            const spy = jest.spyOn(require('../../../database/database').database, 'executeBatch');

            await channelDataSource.removeAll([], 'cloud1');
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });
});
