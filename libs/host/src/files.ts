import { hostProfile, type HostProfile } from '@chatic/bridges';

import { resolveAppOrPage, type AppOrPage } from './appOrPage';

/**
 * Who moves a message's files: uploads, downloads, and the first frame of a video without a poster.
 *
 * - `app` — the app does: its transfer module puts and fetches the bytes in the background, keeps a
 *   downloaded file to open, save or share, and reads a video's frame from the device.
 * - `page` — the page does, with its own requests: a PUT for an upload, a fetch saved under the file's
 *   name for a download, and a frame drawn from the bucket's copy.
 *
 * Only the choice crosses this port, as for `media`: the transfer modules take their types from the
 * data layer and the runtime, which this package may not reach, so they live in the app that uses them
 * and read this port to know whether the app's side applies.
 */
export interface FilesPort {
    readonly kind: FilesMethod;
}

export type FilesMethod = AppOrPage;

/**
 * The declaration version that introduced `files`. Version 2 shipped with `media` alone, so a build
 * declaring version 2 never knew this key and the legacy rule answers for it.
 */
export const FILES_INTRODUCED_IN = 3;

/**
 * Who moves files on this host. A declaration names `'app'` or `'page'`; anything else is a bug in the
 * shell, answered with the page's own requests — the ones every host can make — and logged. A
 * declaration older than version 3 never knew the key, so the legacy rule answers for it.
 */
export const resolveFilesMethod = (profile: HostProfile = hostProfile()): FilesMethod =>
    resolveAppOrPage(profile, 'files', FILES_INTRODUCED_IN);
