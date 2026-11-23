import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { DeleteFileConfirm } from './DeleteFileConfirm';
import { VoiceDetailDialog, type VoiceDetailDialogProps } from './VoiceDetailDialog';

export type VoiceDetailRequest = Omit<VoiceDetailDialogProps, 'onClose'>;

export const useVoiceDetailStore = create<{
    request: VoiceDetailRequest | null;
    open: (request: VoiceDetailRequest) => void;
    close: () => void;
}>(set => ({
    request: null,
    open: request => set({ request }),
    close: () => set({ request: null }),
}));

export const VoiceDetailHost = () => {
    const request = useVoiceDetailStore(s => s.request);
    const close = useVoiceDetailStore(s => s.close);
    useEffect(() => close, [close]);
    const [pendingDelete, setPendingDelete] = useState<(() => void) | null>(null);
    const onDelete = request?.onDelete;
    return (
        <>
            {request && (
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
