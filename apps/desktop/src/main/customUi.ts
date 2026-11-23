import { join, resolve, sep } from 'node:path';

export const hashUrl = (url: string): string => {
    let hash = 5381;
    for (let i = 0; i < url.length; i += 1) {
        hash = (hash * 33) ^ url.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
};

export const bundleRootFor = (baseDir: string, zipUrl: string): string => join(baseDir, 'webroot', hashUrl(zipUrl));

export const zipDownloadPath = (baseDir: string, zipUrl: string): string => join(baseDir, `${hashUrl(zipUrl)}.zip`);

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
export const isSymlinkEntry = (externalFileAttributes: number): boolean =>
    ((externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK;

export const isAllowedBundleUrl = (url: string): boolean => /^https:\/\//i.test(url);

export const isDocumentRequest = (accept: string | null): boolean =>
    (accept ?? '').split(',').some(entry => entry.split(';')[0].trim() === 'text/html');

export const resolveEntryPath = (root: string, requestUrl: string): string | null => {
    let pathname: string;
    try {
        ({ pathname } = new URL(requestUrl));
    } catch {
        return null;
    }

    let decoded: string;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    if (decoded.includes('\0')) return null;

    const relative = decoded.replace(/^\/+/, '');
    const rootPath = resolve(root);
    const target = resolve(rootPath, relative === '' ? 'index.html' : relative);

    return target.startsWith(rootPath + sep) ? target : null;
};
