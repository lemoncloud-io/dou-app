/**
 * Wire contract for download notices, shared by main and preload.
 *
 * Same reasoning as `loginItemContract.ts`: an electron-free file both sides compile. The renderer
 * half is declared in `apps/desktop-web` (`shared/utils/electronApi.ts`) and kept in sync by hand —
 * change one, change the other.
 */

/** Main → page: a download the page started has ended. */
export const DOWNLOAD_DONE_CHANNEL = 'chatic-download:done';

/** Page → main: show a finished download in the file manager. */
export const DOWNLOAD_REVEAL_CHANNEL = 'chatic-download:reveal';

/** How a download ended. A cancelled one (the save dialog dismissed) is not reported. */
export interface DownloadDone {
    /** What the page names it by to show it; set only when it completed. */
    id?: string;
    /** The saved file's name, as it landed (a numbered name when one was taken). */
    name: string;
    state: 'completed' | 'interrupted';
}
