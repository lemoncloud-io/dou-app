import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

// Where the field stops growing and scrolls inside itself, matching the composer's own ceiling.
// A long message must be editable in full without the editor eating the conversation around it.
const MAX_HEIGHT_PX = 279;

export interface MessageEditorProps {
    /** Controlled draft. Seeded by the owner from the message's BODY — never the truncated bubble text. */
    value: string;
    onChange: (value: string) => void;
    /** Locked while the save is in flight; the editor stays open and keeps the draft. */
    isSaving: boolean;
    /** Set when the last save was rejected. The draft survives and can be saved again. */
    hasFailed: boolean;
    onSave: () => void;
    onCancel: () => void;
}

/**
 * In-place editor for one message: the bubble becomes a field where it sits, so the conversation
 * around it stays put and the position itself says which message is being changed. A dedicated
 * edit screen would cut that context and give the phone a second message-action surface.
 *
 * Save does NOT close this. It locks the field and waits, and a rejection lands back here with the
 * typed text still in it — on a phone, which fails more often than a desktop does, closing on the
 * press means a failure has nowhere to return to and the person's words are gone. The parent owns
 * `isSaving`/`hasFailed`; this component only draws the four states (read is the parent not
 * rendering it at all).
 *
 * Cancel is always visible because there is no Esc on a phone. Discarding an unsaved change is
 * confirmed by the parent, which is the one that knows about the other ways out of the screen
 * (leaving the room, the back gesture).
 */
export const MessageEditor = ({ value, onChange, isSaving, hasFailed, onSave, onCancel }: MessageEditorProps) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLTextAreaElement>(null);

    // Grow with the text up to the ceiling, then scroll — measured from `scrollHeight`, which needs
    // the height reset first or it only ever reports the height we already set.
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        node.style.height = 'auto';
        node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
        node.style.overflowY = node.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden';
    }, [value]);

    // Focus with the caret at the end — an edit usually appends or fixes the tail, and selecting
    // the whole body would make the first keystroke destroy it. `scrollIntoView` keeps the message
    // above the keyboard that focusing just raised.
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
        node.scrollIntoView({ block: 'center' });
    }, []);

    const trimmed = value.trim();
    const canSave = !isSaving && trimmed.length > 0;

    return (
        <div className="flex w-full min-w-0 flex-col gap-2">
            <textarea
                ref={ref}
                value={value}
                onChange={event => onChange(event.target.value)}
                disabled={isSaving}
                rows={1}
                aria-label={t('chat.room.editMessage')}
                className={cn(
                    'w-full resize-none rounded-2xl border bg-background px-3 py-2 text-[15px] leading-[1.45] outline-none',
                    'focus:border-main-accent disabled:opacity-60',
                    hasFailed ? 'border-destructive' : 'border-input-border'
                )}
            />
            {hasFailed && (
                // Says it can be retried because it can: the draft is still here and Save is live.
                <span className="text-[12px] text-destructive">{t('chat.room.editFailed')}</span>
            )}
            <div className="flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSaving}
                    className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground disabled:opacity-50"
                >
                    {t('common.cancel')}
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!canSave}
                    className="flex items-center gap-1.5 rounded-full bg-main-accent px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                    {isSaving && (
                        <span
                            aria-hidden
                            className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                    )}
                    {isSaving ? t('chat.room.editSaving') : t('chat.room.editSave')}
                </button>
            </div>
        </div>
    );
};
