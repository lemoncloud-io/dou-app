import { useEffect, type RefObject } from 'react';
import { Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

export interface ComposerEditState {
    targetId: string;
    original: string;
    draft: string;
    onDraftChange: (value: string) => void;
    isSaving: boolean;
    hasFailed: boolean;
    onSave: () => void;
    onCancel: () => void;
}

export interface ComposerEditBarProps {
    edit: ComposerEditState;
    inputRef: RefObject<HTMLTextAreaElement | null>;
}

export const ComposerEditBar = ({ edit, inputRef }: ComposerEditBarProps) => {
    const { t } = useTranslation();

    useEffect(() => {
        const node = inputRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
    }, [edit.targetId, edit.hasFailed, inputRef]);

    const status = edit.isSaving ? 'saving' : edit.hasFailed ? 'failed' : 'quote';

    return (
        <div
            data-testid="composer-edit-bar"
            className="mb-2 flex items-center gap-2 rounded-2xl border border-input-border bg-background px-3 py-2"
        >
            <Pencil aria-hidden size={16} className="shrink-0 text-main-accent" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] font-semibold text-main-accent">{t('chat.room.editMessage')}</span>
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
