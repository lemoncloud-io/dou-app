import type { Scalar, SQLBatchTuple } from '@op-engineering/op-sqlite';
import { open } from '@op-engineering/op-sqlite';
import { SQL_SCHEMAS } from './schema';
import { logger } from '../../../services';

const db = open({ name: 'dou.sqlite' });

const initTables = async () => {
    try {
        await db.transaction(async tx => {
            SQL_SCHEMAS.forEach(query => {
                tx.execute(query);
            });
        });
    } catch (error) {
        logger.error('SQL', 'Table initialization failed:', error);
    }
};

void initTables();

export const database = {
    execute: (query: string, params?: Scalar[]) => db.execute(query, params),
    executeBatch: (commands: SQLBatchTuple[]) => db.executeBatch(commands),
};
