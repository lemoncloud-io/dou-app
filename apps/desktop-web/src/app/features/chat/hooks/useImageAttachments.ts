import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    /** An image previews from `url`; a video or document has no preview (`url` is empty) and shows its name. */
    kind: ChatUploadKind;
    size: number;
}

let nextId = 0;

const REASONS = ['limit', 'duplicate', 'unsupported', 'too-large', 'name-too-long'] as const;

/**
 * The composer's attachment tray: add (pick / drop / paste), remove, clear.
 *
 * Each image gets an object URL for its preview; a video or document shows its name instead. The upload itself starts only at send,
 * on the message's own row. URLs are revoked on remove, on clear (the send clears the
 * tray; the sent row keeps its own previews), when `scopeKey` changes (another channel
 * or thread) and on unmount.
 *
 * Files a batch could not take are reported in a toast that counts them by reason.
 * It was a blocking dialog, one reason per drop: the rest of what was left out went
 * unsaid, and a duplicate stopped everything until it was dismissed.
 */
export const useImageAttachments = (scopeKey: string) => {
    const { t } = useTranslation();
    const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
    // Mirror for the callbacks below, so `addFiles` validates against the tray as it is
    // right now even when two drops land before a render.
    const current = useRef<ComposerAttachment[]>([]);

    const commit = useCallback((next: ComposerAttachment[]) => {
        current.current = next;
        setAttachments(next);
    }, []);

    const clear = useCallback(() => {
        current.current.forEach(attachment => attachment.url && URL.revokeObjectURL(attachment.url));
        commit([]);
    }, [commit]);

    useEffect(() => clear, [scopeKey, clear]);

    const addFiles = useCallback(
        (files: readonly File[]) => {
            const { accepted, rejected } = validateAttachments(
                current.current.map(attachment => attachment.key),
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
                    url: kind === 'image' ? URL.createObjectURL(file) : '',
                    file,
                    kind,
                    size: file.size,
                };
            });
            commit([...current.current, ...added]);
        },
        [commit, t]
    );

    const remove = useCallback(
        (id: string) => {
            const target = current.current.find(attachment => attachment.id === id);
            if (target?.url) URL.revokeObjectURL(target.url);
            commit(current.current.filter(attachment => attachment.id !== id));
        },
        [commit]
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
