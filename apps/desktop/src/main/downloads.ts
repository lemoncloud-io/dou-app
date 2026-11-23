import { basename, extname, join } from 'node:path';

const IMAGE_EXTENSIONS = new Map<string, readonly string[]>([
    ['image/png', ['.png']],
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/gif', ['.gif']],
    ['image/webp', ['.webp']],
]);

export const savesWithoutAsking = (name: string, mimeType: string): boolean =>
    IMAGE_EXTENSIONS.get(mimeType)?.includes(extname(name).toLowerCase()) ?? false;

export interface DownloadTargets {
    reserve: (suggestedName: string) => string;
    release: (path: string) => void;
}

export const createDownloadTargets = (dir: string, exists: (path: string) => boolean): DownloadTargets => {
    const reserved = new Set<string>();
    const isTaken = (path: string) => reserved.has(path.toLowerCase()) || exists(path);

    const reserve = (suggestedName: string): string => {
        const base = basename(suggestedName);
        const name = base && base !== '.' && base !== '..' ? base : 'download';
        const extension = extname(name);
        const stem = name.slice(0, name.length - extension.length);
        let path = join(dir, name);
        for (let n = 1; isTaken(path); n++) path = join(dir, `${stem} (${n})${extension}`);
        reserved.add(path.toLowerCase());
        return path;
    };

    const release = (path: string): void => {
        reserved.delete(path.toLowerCase());
    };

    return { reserve, release };
};

export interface DownloadLog {
    record: (path: string) => string;
    pathOf: (id: unknown) => string | undefined;
}

export const createDownloadLog = (limit = 50): DownloadLog => {
    const paths = new Map<string, string>();
    let seq = 0;
    return {
        record: path => {
            const id = `download-${++seq}`;
            paths.set(id, path);
            if (paths.size > limit) paths.delete(paths.keys().next().value as string);
            return id;
        },
        pathOf: id => (typeof id === 'string' ? paths.get(id) : undefined),
    };
};
