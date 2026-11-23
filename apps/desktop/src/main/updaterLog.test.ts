import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createUpdaterLog, MAX_LOG_BYTES, UPDATER_LOG_FILE } from './updaterLog';

describe('updater log', () => {
    let dir: string;
    const at = () => new Date('2026-01-02T03:04:05.000Z');
    const read = () => readFileSync(join(dir, UPDATER_LOG_FILE), 'utf8');

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'updater-log-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('has a line on disk as soon as it is logged', () => {
        const log = createUpdaterLog(join(dir, 'logs'), at);

        log.info('Executing: installer.exe with args: --updated,--force-run');

        expect(readFileSync(join(dir, 'logs', UPDATER_LOG_FILE), 'utf8')).toBe(
            '2026-01-02T03:04:05.000Z [info] Executing: installer.exe with args: --updated,--force-run\n'
        );
    });

    it('keeps earlier runs and marks each level', () => {
        createUpdaterLog(dir, at).warn('first run');
        createUpdaterLog(dir, at).error(new Error('second run'));

        expect(read()).toBe(
            '2026-01-02T03:04:05.000Z [warn] first run\n2026-01-02T03:04:05.000Z [error] Error: second run\n'
        );
    });

    it('starts over once the file is past its size limit', () => {
        writeFileSync(join(dir, UPDATER_LOG_FILE), 'x'.repeat(MAX_LOG_BYTES + 1));

        createUpdaterLog(dir, at).info('fresh');

        expect(read()).toBe('2026-01-02T03:04:05.000Z [info] fresh\n');
    });

    it('does not throw when the log cannot be written', () => {
        const blocked = join(dir, 'not-a-directory');
        writeFileSync(blocked, '');

        expect(() => createUpdaterLog(join(blocked, 'logs'), at).info('lost')).not.toThrow();
    });
});
