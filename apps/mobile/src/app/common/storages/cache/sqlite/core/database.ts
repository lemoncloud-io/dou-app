import type { Scalar, SQLBatchTuple } from '@op-engineering/op-sqlite';
import { open } from '@op-engineering/op-sqlite';
import { SQL_SCHEMAS } from './schema';
import { logger } from '../../../../services';

const db = open({ name: 'dou.sqlite' });

const initTables = async () => {
    try {
        await db.transaction(async tx => {
            SQL_SCHEMAS.forEach(query => {
                tx.execute(query);
            });
        });
    } catch (error) {
        logger.error('SQLITE', 'Table initialization failed:', error);
    }
};

void initTables();

export const database = {
    execute: (query: string, params?: Scalar[]) => db.execute(query, params),
    executeBatch: (commands: SQLBatchTuple[]) => db.executeBatch(commands),

    /**
     * 백업: 현재 데이터베이스의 스냅샷을 지정된 파일 경로로 안전하게 복사합니다.
     * (주의: 대상 경로에 파일이 이미 존재하면 에러가 발생하므로, 호출 전 기존 파일 삭제를 권장합니다.)
     * @param destFilePath 백업이 저장될 절대 파일 경로 (예: RNFS.DocumentDirectoryPath + '/backup.sqlite')
     */
    backup: async (destFilePath: string): Promise<void> => {
        try {
            const safePath = destFilePath.replace(/'/g, "''");
            await db.execute(`VACUUM INTO '${safePath}'`);
            logger.info('SQLITE', `Database backed up successfully to ${destFilePath}`);
        } catch (error) {
            logger.error('SQLITE', `Backup failed to ${destFilePath}`, error);
            throw error;
        }
    },

    /**
     * 복원: 백업된 데이터베이스 파일의 데이터를 현재 데이터베이스로 가져옵니다.
     * 버전에 따른 스키마 불일치(컬럼 추가/삭제) 에러를 방지하기 위해 교집합 컬럼만 안전하게 복사합니다.
     * @param sourceFilePath 복원할 백업 파일의 절대 경로
     */
    restore: async (sourceFilePath: string): Promise<void> => {
        try {
            const safePath = sourceFilePath.replace(/'/g, "''");

            // 백업 DB를 'backup_db'라는 별칭으로 현재 DB에 연결(Attach)
            await db.execute(`ATTACH DATABASE '${safePath}' AS backup_db`);

            // 트랜잭션 내에서 데이터 교체 작업 수행
            await db.transaction(async tx => {
                const result = await tx.execute(
                    `SELECT name FROM backup_db.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
                );

                const tables = (result.rows || []) as { name: string }[];

                for (const { name: tableName } of tables) {
                    const mainInfo = await tx.execute(`PRAGMA main.table_info(${tableName})`);
                    const backupInfo = await tx.execute(`PRAGMA backup_db.table_info(${tableName})`);

                    const mainCols = (mainInfo.rows || []).map(c => c.name as string);
                    const backupCols = (backupInfo.rows || []).map(c => c.name as string);

                    // 두 DB에 공통으로 존재하는 컬럼(교집합)만 추출
                    const sharedCols = mainCols.filter(c => backupCols.includes(c)).join(', ');
                    if (!sharedCols) continue;

                    // 기존 데이터 완전히 비우기
                    await tx.execute(`DELETE
                                      FROM main.${tableName}`);

                    // 교집합 컬럼만 삽입
                    await tx.execute(`INSERT INTO main.${tableName} (${sharedCols})
                                      SELECT ${sharedCols}
                                      FROM backup_db.${tableName}`);
                }
            });

            await db.execute('DETACH DATABASE backup_db');
            logger.info('SQLITE', `Database restored successfully from: ${sourceFilePath}`);
        } catch (error) {
            logger.error('SQLITE', `Restore failed from ${sourceFilePath}`, error);
            try {
                await db.execute('DETACH DATABASE backup_db');
            } catch (e) {
                logger.error('SQLITE', `Detach database failed`, e);
            }
            throw error;
        }
    },
    close: () => db.close(),
};
