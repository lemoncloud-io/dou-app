import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { logger } from '@chatic/logger';
import type { StoragePort } from '@chatic/ports';

export type KeyValueStore = StoragePort['device'];

const isMissing = (error: unknown): boolean => (error as { code?: unknown } | null)?.code === 'ENOENT';

const parseValues = (raw: string): Map<string, string> | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return new Map(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
};

const readValues = (path: string): Map<string, string> => {
    let raw: string;
    try {
        raw = readFileSync(path, 'utf8');
    } catch (error) {
        if (isMissing(error)) return new Map();
        throw error;
    }
    const values = parseValues(raw);
    if (values) return values;
    logger.warn('storage.file_unreadable', '[fileStore] unreadable file — read as empty', { data: { path } });
    return new Map();
};

const writeValues = (path: string, values: ReadonlyMap<string, string>): void => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    const handle = openSync(temporary, 'w', 0o600);
    try {
        writeSync(handle, JSON.stringify(Object.fromEntries(values)));
        fsyncSync(handle);
    } finally {
        closeSync(handle);
    }
    renameSync(temporary, path);
};

export const fileStore = (path: string): KeyValueStore => {
    const values = readValues(path);
    return {
        get: key => values.get(key) ?? null,
        set: (key, value) => {
            values.set(key, value);
            writeValues(path, values);
        },
        remove: key => {
            if (!values.delete(key)) return;
            writeValues(path, values);
        },
        clear: () => {
            values.clear();
            writeValues(path, values);
        },
        keys: () => [...values.keys()],
    };
};

export const FILE_STORE_NAMES = { secret: 'secret.json', plain: 'plain.json', device: 'device.json' } as const;

export const fileStoragePorts = (directory: string): StoragePort => ({
    secret: fileStore(join(directory, FILE_STORE_NAMES.secret)),
    plain: fileStore(join(directory, FILE_STORE_NAMES.plain)),
    device: fileStore(join(directory, FILE_STORE_NAMES.device)),
});
