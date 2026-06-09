import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Smile } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { useComposerDraftStore } from '../../../shared';

interface ComposerProps {
    disabled: boolean;
    onSend: (content: string) => void;
    /** Channel the draft belongs to — preserves unsent text across switches. */
    channelId: string;
    /** Overrides the default "Message" placeholder (e.g. "Message #general"). */
    placeholder?: string;
}

const MAX_HEIGHT = 160;

// Curated quick-pick set — a small, common spread, not a full emoji keyboard.
const EMOJIS = [
    '😀',
    '😂',
    '😊',
    '😍',
    '😎',
    '🤔',
    '😅',
    '😭',
    '👍',
    '👎',
    '🙏',
    '👏',
    '🙌',
    '🔥',
    '🎉',
    '✨',
    '❤️',
    '💯',
    '👀',
    '✅',
    '❌',
    '⚡',
    '🚀',
    '😴',
];

export const Composer = ({ disabled, onSend, channelId, placeholder }: ComposerProps) => {
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const setDraft = useComposerDraftStore(s => s.setDraft);
    const clearDraft = useComposerDraftStore(s => s.clearDraft);
    const placeholderText = placeholder ?? t('chat.composer.placeholder');

    const resize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    };

    // Load this channel's saved draft on switch (read once — no subscription),
    // then focus so you can type immediately.
    useEffect(() => {
        setValue(useComposerDraftStore.getState().drafts[channelId] ?? '');
        const raf = requestAnimationFrame(() => {
            resize();
            textareaRef.current?.focus();
        });
        return () => cancelAnimationFrame(raf);
    }, [channelId]);

    const handleChange = (next: string) => {
        setValue(next);
        setDraft(channelId, next);
        resize();
    };

    const submit = () => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setValue('');
        clearDraft(channelId);
        requestAnimationFrame(resize);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    const insertEmoji = (emoji: string) => {
        const el = textareaRef.current;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + emoji + value.slice(end);
        handleChange(next);
        requestAnimationFrame(() => {
            const pos = start + emoji.length;
            el?.focus();
            el?.setSelectionRange(pos, pos);
            resize();
        });
    };

    const canSend = value.trim().length > 0 && !disabled;

    return (
        <div className="px-4 pb-4 pt-1">
            <div
                className={cn(
                    'border-hairline flex items-end gap-2 rounded-xl border bg-elevated px-3 py-2 shadow-raised transition-colors ease-tactile',
                    'focus-within:ring-2 focus-within:ring-primary/40'
                )}
            >
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={value}
                    disabled={disabled}
                    onChange={e => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    aria-label={placeholderText}
                    placeholder={placeholderText}
                    className="max-h-40 flex-1 resize-none bg-transparent text-body text-foreground outline-none placeholder:text-placeholder disabled:opacity-50"
                />
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            disabled={disabled}
                            title={t('chat.composer.emoji')}
                            aria-label={t('chat.composer.emoji')}
                            className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                            <Smile className="h-5 w-5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="top" className="w-auto p-2">
                        <div className="grid grid-cols-8 gap-0.5">
                            {EMOJIS.map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => insertEmoji(emoji)}
                                    className="focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors ease-tactile hover:bg-accent"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!canSend}
                    title={t('chat.composer.send')}
                    className={cn(
                        'focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all ease-tactile',
                        canSend
                            ? 'bg-primary text-primary-foreground hover:opacity-90'
                            : 'bg-muted text-muted-foreground'
                    )}
                >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path
                            d="M3 10l14-7-5 14-2.5-5.5L3 10z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>
            </div>
            <p className="mt-1 px-1 text-caption text-muted-foreground">{t('chat.composer.hint')}</p>
        </div>
    );
};
