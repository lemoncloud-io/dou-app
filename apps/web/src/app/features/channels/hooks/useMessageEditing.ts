import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import { logger } from '@chatic/bridges';

import type { ClientChatView } from '../types';
import type { MessageEditState } from '../components/ChannelMessageRow';
import { useChatMutations } from './useChatMutations';

/**
 * Editing and server-deleting one message, for whichever surface is showing it.
 *
 * One hook rather than a copy in the room and another in the thread: both render the same sheet
 * and both must reach the same verdict about the same message, so a second copy is a second chance
 * to drift. The surfaces differ only in which list they draw.
 *
 * What it holds is a small state machine over ONE target at a time — a phone shows one editor.
 * The target's draft plus its in-flight/failed flags are the three states an editor can be in;
 * the fourth, read, is simply the absence of a target.
 */
export const useMessageEditing = (scopeKey?: string) => {
    const { t } = useTranslation();
    const { editMessage, deleteServerMessage, isPending } = useChatMutations();

    const [editTarget, setEditTarget] = useState<ClientChatView | null>(null);
    const [draft, setDraft] = useState('');
    const [editFailed, setEditFailed] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ClientChatView | null>(null);
    // Asked before throwing away typed changes — the back gesture and leaving the room are the
    // other ways out, and a confirm on cancel alone would let them slip past it.
    const [discardOpen, setDiscardOpen] = useState(false);

    const editingId = editTarget?.id ?? '';
    const isSaving = !!editingId && isPending.edit.has(editingId);
    const isDeleting = !!deleteTarget?.id && isPending.deleteServer.has(deleteTarget.id);

    /**
     * Opens the editor on a message.
     *
     * Seeded from `message.content` — the message's BODY. The bubble truncates at 200 characters
     * for display, and seeding the editor from what is drawn would silently drop everything past
     * the cut the moment the person saved. There is a test for exactly that.
     */
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

    /**
     * Drops the target when the surface moves to another conversation.
     *
     * The room is routed without a key, so going room → room re-derives this page in place instead
     * of remounting it. A target left behind then matches no row on the new screen: no editor is
     * drawn, yet `isEditing` still locks the composer, and there is no control left to clear it.
     * The delete target has the same problem, and would quote the previous room's message.
     */
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

    /**
     * True when there is typed-but-unsaved work, so callers can gate the ways out of the screen.
     *
     * Trimmed on both sides, the same as `saveEdit`'s no-op check: a trailing space is not work,
     * and treating it as work raised a discard confirm over a change that saving would have
     * thrown away anyway.
     */
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
        // Empty is not a delete, and unchanged is not a save. Neither is worth a round trip, and
        // an empty save would look like a delete that left the message there.
        if (!next || next === (editTarget.content ?? '').trim()) {
            closeEdit();
            return;
        }
        setEditFailed(false);
        try {
            await editMessage(editTarget.id, next);
            // Closed only now. Until the server has it, the editor holds the only copy of what was
            // typed, so closing on the press would mean a failure has nothing to come back to.
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
            // The message is untouched — the repository writes nothing before the server answers —
            // so there is nothing to undo and nothing to explain beyond "it did not happen".
            setDeleteTarget(null);
            toast({ title: t('chat.room.deleteMessageFailed'), variant: 'destructive' });
        }
    }, [deleteTarget, deleteServerMessage, t]);

    /** The row's edit props for `message`, or undefined when it is not the one being edited. */
    const editStateFor = useCallback(
        (message: ClientChatView): MessageEditState | undefined => {
            if (!editTarget?.id || message.id !== editTarget.id) return undefined;
            return {
                draft,
                onDraftChange: setDraft,
                isSaving,
                hasFailed: editFailed,
                onSave: () => void saveEdit(),
                onCancel: requestCloseEdit,
            };
        },
        [editTarget, draft, isSaving, editFailed, saveEdit, requestCloseEdit]
    );

    return {
        /** Truthy while an editor is open — the surfaces lock their composer against it. */
        isEditing: !!editTarget,
        hasUnsavedEdit,
        startEdit,
        requestCloseEdit,
        closeEdit,
        editStateFor,
        deleteTarget,
        requestDelete: setDeleteTarget,
        cancelDelete: () => setDeleteTarget(null),
        confirmDelete,
        isDeleting,
        discardOpen,
        setDiscardOpen,
    };
};
