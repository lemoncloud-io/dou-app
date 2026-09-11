import { useCallback, useEffect, useRef, useState } from 'react';

import { attachmentKey, validateAttachments, type AttachmentRejection, type ChatImage } from '../utils';

/** A picked file waiting in the composer tray. */
export interface ComposerAttachment extends ChatImage {
    /** `attachmentKey` of the file — what the duplicate check compares. */
    key: string;
    file: File;
}

let nextId = 0;

/**
 * The composer's image tray: add (pick / drop / paste), remove, clear — plus the one
 * notice a refused batch raises (over ten, a duplicate, an unsupported type).
 *
 * Each file gets an object URL for its preview and is marked uploading until the
 * browser has decoded it, which is what the tile's spinner shows today; once there is an
 * upload API the same flag covers the real transfer. URLs are revoked on remove, on
 * clear, when `scopeKey` changes (another channel or thread) and on unmount.
 */
export const useImageAttachments = (scopeKey: string) => {
    const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
    const [notice, setNotice] = useState<AttachmentRejection | null>(null);
    // Mirror for the callbacks below, so `addFiles` validates against the tray as it is
    // right now even when two drops land before a render.
    const current = useRef<ComposerAttachment[]>([]);

    const commit = useCallback((next: ComposerAttachment[]) => {
        current.current = next;
        setAttachments(next);
    }, []);

    const clear = useCallback(() => {
        current.current.forEach(attachment => URL.revokeObjectURL(attachment.url));
        commit([]);
    }, [commit]);

    useEffect(() => clear, [scopeKey, clear]);

    const addFiles = useCallback(
        (files: readonly File[]) => {
            const { accepted, rejection } = validateAttachments(
                current.current.map(attachment => attachment.key),
                files
            );
            if (rejection) setNotice(rejection);
            if (accepted.length === 0) return;
            const added = accepted.map(
                (file): ComposerAttachment => ({
                    id: `attachment-${++nextId}`,
                    key: attachmentKey(file),
                    name: file.name,
                    url: URL.createObjectURL(file),
                    file,
                    isUploading: true,
                })
            );
            commit([...current.current, ...added]);
            added.forEach(attachment => {
                const image = new Image();
                const settle = () =>
                    commit(
                        current.current.map(item =>
                            item.id === attachment.id ? { ...item, isUploading: false } : item
                        )
                    );
                image.onload = settle;
                image.onerror = settle;
                image.src = attachment.url;
            });
        },
        [commit]
    );

    const remove = useCallback(
        (id: string) => {
            const target = current.current.find(attachment => attachment.id === id);
            if (target) URL.revokeObjectURL(target.url);
            commit(current.current.filter(attachment => attachment.id !== id));
        },
        [commit]
    );

    const dismissNotice = useCallback(() => setNotice(null), []);

    return { attachments, addFiles, remove, clear, notice, dismissNotice };
};

export type ImageAttachments = ReturnType<typeof useImageAttachments>;
