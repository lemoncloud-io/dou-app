import { Zip, ZipPassThrough } from 'fflate';

import { saveBlob, withExtension } from './imageActions';

export const ZIP_SIZE_LIMIT = 300 * 1024 * 1024;

export interface ZipEntry {
    name: string;
    size?: number;
}

export const fitsInZip = (entries: readonly ZipEntry[]): boolean =>
    entries.reduce((total, entry) => total + (entry.size ?? 0), 0) <= ZIP_SIZE_LIMIT;

const splitExtension = (name: string): [string, string] => {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
};

// eslint-disable-next-line no-control-regex -- control characters are exactly what a zip entry name must not carry
const UNSAFE_IN_NAME = /[/\\:*?"<>|\u0000-\u001f]/g;

export const uniqueNames = (names: readonly string[]): string[] => {
    const taken = new Set<string>();
    return names.map(raw => {
        const name = raw.normalize('NFC').replace(UNSAFE_IN_NAME, '_') || 'file';
        const [stem, extension] = splitExtension(name);
        let candidate = name;
        for (let n = 1; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}`;
        taken.add(candidate.toLowerCase());
        return candidate;
    });
};

export const buildZip = async (files: readonly { name: string; blob: Blob }[]): Promise<Uint8Array[]> => {
    const names = uniqueNames(files.map(file => withExtension(file.name, file.blob.type)));
    const chunks: Uint8Array[] = [];
    let failure: Error | null = null;
    const zip = new Zip((error, chunk) => {
        if (error) failure = error;
        else chunks.push(chunk);
    });
    for (const [index, file] of files.entries()) {
        const entry = new ZipPassThrough(names[index]);
        zip.add(entry);
        entry.push(new Uint8Array(await file.blob.arrayBuffer()), true);
    }
    zip.end();
    if (failure) throw failure;
    return chunks;
};

export interface ZipDownloadResult {
    saved: number;
    failed: number;
}

export const downloadAsZip = async <T extends ZipEntry>(
    files: readonly T[],
    zipName: string,
    load: (file: T) => Promise<Blob>
): Promise<ZipDownloadResult> => {
    const settled = await Promise.allSettled(files.map(load));
    const loaded = settled.flatMap((result, index) =>
        result.status === 'fulfilled' ? [{ name: files[index].name, blob: result.value }] : []
    );
    const failed = files.length - loaded.length;
    if (loaded.length === 0) return { saved: 0, failed };
    const chunks = (await buildZip(loaded)) as Uint8Array<ArrayBuffer>[];
    saveBlob(new Blob(chunks, { type: 'application/zip' }), zipName);
    return { saved: loaded.length, failed };
};
