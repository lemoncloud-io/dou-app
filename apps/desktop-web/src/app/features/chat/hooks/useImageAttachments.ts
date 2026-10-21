import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

import type { TFunction } from 'i18next';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { CHAT_ATTACHMENT_MAX_BYTES, chatAttachmentFormat, type ChatUploadKind } from '@chatic/data';

import {
    MAX_ATTACHMENTS,
    attachmentKey,
    formatFileSize,
    validateAttachments,
    type AttachmentRejections,
    type ChatImage,
} from '../utils';

/** A picked file waiting in the composer tray. */
export interface ComposerAttachment extends ChatImage {
    /** `attachmentKey` of the file — what the duplicate check compares. */
    key: string;
    file: File;
    /** An image's tile draws `url`; a video's or document's tile shows its name, and `url` opens it in the preview when the preview can draw it. */
    kind: ChatUploadKind;
    size: number;
}

let nextId = 0;

const REASONS = ['limit', 'duplicate', 'unsupported', 'too-large', 'name-too-long'] as const;

const NO_ATTACHMENTS: ComposerAttachment[] = [];

/**
 * Every conversation's tray, outside the pane that shows it, so leaving the channel or the page and
 * coming back finds the files where they were — the same way the typed text survives in
 * `useComposerDraftStore`. In memory only: a page `File` cannot be stored, so the tray lasts as long
 * as the window does.
 */
const useTrayStore = create<{ trays: Record<string, ComposerAttachment[]> }>(() => ({ trays: {} }));

const trayOf = (scopeKey: string): ComposerAttachment[] => useTrayStore.getState().trays[scopeKey] ?? NO_ATTACHMENTS;

const setTray = (scopeKey: string, next: ComposerAttachment[]) =>
    useTrayStore.setState(state => {
        if (next.length > 0) return { trays: { ...state.trays, [scopeKey]: next } };
        if (!(scopeKey in state.trays)) return state;
        const { [scopeKey]: _dropped, ...rest } = state.trays;
        return { trays: rest };
    });

/**
 * The composer's attachment tray for one conversation (`scopeKey`: a channel, or a channel's
 * thread): add (pick / drop / paste), remove, clear.
 *
 * Each file gets an object URL: an image's tile draws it, and the preview opens an image, a video, a PDF or a text file from it. The upload itself starts only at send,
 * on the message's own row. URLs are revoked on remove and on clear (the send clears the tray; the
 * sent row keeps its own previews) — not when the composer moves to another conversation or
 * unmounts, since the tray waits there for the way back.
 *
 * Files a batch could not take are reported in a toast that counts them by reason.
 * It was a blocking dialog, one reason per drop: the rest of what was left out went
 * unsaid, and a duplicate stopped everything until it was dismissed.
 */
export const useImageAttachments = (scopeKey: string) => {
    const { t } = useTranslation();
    const attachments = useTrayStore(state => state.trays[scopeKey] ?? NO_ATTACHMENTS);

    const clear = useCallback(() => {
        trayOf(scopeKey).forEach(attachment => URL.revokeObjectURL(attachment.url));
        setTray(scopeKey, []);
    }, [scopeKey]);

    const addFiles = useCallback(
        (files: readonly File[]) => {
            // Read from the store, not the render, so two drops landing before a render are both
            // checked against the tray as it is right now.
            const tray = trayOf(scopeKey);
            const { accepted, rejected } = validateAttachments(
                tray.map(attachment => attachment.key),
                files
            );
            reportRejections(rejected, t);
            if (accepted.length === 0) return;
            const added = accepted.map((file): ComposerAttachment => {
                // Validation accepted it, so a format is known.
                const kind = chatAttachmentFormat(file)?.kind ?? 'file';
                return {
                    id: `attachment-${++nextId}`,
                    key: attachmentKey(file),
                    name: file.name,
                    url: URL.createObjectURL(file),
                    file,
                    kind,
                    size: file.size,
                };
            });
            setTray(scopeKey, [...tray, ...added]);
        },
        [scopeKey, t]
    );

    const remove = useCallback(
        (id: string) => {
            const tray = trayOf(scopeKey);
            const target = tray.find(attachment => attachment.id === id);
            if (target) URL.revokeObjectURL(target.url);
            setTray(
                scopeKey,
                tray.filter(attachment => attachment.id !== id)
            );
        },
        [scopeKey]
    );

    return { attachments, addFiles, remove, clear };
};

const reportRejections = (rejected: AttachmentRejections, t: TFunction) => {
    const lines = REASONS.filter(reason => rejected[reason]).map(reason =>
        t(`chat.attach.rejected.${reason}`, {
            count: rejected[reason],
            max: MAX_ATTACHMENTS,
            image: formatFileSize(CHAT_ATTACHMENT_MAX_BYTES.image),
            video: formatFileSize(CHAT_ATTACHMENT_MAX_BYTES.video),
            file: formatFileSize(CHAT_ATTACHMENT_MAX_BYTES.file),
        })
    );
    if (lines.length === 0) return;
    // An unsupported file is the one refusal that is a mistake; the others are limits.
    toast({ variant: rejected.unsupported ? 'destructive' : 'info', description: lines.join(' ') });
};
