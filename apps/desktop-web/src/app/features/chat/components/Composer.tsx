import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

interface ComposerProps {
    disabled: boolean;
    onSend: (content: string) => void;
}

const MAX_HEIGHT = 160;

export const Composer = ({ disabled, onSend }: ComposerProps) => {
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const resize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    };

    const submit = () => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setValue('');
        requestAnimationFrame(resize);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    const canSend = value.trim().length > 0 && !disabled;

    return (
        <div className="px-4 pb-4 pt-1">
            <div
                className={cn(
                    'flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 transition-colors',
                    'focus-within:border-focus-border'
                )}
            >
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={value}
                    disabled={disabled}
                    onChange={e => {
                        setValue(e.target.value);
                        resize();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.composer.placeholder')}
                    className="max-h-40 flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-placeholder disabled:opacity-50"
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={!canSend}
                    title={t('chat.composer.send')}
                    className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all',
                        canSend
                            ? 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
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
            <p className="mt-1 px-1 text-[11px] text-muted-foreground">{t('chat.composer.hint')}</p>
        </div>
    );
};
