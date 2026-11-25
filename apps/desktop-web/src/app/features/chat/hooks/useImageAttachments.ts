import { useCallback } from 'react';
import { create } from 'zustand';

import { chatAttachmentFormat, type ChatUploadKind } from '@chatic/runtime-react';

import { attachmentKey, validateAttachments, type AttachmentRejection, type ChatImage } from '../utils';

export interface ComposerAttachment extends ChatImage {
    key: string;
    file: File;
    kind: ChatUploadKind;
    size: number;
}

let nextId = 0;

const NO_ATTACHMENTS: ComposerAttachment[] = [];

export interface RefusedFile {
    name: string;
    reason: AttachmentRejection;
    max?: number;
}

export const useUnsendableFilesStore = create<{
    request: { refused: RefusedFile[]; restCount: number; onUploadRest?: () => void } | null;
    close: () => void;
}>(set => ({ request: null, close: () => set({ request: null }) }));

const useTrayStore = create<{ trays: Record<string, ComposerAttachment[]> }>(() => ({ trays: {} }));

const trayOf = (scopeKey: string): ComposerAttachment[] => useTrayStore.getState().trays[scopeKey] ?? NO_ATTACHMENTS;

const setTray = (scopeKey: string, next: ComposerAttachment[]) =>
    useTrayStore.setState(state => {
        if (next.length > 0) return { trays: { ...state.trays, [scopeKey]: next } };
        if (!(scopeKey in state.trays)) return state;
        const { [scopeKey]: _dropped, ...rest } = state.trays;
        return { trays: rest };
    });

export const useImageAttachments = (scopeKey: string) => {
    const attachments = useTrayStore(state => state.trays[scopeKey] ?? NO_ATTACHMENTS);

    const clear = useCallback(() => {
        trayOf(scopeKey).forEach(attachment => URL.revokeObjectURL(attachment.url));
        setTray(scopeKey, []);
    }, [scopeKey]);

    const addFiles = useCallback(
        (files: readonly File[], folders?: ReadonlySet<File>) => {
            const tray = trayOf(scopeKey);
            const { accepted, refused } = validateAttachments(
                tray.map(attachment => attachment.key),
                files,
                file => !!folders?.has(file)
            );
            const add = () => {
                if (accepted.length === 0) return;
                const added = accepted.map((file): ComposerAttachment => {
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
