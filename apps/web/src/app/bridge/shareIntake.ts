import { logger } from '@chatic/bridges';
import { runtime, type ShellFileRef } from '@chatic/runtime';
import type { RefusedAttachment } from '@chatic/bridge-messages';

import { toShellFile } from './attachmentPicker';

/**
 * What another app shared to Dou, as the share page uses it: the items as shell files the send reads
 * from the app's folder (a photo's bytes are read at the send, as for the documents picker), what the
 * app would not copy, and any shared text or link.
 */
export interface ShareIntake {
    items: ShellFileRef[];
    refused: RefusedAttachment[];
    text?: string;
}

const codeOf = (error: unknown): string | undefined => (error as { code?: string })?.code;

/**
 * Codes that mean there is nothing to show, as opposed to a failure worth retrying: a share already
 * released or wiped (`GONE`), and an id the app would never have made (`INVALID`, a hand-typed URL).
 */
const NOTHING_TO_SHARE = new Set(['GONE', 'INVALID']);

/**
 * The share behind `/share?id=`, or `null` when there is nothing to share. Rejects only on a transient
 * failure — a timeout or the bridge dropping — which the page reports rather than reading as empty.
 */
export const fetchShareIntake = async (id: string): Promise<ShareIntake | null> => {
    // Only an app can share into the page; where none does, there is nothing to show.
    const source = runtime.links.shareIntake;
    if (!source) return null;
    try {
        const data = await source.fetch(id);
        return {
            items: data.items.map(toShellFile),
            refused: data.refused,
            text: data.text?.trim() || undefined,
        };
    } catch (error) {
        const code = codeOf(error);
        if (NOTHING_TO_SHARE.has(code ?? '')) return null;
        // Everything else is treated as passing — a timeout, or `NATIVE_NOT_SUPPORTED` while the bridge
        // is still attaching — and offered as a retry. Logged, since the page only says it failed.
        logger.warn('file.share_intake_fetch_failed', 'share intake fetch failed', { code });
        throw error;
    }
};

/**
 * Tells the app to forget the share. `discard` deletes its copies — the person cancelled; without it
 * the copies stay for the uploads still reading them. Never rejects: a release that does not land
 * leaves the copies to the app's own day-old sweep, which is no reason to stop the person.
 */
export const releaseShareIntake = async (id: string, { discard }: { discard: boolean }): Promise<void> => {
    const source = runtime.links.shareIntake;
    if (!source) return;
    try {
        await source.release(id, { discard });
    } catch (error) {
        logger.warn('file.share_intake_release_failed', 'share intake release failed', {
            code: codeOf(error),
            discard,
        });
    }
};
