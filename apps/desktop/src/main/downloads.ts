/**
 * Where an image downloaded from the app's own pages is saved: straight into the Downloads folder,
 * the way Chrome and Slack do, instead of Electron's default save dialog per file — which turned
 * "Download all" into one dialog per image.
 *
 * Deliberately imports no electron: this runs under jest, which cannot load electron.
 */
import { basename, extname, join } from 'node:path';

/**
 * The image types the app sends, each with the extensions a file of that type may carry. A Map,
 * not an object: the type comes from web content, and `constructor` must not find a member.
 */
const IMAGE_EXTENSIONS = new Map<string, readonly string[]>([
    ['image/png', ['.png']],
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/gif', ['.gif']],
    ['image/webp', ['.webp']],
]);

/**
 * Only an image skips the dialog, and only when its name says the same thing as its type. The
 * dialog was the one point where the user saw a file before it landed; without it, a script
 * running in the app's page could drop an executable (`.command`, `.app`) into Downloads unseen.
 * Everything else keeps asking.
 */
export const savesWithoutAsking = (name: string, mimeType: string): boolean =>
    IMAGE_EXTENSIONS.get(mimeType)?.includes(extname(name).toLowerCase()) ?? false;

export interface DownloadTargets {
    /** A free path in the folder for this name, held until `release`. */
    reserve: (suggestedName: string) => string;
    /** The download at `path` is done (saved, cancelled or failed); its name may be handed out again. */
    release: (path: string) => void;
}

export const createDownloadTargets = (dir: string, exists: (path: string) => boolean): DownloadTargets => {
    // `will-download` asks for a path before a byte is written, so several images with one name
    // would all find it free on disk and overwrite each other. In-flight paths count as taken.
    // Lower-cased because the default macOS and Windows volumes ignore case.
    const reserved = new Set<string>();
    const isTaken = (path: string) => reserved.has(path.toLowerCase()) || exists(path);

    const reserve = (suggestedName: string): string => {
        // The name comes from web content; only its last segment is ever used, so it cannot leave `dir`.
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
