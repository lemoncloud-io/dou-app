import { useCallback } from 'react';
import { create } from 'zustand';

import { chatAttachmentFormat, type ChatUploadKind } from '@chatic/data';

import { attachmentKey, validateAttachments, type AttachmentRejection, type ChatImage } from '../utils';

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

const NO_ATTACHMENTS: ComposerAttachment[] = [];

/** A file a batch could not take, as the unsendable-files dialog names it. */
export interface RefusedFile {
    name: string;
    reason: AttachmentRejection;
    /** The ceiling it went over: bytes for `too-large`, files for `limit`. */
    max?: number;
}

/**
 * The batch waiting on the unsendable-files dialog: what was refused, and — when anything fits — the
 * way to add the rest. One at a time: the dialog is modal, so no second batch arrives while it is open.
 */
export const useUnsendableFilesStore = create<{
    request: { refused: RefusedFile[]; restCount: number; onUploadRest?: () => void } | null;
    close: () => void;
}>(set => ({ request: null, close: () => set({ request: null }) }));

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
 * Each file gets an object URL: an image's tile draws it, and the preview opens an image, a video, a PDF, a text file or a voice file from it. The upload itself starts only at send,
 * on the message's own row. URLs are revoked on remove and on clear (the send clears the tray; the
 * sent row keeps its own previews) — not when the composer moves to another conversation or
 * unmounts, since the tray waits there for the way back.
 *
 * When a batch holds files that cannot be sent, nothing is added yet: the unsendable-files dialog
 * names each one with its reason, and adds the rest only on "Upload the other n"
 * (Figma "보낼 수 없는 파일"). A toast that counted refusals by reason said how many but not which,
 * and added the rest unasked.
 */
export const useImageAttachments = (scopeKey: string) => {
    const attachments = useTrayStore(state => state.trays[scopeKey] ?? NO_ATTACHMENTS);

    const clear = useCallback(() => {
        trayOf(scopeKey).forEach(attachment => URL.revokeObjectURL(attachment.url));
        setTray(scopeKey, []);
    }, [scopeKey]);

    const addFiles = useCallback(
        (files: readonly File[], folders?: ReadonlySet<File>) => {
            // Read from the store, not the render, so two drops landing before a render are both
            // checked against the tray as it is right now.
            const tray = trayOf(scopeKey);
            const { accepted, refused } = validateAttachments(
                tray.map(attachment => attachment.key),
                files,
                file => !!folders?.has(file)
            );
            const add = () => {
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
                setTray(scopeKey, [...trayOf(scopeKey), ...added]);
            };
            if (refused.length === 0) {
                add();
                return;
            }
            useUnsendableFilesStore.setState({
                request: {
                    refused: refused.map(({ file, reason, max }) => ({ name: file.name, reason, max })),
                    restCount: accepted.length,
                    onUploadRest: accepted.length > 0 ? add : undefined,
                },
            });
        },
        [scopeKey]
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
