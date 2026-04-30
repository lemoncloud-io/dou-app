import Database from 'better-sqlite3';
import { joinDataSource } from './joinDataSource';
import { MIGRATIONS, TARGET_VERSION } from '../../../database';
import { TABLES } from '../../../database';

const mockDb = new Database(':memory:');

jest.mock('../../../database', () => ({
    database: {
        execute: jest.fn(async (query: string, params: any[] = []) => {
            const stmt = mockDb.prepare(query);
            return query.trim().toUpperCase().startsWith('SELECT')
                ? { rows: stmt.all(params) }
                : { rows: [], changes: stmt.run(params).changes };
        }),
        executeBatch: jest.fn(async (commands: any[]) => {
            mockDb.transaction(cmds => {
                for (const [sql, params] of cmds) mockDb.prepare(sql).run(params);
            })(commands);
        }),
    },
}));

describe('JoinDataSource Complex Relationship Test', () => {
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
        mockDb.exec(`DELETE FROM ${TABLES.JOINS}`);
        jest.clearAllMocks();
    });

    it('Bidirectional Search: 채널 ID 또는 유저 ID로 정확히 필터링되어야 한다', async () => {
        const joins = [
            { id: 'j1', data: { channelId: 'ch1', userId: 'userA' } },
            { id: 'j2', data: { channelId: 'ch1', userId: 'userB' } },
            { id: 'j3', data: { channelId: 'ch2', userId: 'userA' } },
        ];
        await joinDataSource.saveAll(joins as any, 'cloud1');

        // 특정 채널에 속한 모든 유저 조회
        const ch1Users = await joinDataSource.fetchAll('cloud1', { channelId: 'ch1' });
        expect(ch1Users).toHaveLength(2);

        // 특정 유저가 속한 모든 채널 조회
        const userAChannels = await joinDataSource.fetchAll('cloud1', { userId: 'userA' });
        expect(userAChannels).toHaveLength(2);
        expect(userAChannels.map(j => j.channelId)).toContain('ch1');
        expect(userAChannels.map(j => j.channelId)).toContain('ch2');
    });

    it('Multi-tenant Isolation: CID가 다르면 참여 정보가 독립적이어야 한다', async () => {
        const data = { channelId: 'ch1', userId: 'user1' };

        await joinDataSource.save('join_1', data as any, 'cloud_A');
        await joinDataSource.save('join_1', data as any, 'cloud_B');

        const resultA = await joinDataSource.fetchAll('cloud_A');
        expect(resultA).toHaveLength(1);
        expect(resultA[0].cid).toBe('cloud_A');
    });

    it('Data Integrity: saveAll 시 이중 stringify 없이 객체가 정상 저장되어야 한다', async () => {
        const item = { id: 'j1', data: { channelId: 'ch1', userId: 'u1' } };
        await joinDataSource.saveAll([item] as any, 'c1');

        const fetched = await joinDataSource.fetch('j1', 'c1');
        expect(typeof fetched).toBe('object');
        expect(fetched?.channelId).toBe('ch1');
    });
});
