import { useEffect, type RefObject } from 'react';
import { Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

/**
 * What the composer needs while it is editing a message instead of writing a new one. Absent means
 * the composer is writing — one optional object rather than loose props that could disagree.
 */
export interface ComposerEditState {
    /** The message being edited, so the bar can re-run its focus when the target changes. */
    targetId: string;
    /** The message's body, flattened to one line and quoted in the bar so you can see which one. */
    original: string;
    draft: string;
    onDraftChange: (value: string) => void;
    /** Locked while the save is in flight; the composer keeps the draft and waits. */
    isSaving: boolean;
    /** Set when the last save was rejected. The draft survives and can be saved again. */
    hasFailed: boolean;
    onSave: () => void;
    onCancel: () => void;
}

export interface ComposerEditBarProps {
    edit: ComposerEditState;
    /** The composer's own field — the edit happens there, so that is where the caret goes. */
    inputRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The strip above the composer while a message is being edited: what is happening, which message,
 * and the way out.
 *
 * The edit is typed into the composer itself rather than into a field inside the bubble. The bubble
 * is often narrow and sits wherever the message happens to be, and a second text field on the same
 * screen leaves you guessing which one the keyboard is feeding. This strip carries what the
 * in-bubble field used to say by its position — which message — as a one-line quote.
 *
 * Cancel is always visible because a phone has no Esc. Discarding typed changes is confirmed by the
 * parent, which owns the edit's state.
 */
export const ComposerEditBar = ({ edit, inputRef }: ComposerEditBarProps) => {
    const { t } = useTranslation();

    // Caret at the end of the seeded text — an edit usually fixes or extends the tail, and selecting
    // the whole body would let the first keystroke destroy it. Keyed on the target so picking another
    // message to edit moves the caret too, and on a failed save: the field is disabled while saving,
    // which takes the focus and the keyboard with it, and the retry belongs back in the field.
    useEffect(() => {
        const node = inputRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
    }, [edit.targetId, edit.hasFailed, inputRef]);

    // The second line says what is going on: saving, the save failed, or which message this is.
    const status = edit.isSaving ? 'saving' : edit.hasFailed ? 'failed' : 'quote';

    return (
        <div
            data-testid="composer-edit-bar"
            className="mb-2 flex items-center gap-2 rounded-2xl border border-input-border bg-background px-3 py-2"
        >
            <Pencil aria-hidden size={16} className="shrink-0 text-main-accent" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] font-semibold text-main-accent">{t('chat.room.editMessage')}</span>
                {/* Announced, so a screen reader hears the save start and fail as the screen shows it.
                    The failure says it can be retried because it can: the draft is still in the field
                    and the send button is live. */}
                <span
                    aria-live="polite"
                    className={cn(
                        'flex min-w-0 items-center gap-1.5 text-[12px]',
                        status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                    )}
                >
                    {status === 'saving' && (
                        <span
                            aria-hidden
                            className="size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                    )}
                    <span className="truncate">
                        {status === 'saving'
                            ? t('chat.room.editSaving')
                            : status === 'failed'
                              ? t('chat.room.editFailed')
                              : edit.original}
                    </span>
                </span>
            </div>
            <button
                type="button"
                onClick={edit.onCancel}
                disabled={edit.isSaving}
                aria-label={t('chat.room.editCancel')}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-50"
            >
                <X size={16} />
            </button>
        </div>
    );
};
