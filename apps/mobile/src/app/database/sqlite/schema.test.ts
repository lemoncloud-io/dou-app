import { MIGRATIONS, TARGET_VERSION } from './schema';
import { TABLES } from './tables';

const allStatements = () => Object.values(MIGRATIONS).flat();

describe('MIGRATIONS', () => {
    // A table name interpolated from TABLES becomes the literal "undefined" once the name is removed
    // from TABLES, and a fresh install would then replay that broken statement.
    it('never interpolates a table name that no longer exists', () => {
        for (const sql of allStatements()) {
            expect(sql).not.toMatch(/\bundefined\b/);
        }
    });

    it('drops the retired upload task table and its index in the latest migration', () => {
        const latest = MIGRATIONS[TARGET_VERSION - 1];

        expect(latest).toEqual([
            'DROP INDEX IF EXISTS idx_upload_tasks_status_updated;',
            'DROP TABLE IF EXISTS upload_tasks;',
        ]);
    });

    it('still creates the table in migration 7, so the chain replays unchanged on a fresh install', () => {
        expect(MIGRATIONS[7].join('\n')).toContain('CREATE TABLE IF NOT EXISTS upload_tasks (');
    });

    it('keeps the version numbers contiguous, so no step is skipped', () => {
        const versions = Object.keys(MIGRATIONS)
            .map(Number)
            .sort((a, b) => a - b);
        expect(versions).toEqual(versions.map((_, i) => i));
        expect(TARGET_VERSION).toBe(versions.length);
    });
});

describe('TABLES', () => {
    it('no longer lists the upload task table', () => {
        expect(Object.values(TABLES)).not.toContain('upload_tasks');
    });
});
