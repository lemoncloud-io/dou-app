import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

interface ComposerProps {
    disabled: boolean;
    onSend: (content: string) => void;
}

export const Composer = ({ disabled, onSend }: ComposerProps) => {
    const { t } = useTranslation();
    const [value, setValue] = useState('');

    const submit = () => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <div className="border-t border-border p-3">
            <textarea
                rows={1}
                value={value}
                disabled={disabled}
                onChange={e => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('chat.composer.placeholder')}
                className={cn(
                    'w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none',
                    'focus:border-focus-border disabled:opacity-50'
                )}
            />
        </div>
    );
};
