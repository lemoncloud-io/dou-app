import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { logger } from '@chatic/bridges';

import type { ClientChatView } from '../types';
import { deleteConfirmQuote } from '../utils/messagePlainText';
import type { ComposerEditState } from '../components/ComposerEditBar';
import { useChatMutations } from './useChatMutations';

export const useMessageEditing = (scopeKey?: string) => {
    const { t } = useTranslation();
    const { editMessage, deleteServerMessage, isPending } = useChatMutations();

    const [editTarget, setEditTarget] = useState<ClientChatView | null>(null);
    const [draft, setDraft] = useState('');
    const [editFailed, setEditFailed] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ClientChatView | null>(null);
    const [discardOpen, setDiscardOpen] = useState(false);

    const editingId = editTarget?.id ?? '';
    const isSaving = !!editingId && isPending.edit.has(editingId);
    const isDeleting = !!deleteTarget?.id && isPending.deleteServer.has(deleteTarget.id);

    const startEdit = useCallback((message: ClientChatView) => {
        setEditTarget(message);
        setDraft(message.content ?? '');
        setEditFailed(false);
    }, []);

    const closeEdit = useCallback(() => {
        setEditTarget(null);
        setDraft('');
        setEditFailed(false);
        setDiscardOpen(false);
    }, []);

    const previousScope = useRef(scopeKey);
    useEffect(() => {
        if (previousScope.current === scopeKey) return;
        previousScope.current = scopeKey;
        setEditTarget(null);
        setDraft('');
        setEditFailed(false);
        setDiscardOpen(false);
        setDeleteTarget(null);
    }, [scopeKey]);

    const hasUnsavedEdit = !!editTarget && draft.trim() !== (editTarget.content ?? '').trim();

    const requestCloseEdit = useCallback(() => {
        if (hasUnsavedEdit) {
            setDiscardOpen(true);
            return;
        }
        closeEdit();
    }, [hasUnsavedEdit, closeEdit]);

    const saveEdit = useCallback(async () => {
        if (!editTarget?.id) return;
        const next = draft.trim();
        if (!next || next === (editTarget.content ?? '').trim()) {
            closeEdit();
            return;
        }
        setEditFailed(false);
        try {
            await editMessage(editTarget.id, next);
            closeEdit();
        } catch (error) {
            logger.error('CHAT', 'Failed to edit message', { error, data: { id: editTarget.id } });
            setEditFailed(true);
        }
    }, [editTarget, draft, editMessage, closeEdit]);

    const confirmDelete = useCallback(async () => {
        const target = deleteTarget;
        if (!target?.id) return;
        try {
            await deleteServerMessage(target.id);
            setDeleteTarget(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to delete message', { error, data: { id: target.id } });
            setDeleteTarget(null);
            toast({ title: t('chat.room.deleteMessageFailed'), variant: 'destructive' });
        }
    }, [deleteTarget, deleteServerMessage, t]);

    const composer = useMemo<ComposerEditState | undefined>(() => {
        if (!editTarget?.id) return undefined;
        return {
            targetId: editTarget.id,
            original: deleteConfirmQuote(editTarget.content),
            draft,
            onDraftChange: setDraft,
            isSaving,
            hasFailed: editFailed,
            onSave: () => void saveEdit(),
            onCancel: requestCloseEdit,
        };
    }, [editTarget, draft, isSaving, editFailed, saveEdit, requestCloseEdit]);

    const isEditTarget = useCallback(
        (message: ClientChatView) => !!editTarget?.id && message.id === editTarget.id,
        [editTarget]
    );

    return {
        isEditing: !!editTarget,
        hasUnsavedEdit,
        startEdit,
        requestCloseEdit,
        closeEdit,
        composer,
        isEditTarget,
        deleteTarget,
        requestDelete: setDeleteTarget,
        cancelDelete: () => setDeleteTarget(null),
        confirmDelete,
        isDeleting,
        discardOpen,
        setDiscardOpen,
    };
};
