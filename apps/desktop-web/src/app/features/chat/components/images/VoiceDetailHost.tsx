import { useState } from 'react';
import { create } from 'zustand';

import { DeleteFileConfirm } from './DeleteFileConfirm';
import type { ImageAuthor } from './ImageViewer';
import { VoiceDetailDialog } from './VoiceDetailDialog';

export interface VoiceDetailRequest {
    src: string;
    name: string;
    size?: number;
    author: ImageAuthor;
    onSave: () => void;
    onShowInChat?: () => void;
    onReply?: () => void;
    /** Deletes the message, unasked: the host asks first, since the row that would may be gone. */
    onDelete?: () => void;
}

/**
 * The open voice detail, outside the feed row that asked for it. A row is unmounted when the feed's
 * window moves past it — a busy channel following its tail does that while a dialog is open — and a
 * dialog inside it would close with it and stop the file it was playing.
 */
export const useVoiceDetailStore = create<{
    request: VoiceDetailRequest | null;
    open: (request: VoiceDetailRequest) => void;
    close: () => void;
}>(set => ({
    request: null,
    open: request => set({ request }),
    close: () => set({ request: null }),
}));

/** Mounted once, beside the app's panes, so the dialog outlives the row it came from. */
export const VoiceDetailHost = () => {
    const request = useVoiceDetailStore(s => s.request);
    const close = useVoiceDetailStore(s => s.close);
    // The delete waiting on its confirm. Kept here, not in the dialog: the dialog closes as it asks.
    const [pendingDelete, setPendingDelete] = useState<(() => void) | null>(null);
    const onDelete = request?.onDelete;
    return (
        <>
            {request && (
                // Keyed by address: a second file opened in its place starts its own dialog, not the last one's.
                <VoiceDetailDialog
                    key={request.src}
                    {...request}
                    onDelete={onDelete && (() => setPendingDelete(() => onDelete))}
                    onClose={close}
                />
            )}
            {pendingDelete && (
                <DeleteFileConfirm
                    onCancel={() => setPendingDelete(null)}
                    onConfirm={() => {
                        setPendingDelete(null);
                        pendingDelete();
                    }}
                />
            )}
        </>
    );
};
