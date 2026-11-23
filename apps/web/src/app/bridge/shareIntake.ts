import { logger } from '@chatic/bridges';
import { runtime, type ShellFileRef } from '@chatic/runtime';
import type { RefusedAttachment } from '@chatic/bridge-messages';

import { toShellFile } from './attachmentPicker';

export interface ShareIntake {
    items: ShellFileRef[];
    refused: RefusedAttachment[];
    text?: string;
}

const codeOf = (error: unknown): string | undefined => (error as { code?: string })?.code;

const NOTHING_TO_SHARE = new Set(['GONE', 'INVALID']);

export const fetchShareIntake = async (id: string): Promise<ShareIntake | null> => {
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
        logger.warn('file.share_intake_fetch_failed', 'share intake fetch failed', { code });
        throw error;
    }
};

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
